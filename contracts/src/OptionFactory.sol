// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Option} from "./Option.sol";

/// @notice Whole-fill requests and isolated, fully collateralized options for one token pair.
contract OptionFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;
    error InvalidPair();
    error InvalidTerms();
    error InvalidLotSize();
    error RequestUnavailable();
    error RequestExpired();
    error Unauthorized();
    error UnsupportedTokenTransfer();

    enum RequestState { Open, Accepted, Cancelled }
    struct BuyRequest {
        address buyer;
        Option.OptionType optionType;
        uint256 underlyingAmount;
        uint256 strikeTotal;
        uint256 premium;
        uint64 expiry;
        uint64 acceptUntil;
        RequestState state;
        address option;
    }

    address public immutable underlying;
    address public immutable quote;
    uint256 public immutable lotSize;
    address[] public options;
    BuyRequest[] private buyRequests;
    /// @notice Reserved premiums only; unsolicited token donations are not user deposits.
    uint256 public reservedPremium;
    uint256 public constant version = 3;

    event OptionCreated(address indexed option, address indexed writer, Option.OptionType optionType);
    event RequestCreated(uint256 indexed requestId, address indexed buyer);
    event RequestAccepted(uint256 indexed requestId, address indexed writer, address indexed option);
    event RequestCancelled(uint256 indexed requestId, address indexed buyer);

    constructor(address underlying_, address quote_) {
        if (underlying_ == quote_ || underlying_.code.length == 0 || quote_.code.length == 0) revert InvalidPair();
        uint8 decimals = IERC20Metadata(underlying_).decimals();
        if (decimals == 0 || decimals > 77) revert InvalidPair();
        underlying = underlying_;
        quote = quote_;
        lotSize = 10 ** (decimals - 1); // Exactly 0.1 raw token, never adjusted shares.
    }

    function optionCount() external view returns (uint256) { return options.length; }
    function requestCount() external view returns (uint256) { return buyRequests.length; }
    function getRequest(uint256 id) public view returns (BuyRequest memory) {
        if (id >= buyRequests.length) revert RequestUnavailable();
        return buyRequests[id];
    }

    function _validate(uint256 quantity, uint256 strike, uint256 premium, uint64 expiry) private view {
        if (quantity == 0 || quantity % lotSize != 0) revert InvalidLotSize();
        if (strike == 0 || premium == 0 || expiry <= block.timestamp) revert InvalidTerms();
    }

    /// @dev The writer approves THIS factory for collateral. One option covers the entire quantity.
    function createOption(Option.OptionType kind, uint256 quantity, uint256 strike, uint256 premium, uint64 expiry)
        external nonReentrant returns (address)
    {
        _validate(quantity, strike, premium, expiry);
        return address(_create(msg.sender, kind, quantity, strike, premium, expiry));
    }

    /// @notice Reserve the full premium. No option or writer obligation exists until acceptance.
    function createRequest(Option.OptionType kind, uint256 quantity, uint256 strike, uint256 premium, uint64 expiry, uint64 acceptUntil)
        external nonReentrant returns (uint256 id)
    {
        _validate(quantity, strike, premium, expiry);
        if (acceptUntil <= block.timestamp || acceptUntil >= expiry) revert InvalidTerms();
        id = buyRequests.length;
        buyRequests.push(BuyRequest(msg.sender, kind, quantity, strike, premium, expiry, acceptUntil, RequestState.Open, address(0)));
        reservedPremium += premium;
        _transferExact(IERC20(quote), msg.sender, address(this), premium);
        emit RequestCreated(id, msg.sender);
    }

    /// @notice Accept the complete immutable request. Collateral, buyer assignment and payment are atomic.
    function acceptRequest(uint256 id) external nonReentrant returns (address option) {
        BuyRequest memory r = getRequest(id);
        if (r.state != RequestState.Open) revert RequestUnavailable();
        if (msg.sender == r.buyer) revert Unauthorized();
        if (block.timestamp >= r.acceptUntil) revert RequestExpired();
        buyRequests[id].state = RequestState.Accepted;
        reservedPremium -= r.premium;
        Option created = _create(msg.sender, r.optionType, r.underlyingAmount, r.strikeTotal, r.premium, r.expiry);
        option = address(created);
        buyRequests[id].option = option;
        created.activateRequestedPurchase(r.buyer);
        _transferExact(IERC20(quote), address(this), msg.sender, r.premium);
        emit RequestAccepted(id, msg.sender, option);
    }

    /// @notice The requester can recover an unaccepted premium, including after the acceptance deadline.
    function cancelRequest(uint256 id) external nonReentrant {
        BuyRequest memory r = getRequest(id);
        if (msg.sender != r.buyer) revert Unauthorized();
        if (r.state != RequestState.Open) revert RequestUnavailable();
        buyRequests[id].state = RequestState.Cancelled;
        reservedPremium -= r.premium;
        _transferExact(IERC20(quote), address(this), r.buyer, r.premium);
        emit RequestCancelled(id, r.buyer);
    }

    function _create(address writer, Option.OptionType kind, uint256 quantity, uint256 strike, uint256 premium, uint64 expiry)
        private returns (Option created)
    {
        created = new Option(writer, underlying, quote, kind, quantity, strike, premium, expiry);
        _transferExact(IERC20(created.collateralToken()), writer, address(created), created.collateralAmount());
        created.activateFunding();
        options.push(address(created));
        emit OptionCreated(address(created), writer, kind);
    }

    function _transferExact(IERC20 token, address from, address to, uint256 amount) private {
        uint256 beforeFrom = token.balanceOf(from);
        uint256 beforeTo = token.balanceOf(to);
        if (from == address(this)) token.safeTransfer(to, amount);
        else token.safeTransferFrom(from, to, amount);
        if (token.balanceOf(from) + amount != beforeFrom || token.balanceOf(to) != beforeTo + amount) revert UnsupportedTokenTransfer();
    }
}
