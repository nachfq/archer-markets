// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOptionBook {
    function optionClosed() external;
}

/// @notice Independent collateral and physical exercise for exactly one token.
contract OptionV4 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error Unauthorized();
    error InvalidState();
    error OptionExpired();
    error NotExpired();
    error UnsupportedTokenTransfer();
    error NotFunded();

    enum State {
        Open,
        Active,
        Exercised,
        Cancelled,
        Expired
    }

    address public immutable factory;
    address public immutable writer;
    address public immutable underlying;
    address public immutable quote;
    uint256 public immutable underlyingAmount;
    uint256 public immutable strikeTotal;
    uint256 public immutable premium;
    uint64 public immutable expiry;
    uint8 public immutable optionType;
    address public buyer;
    State public state;
    bool public funded;
    uint256 public resalePrice;
    uint256 public listingNonce;

    event Bought(address indexed buyer, uint256 premium);
    event Resold(address indexed seller, address indexed buyer, uint256 price, uint256 nonce);
    event Exercised(address indexed buyer);
    event Cancelled();
    event ExpiredReclaimed();

    constructor(
        address writer_,
        address underlying_,
        address quote_,
        uint256 unit_,
        uint8 kind_,
        uint256 strike_,
        uint256 premium_,
        uint64 expiry_
    ) {
        factory = msg.sender;
        writer = writer_;
        underlying = underlying_;
        quote = quote_;
        underlyingAmount = unit_;
        optionType = kind_;
        strikeTotal = strike_;
        premium = premium_;
        expiry = expiry_;
    }

    modifier onlyBook() {
        if (msg.sender != factory) revert Unauthorized();
        _;
    }

    function collateralToken() public view returns (address) {
        return optionType == 0 ? underlying : quote;
    }

    function collateralAmount() public view returns (uint256) {
        return optionType == 0 ? underlyingAmount : strikeTotal;
    }

    function activateFunding() external onlyBook {
        if (funded) revert InvalidState();
        if (IERC20(collateralToken()).balanceOf(address(this)) < collateralAmount()) revert NotFunded();
        funded = true;
    }

    function setListing(uint256 price) external onlyBook {
        if (state != State.Active || block.timestamp >= expiry) revert InvalidState();
        resalePrice = price;
        ++listingNonce;
    }

    function fill(address holder, uint256 price) external onlyBook nonReentrant {
        if (!funded || uint8(state) > 1) revert InvalidState();
        if (block.timestamp >= expiry) revert OptionExpired();
        if (holder == address(0) || holder == writer || holder == buyer) revert Unauthorized();
        address seller = buyer;
        if (state == State.Open) emit Bought(holder, price);
        else emit Resold(seller, holder, price, listingNonce);
        buyer = holder;
        state = State.Active;
        resalePrice = 0;
        ++listingNonce;
    }

    function cancel() external onlyBook nonReentrant {
        if (state != State.Open) revert InvalidState();
        state = block.timestamp >= expiry ? State.Expired : State.Cancelled;
        transferExact(collateralToken(), address(this), writer, collateralAmount());
        emit Cancelled();
    }

    function exercise() external nonReentrant {
        if (msg.sender != buyer) revert Unauthorized();
        if (state != State.Active) revert InvalidState();
        if (block.timestamp >= expiry) revert OptionExpired();
        state = State.Exercised;
        resalePrice = 0;
        ++listingNonce;
        IOptionBook(factory).optionClosed();
        if (optionType == 0) {
            transferExact(quote, buyer, writer, strikeTotal);
            transferExact(underlying, address(this), buyer, underlyingAmount);
        } else {
            transferExact(underlying, buyer, writer, underlyingAmount);
            transferExact(quote, address(this), buyer, strikeTotal);
        }
        emit Exercised(buyer);
    }

    function reclaimExpired() external nonReentrant {
        if (msg.sender != writer) revert Unauthorized();
        if (uint8(state) > 1) revert InvalidState();
        if (block.timestamp < expiry) revert NotExpired();
        state = State.Expired;
        resalePrice = 0;
        ++listingNonce;
        IOptionBook(factory).optionClosed();
        transferExact(collateralToken(), address(this), writer, collateralAmount());
        emit ExpiredReclaimed();
    }

    function transferExact(address token, address from, address to, uint256 amount) private {
        IERC20 t = IERC20(token);
        uint256 a = t.balanceOf(from);
        uint256 b = t.balanceOf(to);
        if (from == address(this)) t.safeTransfer(to, amount);
        else t.safeTransferFrom(from, to, amount);
        if (t.balanceOf(from) + amount != a || t.balanceOf(to) != b + amount) revert UnsupportedTokenTransfer();
    }
}
