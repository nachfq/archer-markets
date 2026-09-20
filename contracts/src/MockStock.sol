// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local demonstration token; has no affiliation with Robinhood or TSLA.
contract MockStock is ERC20 {
    constructor() ERC20("Mock Stock (test only)", "MockSTOCK") {}

    function faucet() external {
        _mint(msg.sender, 10e18);
    }
}
