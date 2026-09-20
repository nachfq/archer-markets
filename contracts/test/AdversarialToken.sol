// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Configurable hostile token used to test exact-transfer checks and callback guards.
contract AdversarialToken is ERC20 {
    bool public chargeFee;
    address public callbackTarget;
    bytes public callbackData;
    bytes4 public callbackError;
    bool private callbackRunning;

    constructor() ERC20("Adversarial", "BAD") {}

    function decimals() public pure override returns (uint8) {
        return 1;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFee(bool value) external {
        chargeFee = value;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0) && chargeFee && amount > 0) {
            super._update(from, address(0), 1);
            super._update(from, to, amount - 1);
        } else {
            super._update(from, to, amount);
        }
        if (from != address(0) && callbackTarget != address(0) && !callbackRunning) {
            callbackRunning = true;
            (bool ok, bytes memory result) = callbackTarget.call(callbackData);
            require(!ok, "reentry unexpectedly succeeded");
            if (result.length >= 4) {
                callbackError = bytes4(result);
            }
            callbackRunning = false;
        }
    }
}
