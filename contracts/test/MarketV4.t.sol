// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockStock} from "../src/MockStock.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {OptionMarketV4 as Market} from "../src/OptionMarketV4.sol";
import {OptionV4} from "../src/OptionV4.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AdversarialToken} from "./Option.t.sol";
import {PriceIndex} from "../src/PriceIndex.sol";

contract IndexHarness {
    using PriceIndex for PriceIndex.Tree;

    PriceIndex.Tree private tree;

    function set(uint32 p, bool value) external {
        tree.set(p, value);
    }

    function best(bool high) external view returns (uint32) {
        return tree.best(high);
    }

    function next(uint32 p, bool high) external view returns (uint32) {
        return tree.next(p, high);
    }
}

contract PriceIndexTest is Test {
    function testFuzzBitmapMatchesSortedReference(uint32[32] memory values, uint32 pivot) public {
        IndexHarness index = new IndexHarness();
        for (uint256 i; i < values.length; ++i) {
            if (values[i] != 0) index.set(values[i], true);
        }
        uint32 low;
        uint32 high;
        uint32 above;
        uint32 below;
        for (uint256 i; i < values.length; ++i) {
            uint32 p = values[i];
            if (p == 0) continue;
            if (low == 0 || p < low) low = p;
            if (p > high) high = p;
            if (p > pivot && (above == 0 || p < above)) above = p;
            if (p < pivot && p > below) below = p;
        }
        assertEq(index.best(false), low);
        assertEq(index.best(true), high);
        assertEq(index.next(pivot, false), above);
        assertEq(index.next(pivot, true), below);
        for (uint256 i; i < values.length; ++i) {
            if (values[i] != 0) index.set(values[i], false);
        }
        assertEq(index.best(false), 0);
        assertEq(index.best(true), 0);
    }

    function testBoundaryPricesAndEmptyGaps() public {
        IndexHarness index = new IndexHarness();
        uint32[8] memory ps = [uint32(1), 255, 256, 65535, 65536, 16777215, 16777216, type(uint32).max];
        for (uint256 i; i < ps.length; ++i) {
            index.set(ps[i], true);
        }
        for (uint256 i; i < ps.length; ++i) {
            assertEq(index.next(ps[i], true), i == 0 ? 0 : ps[i - 1]);
            assertEq(index.next(ps[i], false), i == 7 ? 0 : ps[i + 1]);
        }
    }
}

