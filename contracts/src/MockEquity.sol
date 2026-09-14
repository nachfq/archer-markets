// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Named, unrestricted local demonstration token. Not a real stock claim.
contract MockEquity is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function faucet() external {
        _mint(msg.sender, 1000e18);
    }
}
