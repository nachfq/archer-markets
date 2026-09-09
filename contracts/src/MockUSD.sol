// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Unlimited, valueless test funds. Never a real stablecoin.
contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD (test only)", "MockUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        _mint(msg.sender, 10_000e6);
    }
}
