// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PriceIndex} from "./PriceIndex.sol";
import {OptionV4} from "./OptionV4.sol";

/// @notice Funded, single-option price/time orderbook. No privileged matching service.
contract OptionMarketV4 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PriceIndex for PriceIndex.Tree;

    error InvalidPair();
    error InvalidTerms();
    error Unauthorized();
    error OrderUnavailable();
    error SelfTrade();
    error OptionExpired();
    error UnsupportedTokenTransfer();

    enum OrderState {
        None,
        Open,
        Executed,
        Canceled
    }

    struct Series {
        uint8 kind;
        uint32 strike;
        uint64 expiry;
    }

    struct Order {
        address owner;
        bytes32 series;
        address option;
        uint32 price;
        bool buy;
        bool resale;
        OrderState state;
        uint64 previous;
        uint64 next;
    }

    struct Level {
        uint64 head;
        uint64 tail;
        uint64 count;
    }

    struct Book {
        PriceIndex.Tree bids;
        PriceIndex.Tree asks;
        mapping(bool => mapping(uint32 => Level)) levels;
    }

    struct Depth {
        uint32 price;
        uint64 count;
        uint64 firstOrder;
    }

    address public immutable underlying;
    address public immutable quote;
    uint256 public immutable unit;
    uint256 public immutable tickSize;
    uint256 public constant version = 4;
    uint256 public reservedPremium;
    uint64 public orderCount;
    mapping(uint64 => Order) private orders;
    mapping(bytes32 => Series) public series;
    bytes32[] private seriesIds;
    mapping(bytes32 => Book) private books;
    mapping(address => uint64[]) private userOrders;
    mapping(address => address[]) private userOptions;
    mapping(address => mapping(address => bool)) private seenOption;
    mapping(address => bool) public registeredOption;
    mapping(address => uint64) public optionOrder;
    address[] public options;

    event OrderPosted(
        uint64 indexed id,
        bytes32 indexed series,
        address indexed owner,
        bool buy,
        uint32 price,
        address option,
        bool resale
    );
    event OrderExecuted(
        uint64 indexed incoming,
        uint64 indexed resting,
        address indexed option,
        address buyer,
        address seller,
        uint32 price
    );
    event OrderCanceled(uint64 indexed id);
    event OptionCreated(address indexed option, address indexed writer, uint8 optionType);

    constructor(address underlying_, address quote_) {
        if (underlying_ == quote_ || underlying_.code.length == 0 || quote_.code.length == 0) revert InvalidPair();
        uint8 ud = IERC20Metadata(underlying_).decimals();
        uint8 qd = IERC20Metadata(quote_).decimals();
        if (ud > 77 || qd < 2 || qd > 18) revert InvalidPair();
        underlying = underlying_;
        quote = quote_;
        unit = 10 ** ud;
        tickSize = 10 ** (qd - 2);
    }

    function seriesKey(uint8 kind, uint32 strike, uint64 expiry) public pure returns (bytes32) {
        return keccak256(abi.encode(kind, strike, expiry));
    }

    function optionCount() external view returns (uint256) {
        return options.length;
    }

    function getOrder(uint64 id) external view returns (Order memory) {
        return orders[id];
    }

    function _series(uint8 kind, uint32 strike, uint64 expiry) private returns (bytes32 key) {
        if (kind > 1 || strike == 0 || expiry <= block.timestamp) revert InvalidTerms();
        key = seriesKey(kind, strike, expiry);
        if (series[key].expiry == 0) {
            series[key] = Series(kind, strike, expiry);
            seriesIds.push(key);
        }
    }

    function _record(address owner, bytes32 key, bool buy, uint32 price, address option, bool resale)
        private
        returns (uint64 id)
    {
        id = ++orderCount;
        orders[id] = Order(owner, key, option, price, buy, resale, OrderState.Open, 0, 0);
        userOrders[owner].push(id);
    }

    function _append(uint64 id) private {
        Order storage o = orders[id];
        Book storage b = books[o.series];
        Level storage l = b.levels[o.buy][o.price];
        if (l.count == 0) {
            if (o.buy) b.bids.set(o.price, true);
            else b.asks.set(o.price, true);
            l.head = id;
        } else {
            orders[l.tail].next = id;
            o.previous = l.tail;
        }
        l.tail = id;
        ++l.count;
        if (!o.buy) optionOrder[o.option] = id;
        emit OrderPosted(id, o.series, o.owner, o.buy, o.price, o.option, o.resale);
    }

    function _remove(uint64 id, OrderState state_) private {
        Order storage o = orders[id];
        Level storage l = books[o.series].levels[o.buy][o.price];
        if (o.previous == 0) l.head = o.next;
        else orders[o.previous].next = o.next;
        if (o.next == 0) l.tail = o.previous;
        else orders[o.next].previous = o.previous;
        if (--l.count == 0) {
            if (o.buy) books[o.series].bids.set(o.price, false);
            else books[o.series].asks.set(o.price, false);
        }
        o.previous = 0;
        o.next = 0;
        o.state = state_;
        if (!o.buy) optionOrder[o.option] = 0;
    }

    function bestOrder(bytes32 key, bool buy) public view returns (uint64) {
        if (series[key].expiry <= block.timestamp) return 0;
        Book storage b = books[key];
        uint32 price = buy ? b.bids.best(true) : b.asks.best(false);
        return b.levels[buy][price].head;
    }

    function _remember(address owner, address option) private {
        if (!seenOption[owner][option]) {
            seenOption[owner][option] = true;
            userOptions[owner].push(option);
        }
    }

    function _create(address writer, bytes32 key, uint32 premium) private returns (address option) {
        Series memory s = series[key];
        OptionV4 created = new OptionV4(
            writer, underlying, quote, unit, s.kind, uint256(s.strike) * tickSize, uint256(premium) * tickSize, s.expiry
        );
        option = address(created);
        registeredOption[option] = true;
        options.push(option);
        _remember(writer, option);
        _transfer(created.collateralToken(), writer, option, created.collateralAmount());
        created.activateFunding();
        emit OptionCreated(option, writer, s.kind);
    }
    /// @notice No quantity argument: exactly one token and at most one match.

    function placeOrder(uint8 kind, uint32 strike, uint64 expiry, bool buy, uint32 price)
        external
        nonReentrant
        returns (uint64 id)
    {
        if (price == 0) revert InvalidTerms();
        bytes32 key = _series(kind, strike, expiry);
        uint64 resting = bestOrder(key, !buy);
        bool crosses = resting != 0 && (buy ? price >= orders[resting].price : price <= orders[resting].price);
        if (crosses && orders[resting].owner == msg.sender) revert SelfTrade();
        address option;
        if (!buy) option = _create(msg.sender, key, crosses ? orders[resting].price : price);
        id = _record(msg.sender, key, buy, price, option, false);
        if (crosses) {
            _match(id, resting);
        } else {
            if (buy) {
                uint256 premium = uint256(price) * tickSize;
                reservedPremium += premium;
                _transfer(quote, msg.sender, address(this), premium);
            }
            _append(id);
        }
    }

    function placeResale(address option, uint32 price) external nonReentrant returns (uint64 id) {
        if (!registeredOption[option] || price == 0) revert InvalidTerms();
        OptionV4 p = OptionV4(option);
        if (p.buyer() != msg.sender) revert Unauthorized();
        if (p.state() != OptionV4.State.Active || optionOrder[option] != 0) revert OrderUnavailable();
        bytes32 key = _series(p.optionType(), uint32(p.strikeTotal() / tickSize), p.expiry());
        uint64 resting = bestOrder(key, true);
        bool crosses = resting != 0 && price <= orders[resting].price;
        id = _record(msg.sender, key, false, price, option, true);
        if (crosses) {
            _match(id, resting);
        } else {
            p.setListing(uint256(price) * tickSize);
            _append(id);
        }
    }

    function _match(uint64 incoming, uint64 resting) private {
        Order storage a = orders[incoming];
        Order storage b = orders[resting];
        Order storage bid = a.buy ? a : b;
        Order storage ask = a.buy ? b : a;
        OptionV4 p = OptionV4(ask.option);
        if (bid.owner == ask.owner || bid.owner == p.writer()) revert SelfTrade();
        uint32 price = b.price;
        uint256 payment = uint256(price) * tickSize;
        _remove(resting, OrderState.Executed);
        a.state = OrderState.Executed;
        bid.option = ask.option;
        if (!a.buy) reservedPremium -= payment;
        p.fill(bid.owner, payment);
        _remember(bid.owner, ask.option);
        _transfer(quote, a.buy ? bid.owner : address(this), ask.owner, payment);
        emit OrderExecuted(incoming, resting, ask.option, bid.owner, ask.owner, price);
    }

    function cancelOrder(uint64 id) external nonReentrant {
        Order memory o = orders[id];
        if (o.owner != msg.sender) revert Unauthorized();
        if (o.state != OrderState.Open) revert OrderUnavailable();
        _remove(id, OrderState.Canceled);
        if (o.buy) {
            uint256 refund = uint256(o.price) * tickSize;
            reservedPremium -= refund;
            _transfer(quote, address(this), o.owner, refund);
        } else if (!o.resale) {
            OptionV4(o.option).cancel();
        } else if (series[o.series].expiry > block.timestamp) {
            OptionV4(o.option).setListing(0);
        }
        emit OrderCanceled(id);
    }
    /// @notice Direct exercise/reclaim removes its listing without traversing the book.

    function optionClosed() external nonReentrant {
        if (!registeredOption[msg.sender]) revert Unauthorized();
        uint64 id = optionOrder[msg.sender];
        if (id != 0) {
            _remove(id, OrderState.Canceled);
            emit OrderCanceled(id);
        }
    }

    function _transfer(address token, address from, address to, uint256 amount) private {
        IERC20 t = IERC20(token);
        uint256 a = t.balanceOf(from);
        uint256 b = t.balanceOf(to);
        if (from == address(this)) t.safeTransfer(to, amount);
        else t.safeTransferFrom(from, to, amount);
        if (t.balanceOf(from) + amount != a || t.balanceOf(to) != b + amount) revert UnsupportedTokenTransfer();
    }

    function getDepth(bytes32 key, bool buy, uint32 afterPrice, uint8 limit)
        external
        view
        returns (Depth[] memory result)
    {
        if (limit == 0 || limit > 64) revert InvalidTerms();
        result = new Depth[](limit);
        uint256 n;
        if (series[key].expiry > block.timestamp) {
            PriceIndex.Tree storage t = buy ? books[key].bids : books[key].asks;
            uint32 price = afterPrice == 0 ? t.best(buy) : t.next(afterPrice, buy);
            while (price != 0 && n < limit) {
                Level storage l = books[key].levels[buy][price];
                result[n++] = Depth(price, l.count, l.head);
                price = t.next(price, buy);
            }
        }
        assembly {
            mstore(result, n)
        }
    }

    function getLevelOrders(bytes32 key, bool buy, uint32 price, uint64 afterId, uint8 limit)
        external
        view
        returns (uint64[] memory result)
    {
        if (limit == 0 || limit > 64) revert InvalidTerms();
        if (
            afterId != 0
                && (
                    orders[afterId].series != key || orders[afterId].buy != buy || orders[afterId].price != price
                        || orders[afterId].state != OrderState.Open
                )
        ) revert OrderUnavailable();
        result = new uint64[](limit);
        uint256 n;
        uint64 id = afterId == 0 ? books[key].levels[buy][price].head : orders[afterId].next;
        while (id != 0 && n < limit) {
            result[n++] = id;
            id = orders[id].next;
        }
        assembly {
            mstore(result, n)
        }
    }

    function _end(uint256 length, uint256 offset, uint8 limit) private pure returns (uint256) {
        if (limit == 0 || limit > 64 || offset > length) revert InvalidTerms();
        return length - offset < limit ? length : offset + limit;
    }

    function getSeries(uint256 offset, uint8 limit) external view returns (bytes32[] memory result) {
        uint256 end = _end(seriesIds.length, offset, limit);
        result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            result[i - offset] = seriesIds[i];
        }
    }

    function getUserOrders(address user, uint256 offset, uint8 limit) external view returns (uint64[] memory result) {
        uint256 end = _end(userOrders[user].length, offset, limit);
        result = new uint64[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            result[i - offset] = userOrders[user][i];
        }
    }

    function getUserOptions(address user, uint256 offset, uint8 limit)
        external
        view
        returns (address[] memory result)
    {
        uint256 end = _end(userOptions[user].length, offset, limit);
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            result[i - offset] = userOptions[user][i];
        }
    }
}
