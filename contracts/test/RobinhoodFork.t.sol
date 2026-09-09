// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Option} from "../src/Option.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
import {MockUSD} from "../src/MockUSD.sol";

/// @notice Optional RPC compatibility smoke test. All execution and synthetic token balances are LOCAL to the fork.
/// @dev Run with RH_RPC_URL=https://rpc.testnet.chain.robinhood.com forge test --match-contract RobinhoodForkTest -vv.
contract RobinhoodForkTest is Test {
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;

    function testForkTSLACallAndPutDelivery() public {
        string memory rpc = vm.envOr("RH_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 46630);
        assertGt(TSLA.code.length, 0);
        IERC20Metadata stock = IERC20Metadata(TSLA);
        assertEq(stock.decimals(), 18);
        MockUSD usd = new MockUSD();
        OptionFactory factory = new OptionFactory(TSLA, address(usd));
        address writer = makeAddr("fork writer");
        address buyer = makeAddr("fork buyer");
        // forge-std edits fork storage, not public testnet balances. This does not prove faucet availability.
        deal(TSLA, writer, 1e18);
        vm.startPrank(writer);
        stock.approve(address(factory), 0.25e18);
        Option option =
            Option(factory.createOption(Option.OptionType.Call, 0.25e18, 100e6, 5e6, uint64(block.timestamp + 1 days)));
        vm.stopPrank();
        vm.startPrank(buyer);
        usd.faucet();
        usd.approve(address(option), 105e6);
        option.buy();
        option.exercise();
        vm.stopPrank();
        assertEq(stock.balanceOf(writer), 0.75e18);
        assertEq(stock.balanceOf(buyer), 0.25e18);
        assertEq(usd.balanceOf(writer), 105e6);
        assertEq(stock.balanceOf(address(option)), 0);

        // The put writer escrows MockUSD; its buyer delivers the same live token implementation.
        vm.startPrank(writer);
        usd.faucet();
        usd.approve(address(factory), 100e6);
        Option put =
            Option(factory.createOption(Option.OptionType.Put, 0.25e18, 100e6, 5e6, uint64(block.timestamp + 1 days)));
        vm.stopPrank();
        vm.startPrank(buyer);
        usd.approve(address(put), 5e6);
        stock.approve(address(put), 0.25e18);
        put.buy();
        put.exercise();
        vm.stopPrank();
        assertEq(stock.balanceOf(writer), 1e18);
        assertEq(stock.balanceOf(buyer), 0);
        assertEq(usd.balanceOf(writer), 10_010e6);
        assertEq(usd.balanceOf(buyer), 9_990e6);
        assertEq(usd.balanceOf(address(put)), 0);
    }
}
