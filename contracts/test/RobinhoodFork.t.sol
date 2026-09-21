// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {OptionMarketV4} from "../src/OptionMarketV4.sol";
import {OptionV4} from "../src/OptionV4.sol";
import {MockUSD} from "../src/MockUSD.sol";

/// @notice Optional V4 compatibility smoke test. Execution and edited balances stay local to the RPC fork.
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
        OptionMarketV4 market = new OptionMarketV4(TSLA, address(usd), address(this), 10_000, 10);
        address writer = makeAddr("fork writer");
        address buyer = makeAddr("fork buyer");
        deal(TSLA, writer, 2e18);
        vm.prank(writer);
        usd.faucet();
        vm.prank(buyer);
        usd.faucet();
        for (uint256 i; i < 2; ++i) {
            address actor = i == 0 ? writer : buyer;
            vm.startPrank(actor);
            stock.approve(address(market), type(uint256).max);
            usd.approve(address(market), type(uint256).max);
            vm.stopPrank();
        }
        uint64 expiry = uint64(block.timestamp + 1 days);

        vm.prank(writer);
        uint64 callAsk = market.placeOrder(0, 10_000, expiry, false, 500);
        vm.prank(buyer);
        market.placeOrder(0, 10_000, expiry, true, 500);
        OptionV4 call = OptionV4(market.getOrder(callAsk).option);
        vm.startPrank(buyer);
        usd.approve(address(call), 100e6);
        call.exercise();
        vm.stopPrank();
        assertEq(stock.balanceOf(writer), 1e18);
        assertEq(stock.balanceOf(buyer), 1e18);

        vm.prank(writer);
        uint64 putAsk = market.placeOrder(1, 10_000, expiry, false, 500);
        vm.prank(buyer);
        market.placeOrder(1, 10_000, expiry, true, 500);
        OptionV4 put = OptionV4(market.getOrder(putAsk).option);
        vm.startPrank(buyer);
        stock.approve(address(put), 1e18);
        put.exercise();
        vm.stopPrank();

        assertEq(stock.balanceOf(writer), 2e18);
        assertEq(stock.balanceOf(buyer), 0);
        assertEq(stock.balanceOf(address(call)), 0);
        assertEq(usd.balanceOf(address(put)), 0);
    }
}