contract MarketV4Test is Test {
    MockStock stock;
    MockUSD usd;
    Market market;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    uint64 expiry;

    function setUp() public {
        vm.warp(1800000000);
        expiry = uint64(block.timestamp + 7 days);
        stock = new MockStock();
        usd = new MockUSD();
        market = new Market(address(stock), address(usd));
        address[3] memory actors = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            deal(address(stock), actors[i], 1000e18);
            deal(address(usd), actors[i], 1e30);
            vm.startPrank(actors[i]);
            stock.approve(address(market), type(uint256).max);
            usd.approve(address(market), type(uint256).max);
            vm.stopPrank();
        }
    }

    function place(address actor, bool buy, uint32 price, uint8 kind) internal returns (uint64) {
        vm.prank(actor);
        return market.placeOrder(kind, 30000, expiry, buy, price);
    }

    function key(uint8 kind) internal view returns (bytes32) {
        return market.seriesKey(kind, 30000, expiry);
    }

    function option(uint64 id) internal view returns (OptionV4) {
        return OptionV4(market.getOrder(id).option);
    }

    function conserve() internal view {
        uint256 q = usd.balanceOf(alice) + usd.balanceOf(bob) + usd.balanceOf(carol) + usd.balanceOf(address(market));
        uint256 s =
            stock.balanceOf(alice) + stock.balanceOf(bob) + stock.balanceOf(carol) + stock.balanceOf(address(market));
        for (uint256 i; i < market.optionCount(); ++i) {
            q += usd.balanceOf(market.options(i));
            s += stock.balanceOf(market.options(i));
        }
        assertEq(q, 3e30);
        assertEq(s, 3000e18);
        assertEq(usd.balanceOf(address(market)), market.reservedPremium());
    }

    function testFuzzBothDirectionsExerciseConserve(bool put, bool bidFirst, uint32 priceSeed) public {
        uint32 p = uint32(bound(priceSeed, 2, 100000));
        uint8 kind = put ? 1 : 0;
        uint64 first = place(bidFirst ? bob : alice, bidFirst, p, kind);
        uint64 second = place(bidFirst ? alice : bob, !bidFirst, bidFirst ? p - 1 : p + 1, kind);
        OptionV4 o = option(second);
        assertEq(address(o), address(option(first)));
        assertEq(o.buyer(), bob);
        assertEq(o.writer(), alice);
        assertEq(o.underlyingAmount(), 1e18);
        assertEq(o.premium(), uint256(p) * 10000);
        assertEq(market.bestOrder(key(kind), true), 0);
        assertEq(market.bestOrder(key(kind), false), 0);
        assertEq(usd.balanceOf(bob), 1e30 - uint256(p) * 10000);
        conserve();
        vm.startPrank(bob);
        stock.approve(address(o), 1e18);
        usd.approve(address(o), 300e6);
        o.exercise();
        vm.stopPrank();
        assertEq(uint8(o.state()), 2);
        assertEq(stock.balanceOf(address(o)), 0);
        assertEq(usd.balanceOf(address(o)), 0);
        conserve();
    }

    function testBestPriceThenFIFOAndAggregatedDepth() public {
        uint64 expensive = place(alice, false, 1100, 0);
        uint64 first = place(alice, false, 1000, 0);
        uint64 second = place(carol, false, 1000, 0);
        Market.Depth[] memory depth = market.getDepth(key(0), false, 0, 64);
        assertEq(depth.length, 2);
        assertEq(depth[0].count, 2);
        assertEq(depth[0].firstOrder, first);
        assertEq(address(option(place(bob, true, 1200, 0))), address(option(first)));
        assertEq(market.bestOrder(key(0), false), second);
        assertEq(address(option(place(bob, true, 1200, 0))), address(option(second)));
        assertEq(market.bestOrder(key(0), false), expensive);
        conserve();
    }

    function testActiveBookPageAndDepthStayAggregated() public {
        assertEq(market.activeSeriesCount(), 0);
        uint64 expensive = place(alice, false, 1100, 0);
        uint64 first = place(alice, false, 1000, 0);
        place(carol, false, 1000, 0);
        uint64 bid = place(bob, true, 900, 1);

        assertEq(market.activeSeriesCount(), 2);
        Market.BookRow[] memory rows = market.getBookPage(0, 32);
        assertEq(rows.length, 2);
        Market.BookRow memory call = rows[0].terms.kind == 0 ? rows[0] : rows[1];
        assertEq(call.key, key(0));
        assertEq(call.ask.price, 1000);
        assertEq(call.ask.count, 2);
        assertEq(call.ask.firstOrder, first);
        assertEq(call.ask.owner, alice);
        assertEq(call.ask.writer, alice);
        assertEq(call.ask.option, address(option(first)));
        assertFalse(call.ask.resale);

        Market.Quote[] memory depth = market.getDepthPage(key(0), false, 0, 32);
        assertEq(depth.length, 2);
        assertEq(depth[0].price, 1000);
        assertEq(depth[0].count, 2);
        assertEq(depth[0].writer, alice);
        assertEq(depth[1].firstOrder, expensive);

        vm.prank(alice);
        market.cancelOrder(first);
        rows = market.getBookPage(0, 32);
        call = rows[0].terms.kind == 0 ? rows[0] : rows[1];
        assertEq(call.ask.count, 1);
        assertEq(call.ask.owner, carol);

        vm.prank(carol);
        market.cancelOrder(call.ask.firstOrder);
        vm.prank(alice);
        market.cancelOrder(expensive);
        assertEq(market.activeSeriesCount(), 1);
        vm.prank(bob);
        market.cancelOrder(bid);
        assertEq(market.activeSeriesCount(), 0);
        assertEq(market.getBookPage(0, 32).length, 0);
        conserve();
    }

    function testCanceledSeriesChurnDoesNotGrowActiveBook() public {
        for (uint32 i; i < 80; ++i) {
            vm.prank(bob);
            uint64 id = market.placeOrder(0, 30001 + i, expiry + i, true, 1 + i);
            assertEq(market.activeSeriesCount(), 1);
            vm.prank(bob);
            market.cancelOrder(id);
            assertEq(market.activeSeriesCount(), 0);
        }
        assertEq(market.getSeries(0, 64).length, 64);
        assertEq(market.getSeries(64, 64).length, 16);
        assertEq(market.getBookPage(0, 32).length, 0);
        conserve();
    }

    function testCancelMiddleHeadTailAndRefunds() public {
        uint64 a = place(bob, true, 1000, 0);
        uint64 b = place(bob, true, 1000, 0);
        uint64 c = place(bob, true, 1000, 0);
        vm.prank(bob);
        market.cancelOrder(b);
        assertEq(market.getOrder(a).next, c);
        vm.prank(bob);
        market.cancelOrder(a);
        assertEq(market.bestOrder(key(0), true), c);
        vm.prank(bob);
        market.cancelOrder(c);
        assertEq(market.bestOrder(key(0), true), 0);
        conserve();
    }

    function testResaleCompetesAndPreservesCollateral() public {
        uint64 written = place(alice, false, 1000, 0);
        place(bob, true, 1000, 0);
        OptionV4 o = option(written);
        place(alice, false, 900, 0);
        vm.prank(bob);
        uint64 resale = market.placeResale(address(o), 800);
        assertEq(market.bestOrder(key(0), false), resale);
        Market.BookRow[] memory rows = market.getBookPage(0, 32);
        assertEq(rows[0].ask.owner, bob);
        assertEq(rows[0].ask.writer, alice);
        assertTrue(rows[0].ask.resale);
        place(carol, true, 1000, 0);
        assertEq(o.buyer(), carol);
        assertEq(o.writer(), alice);
        assertEq(stock.balanceOf(address(o)), 1e18);
        assertEq(market.optionCount(), 2);
        conserve();
    }

    function testResaleCrossesExistingBidAtBidPrice() public {
        uint64 id = place(alice, false, 1000, 0);
        place(bob, true, 1000, 0);
        OptionV4 o = option(id);
        place(carol, true, 1200, 0);
        vm.prank(bob);
        market.placeResale(address(o), 1100);
        assertEq(o.buyer(), carol);
        assertEq(usd.balanceOf(bob), 1e30 + 2e6);
        assertEq(market.reservedPremium(), 0);
        conserve();
    }

    function testExerciseRemovesListedAskAndCannotThenSell() public {
        uint64 id = place(alice, false, 1000, 0);
        place(bob, true, 1000, 0);
        OptionV4 o = option(id);
        vm.startPrank(bob);
        market.placeResale(address(o), 1200);
        usd.approve(address(o), 300e6);
        o.exercise();
        vm.stopPrank();
        assertEq(market.bestOrder(key(0), false), 0);
        assertEq(market.optionOrder(address(o)), 0);
        uint64 bid = place(carol, true, 1200, 0);
        assertEq(uint8(market.getOrder(bid).state), 1);
        conserve();
    }

    function testExpiryHidesWholeSeriesAndRefundsIndividually() public {
        uint64 ask = place(alice, false, 1100, 0);
        uint64 bid = place(bob, true, 1000, 0);
        vm.warp(expiry);
        assertEq(market.bestOrder(key(0), true), 0);
        assertEq(market.getDepth(key(0), false, 0, 64).length, 0);
        OptionV4 o = option(ask);
        vm.prank(alice);
        o.reclaimExpired();
        vm.prank(bob);
        market.cancelOrder(bid);
        conserve();
    }

    function testSelfTradeAndWriterBuybackRevertEverything() public {
        uint64 ask = place(alice, false, 1000, 0);
        uint64 count = market.orderCount();
        vm.expectRevert(Market.SelfTrade.selector);
        place(alice, true, 1000, 0);
        assertEq(market.orderCount(), count);
        assertEq(market.bestOrder(key(0), false), ask);
        place(bob, true, 1000, 0);
        OptionV4 o = option(ask);
        vm.prank(bob);
        market.placeResale(address(o), 1000);
        vm.expectRevert(Market.SelfTrade.selector);
        place(alice, true, 1100, 0);
        conserve();
    }

    function testFundingFailureRollsBackDeploymentAndIndex() public {
        uint64 bid = place(bob, true, 1000, 0);
        vm.prank(alice);
        stock.approve(address(market), 0);
        vm.expectRevert();
        place(alice, false, 900, 0);
        assertEq(market.optionCount(), 0);
        assertEq(market.orderCount(), bid);
        assertEq(market.bestOrder(key(0), true), bid);
        conserve();
    }

    function testOnlyMarketCanAssignBuyerOrCancelCollateral() public {
        uint64 id = place(alice, false, 1000, 0);
        OptionV4 o = option(id);
        vm.expectRevert(OptionV4.Unauthorized.selector);
        o.fill(bob, 10e6);
        vm.expectRevert(OptionV4.Unauthorized.selector);
        o.cancel();
        vm.expectRevert(Market.Unauthorized.selector);
        market.optionClosed();
        conserve();
    }

    function testSeriesIsolationAndPagination() public {
        uint64 a = place(alice, false, 1000, 0);
        place(alice, false, 1000, 1);
        vm.prank(alice);
        market.placeOrder(0, 30001, expiry, false, 1000);
        vm.prank(alice);
        market.placeOrder(0, 30000, expiry + 1, false, 1000);
        assertEq(market.getSeries(0, 64).length, 4);
        assertEq(market.getUserOrders(alice, 1, 2).length, 2);
        assertEq(market.getUserOptions(alice, 0, 64).length, 4);
        assertEq(market.bestOrder(key(0), false), a);
    }

    function testFuzzBookAgainstReference(uint32[24] memory seeds) public {
        for (uint256 i; i < seeds.length; ++i) {
            uint32 p = uint32(bound(seeds[i], 1, 10000));
            uint64 id = place(alice, false, p, 0);
            if (i % 3 == 1) {
                vm.prank(alice);
                market.cancelOrder(id);
            }
            uint64 best;
            uint32 price;
            for (uint64 j = 1; j <= market.orderCount(); ++j) {
                Market.Order memory o = market.getOrder(j);
                if (o.state == Market.OrderState.Open && (best == 0 || o.price < price)) {
                    best = j;
                    price = o.price;
                }
            }
            assertEq(market.bestOrder(key(0), false), best);
        }
        conserve();
    }

    function testPremiumFailureRestoresAskAndBuyerAndEscrow() public {
        uint64 ask = place(alice, false, 1000, 0);
        vm.mockCallRevert(address(usd), abi.encodeWithSelector(IERC20.transferFrom.selector), "payment failed");
        vm.expectRevert();
        place(bob, true, 1100, 0);
        assertEq(uint8(option(ask).state()), 0);
        assertEq(market.orderCount(), ask);
        assertEq(market.bestOrder(key(0), false), ask);
        conserve();
    }

    function testExercisePaymentFailureRestoresResaleListing() public {
        uint64 ask = place(alice, false, 1000, 0);
        place(bob, true, 1000, 0);
        OptionV4 o = option(ask);
        vm.prank(bob);
        uint64 resale = market.placeResale(address(o), 1200);
        vm.mockCallRevert(address(usd), abi.encodeWithSelector(IERC20.transferFrom.selector), "payment failed");
        vm.expectRevert();
        vm.prank(bob);
        o.exercise();
        assertEq(uint8(o.state()), 1);
        assertEq(o.resalePrice(), 12e6);
        assertEq(market.bestOrder(key(0), false), resale);
        conserve();
    }

    function testRaceCancellationCannotSpendExecutedOrder() public {
        uint64 ask = place(alice, false, 1000, 0);
        place(bob, true, 1000, 0);
        vm.expectRevert(Market.OrderUnavailable.selector);
        vm.prank(alice);
        market.cancelOrder(ask);
        assertEq(option(ask).buyer(), bob);
        conserve();
    }

    function testInvalidTicksKindExpirationAndPagination() public {
        vm.expectRevert(Market.InvalidTerms.selector);
        place(alice, false, 0, 0);
        vm.expectRevert(Market.InvalidTerms.selector);
        place(alice, false, 1, 2);
        vm.expectRevert(Market.InvalidTerms.selector);
        market.placeOrder(0, 0, expiry, true, 1);
        vm.expectRevert(Market.InvalidTerms.selector);
        market.placeOrder(0, 1, uint64(block.timestamp), true, 1);
        vm.expectRevert(Market.InvalidTerms.selector);
        market.getSeries(0, 65);
        assertEq(market.orderCount(), 0);
        conserve();
    }

    function testTransferFeeAndReentryCannotCorruptBook() public {
        AdversarialToken bad = new AdversarialToken();
        Market m = new Market(address(bad), address(usd));
        bad.mint(alice, 100);
        vm.prank(alice);
        bad.approve(address(m), 100);
        bad.setFee(true);
        vm.expectRevert(Market.UnsupportedTokenTransfer.selector);
        vm.prank(alice);
        m.placeOrder(0, 30000, expiry, false, 1000);
        assertEq(m.optionCount(), 0);
        assertEq(m.orderCount(), 0);
        assertEq(bad.balanceOf(alice), 100);
        bad.setFee(false);
        bad.setCallback(address(m), abi.encodeCall(m.placeOrder, (0, 30000, expiry, true, 1000)));
        vm.prank(alice);
        m.placeOrder(0, 30000, expiry, false, 1000);
        assertEq(bad.callbackError(), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertEq(m.orderCount(), 1);
        assertEq(bad.balanceOf(alice), 90);
        assertEq(bad.balanceOf(m.options(0)), 10);
    }

    function testGasBookDepth1And256() public {
        place(alice, false, 1000, 0);
        uint256 start = gasleft();
        market.bestOrder(key(0), false);
        emit log_named_uint("best quote, 1 level (warm)", start - gasleft());
        for (uint32 i = 1; i < 256; i++) {
            place(alice, false, 1000 + i * 256, 0);
        }
        start = gasleft();
        market.bestOrder(key(0), false);
        emit log_named_uint("best quote, 256 levels (warm)", start - gasleft());
        start = gasleft();
        place(bob, true, 1000, 0);
        emit log_named_uint("cross best ask, 256 levels (warm)", start - gasleft());
        conserve();
    }
}
