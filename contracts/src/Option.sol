// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice One fully collateralized, whole-lot, physically delivered American option.
/// @dev Quantities are raw ERC-20 units; corporate-action multipliers never change these terms.
contract Option is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum OptionType {
        Call,
        Put
    }
    enum State {
        Open,
        Active,
        Exercised,
        Cancelled,
        Expired
    }

    error Unauthorized();
    error InvalidTerms();
    error InvalidState();
    error OptionExpired();
    error NotExpired();
    error NotFunded();
    error UnsupportedTokenTransfer();

    address public immutable factory;
    address public immutable writer;
    address public immutable underlying;
    address public immutable quote;
    uint256 public immutable underlyingAmount;
    uint256 public immutable strikeTotal;
    uint256 public immutable premium;
    uint64 public immutable expiry;
    OptionType public immutable optionType;
    address public buyer;
    State public state;
    bool public funded;

    event Bought(address indexed buyer, uint256 premium);
    event Exercised(address indexed buyer);
    event Cancelled();
    event ExpiredReclaimed();

    constructor(
        address writer_,
        address underlying_,
        address quote_,
        OptionType optionType_,
        uint256 underlyingAmount_,
        uint256 strikeTotal_,
        uint256 premium_,
        uint64 expiry_
    ) {
        if (
            writer_ == address(0) || underlying_ == quote_ || underlying_.code.length == 0 || quote_.code.length == 0
                || underlyingAmount_ == 0 || strikeTotal_ == 0 || premium_ == 0 || expiry_ <= block.timestamp
        ) revert InvalidTerms();
        factory = msg.sender;
        writer = writer_;
        underlying = underlying_;
        quote = quote_;
        optionType = optionType_;
        underlyingAmount = underlyingAmount_;
        strikeTotal = strikeTotal_;
        premium = premium_;
        expiry = expiry_;
    }

    /// @dev Called once by the factory, after collateral has arrived atomically.
    ///      Extra unsolicited transfers do not block creation and are never part of the option lot.
    function activateFunding() external nonReentrant {
        if (msg.sender != factory) revert Unauthorized();
        if (funded) revert InvalidState();
        if (IERC20(collateralToken()).balanceOf(address(this)) < collateralAmount()) revert NotFunded();
        funded = true;
    }

    function collateralToken() public view returns (address) {
        return optionType == OptionType.Call ? underlying : quote;
    }

    function collateralAmount() public view returns (uint256) {
        return optionType == OptionType.Call ? underlyingAmount : strikeTotal;
    }

    function buy() external nonReentrant {
        if (!funded) revert NotFunded();
        if (state != State.Open) revert InvalidState();
        if (block.timestamp >= expiry) revert OptionExpired();
        if (msg.sender == writer) revert Unauthorized();
        buyer = msg.sender;
        state = State.Active;
        _transferExact(IERC20(quote), msg.sender, writer, premium);
        emit Bought(msg.sender, premium);
    }

    function exercise() external nonReentrant {
        if (msg.sender != buyer) revert Unauthorized();
        if (state != State.Active) revert InvalidState();
        if (block.timestamp >= expiry) revert OptionExpired();
        state = State.Exercised;
        if (optionType == OptionType.Call) {
            _transferExact(IERC20(quote), buyer, writer, strikeTotal);
            _transferExact(IERC20(underlying), address(this), buyer, underlyingAmount);
        } else {
            _transferExact(IERC20(underlying), buyer, writer, underlyingAmount);
            _transferExact(IERC20(quote), address(this), buyer, strikeTotal);
        }
        emit Exercised(buyer);
    }

    function cancel() external nonReentrant {
        if (msg.sender != writer) revert Unauthorized();
        if (!funded) revert NotFunded();
        if (state != State.Open) revert InvalidState();
        state = State.Cancelled;
        _transferExact(IERC20(collateralToken()), address(this), writer, collateralAmount());
        emit Cancelled();
    }

    function reclaimExpired() external nonReentrant {
        if (msg.sender != writer) revert Unauthorized();
        if (!funded) revert NotFunded();
        if (state != State.Open && state != State.Active) revert InvalidState();
        if (block.timestamp < expiry) revert NotExpired();
        state = State.Expired;
        _transferExact(IERC20(collateralToken()), address(this), writer, collateralAmount());
        emit ExpiredReclaimed();
    }

    /// @dev Reject transfer fees on either side. Supported assets must be non-rebasing ERC-20s.
    function _transferExact(IERC20 token, address from, address to, uint256 amount) private {
        uint256 beforeFrom = token.balanceOf(from);
        uint256 beforeTo = token.balanceOf(to);
        if (from == address(this)) token.safeTransfer(to, amount);
        else token.safeTransferFrom(from, to, amount);
        if (token.balanceOf(from) + amount != beforeFrom || token.balanceOf(to) != beforeTo + amount) {
            revert UnsupportedTokenTransfer();
        }
    }
}
