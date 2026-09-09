// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Option} from "./Option.sol";

/// @notice Creates isolated options for a fixed token pair and escrows the entire collateral atomically.
contract OptionFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;
    error InvalidPair();
    error UnsupportedTokenTransfer();

    address public immutable underlying;
    address public immutable quote;
    address[] public options;

    event OptionCreated(address indexed option, address indexed writer, Option.OptionType optionType);

    constructor(address underlying_, address quote_) {
        if (underlying_ == quote_ || underlying_.code.length == 0 || quote_.code.length == 0) revert InvalidPair();
        underlying = underlying_;
        quote = quote_;
    }

    function optionCount() external view returns (uint256) {
        return options.length;
    }

    /// @dev The writer approves THIS factory for the collateral, not the future option.
    function createOption(
        Option.OptionType optionType,
        uint256 underlyingAmount,
        uint256 strikeTotal,
        uint256 premium,
        uint64 expiry
    ) external nonReentrant returns (address option) {
        Option created = new Option(
            msg.sender, underlying, quote, optionType, underlyingAmount, strikeTotal, premium, expiry
        );
        option = address(created);
        IERC20 collateral = IERC20(created.collateralToken());
        uint256 amount = created.collateralAmount();
        uint256 beforeWriter = collateral.balanceOf(msg.sender);
        uint256 beforeOption = collateral.balanceOf(option);
        collateral.safeTransferFrom(msg.sender, option, amount);
        if (
            collateral.balanceOf(msg.sender) + amount != beforeWriter
                || collateral.balanceOf(option) != beforeOption + amount
        ) {
            revert UnsupportedTokenTransfer();
        }
        created.activateFunding();
        options.push(option);
        emit OptionCreated(option, msg.sender, optionType);
    }
}
