// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Option} from "../src/Option.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
import {MockStock} from "../src/MockStock.sol";
import {MockUSD} from "../src/MockUSD.sol";

/// @notice Randomized request interleavings with a fixed token supply and independent actors.
contract RequestHandler is Test {
    OptionFactory public factory;
    MockStock public stock;
    MockUSD public usd;
    address[3] public actors;
    uint256 public donations;
    uint256 public accepted;
    uint256 public cancelled;

    constructor(OptionFactory factory_, MockStock stock_, MockUSD usd_) {
        factory = factory_;
        stock = stock_;
        usd = usd_;
        for (uint256 i; i < actors.length; i++) {
            actors[i] = address(uint160(100 + i));
            vm.startPrank(actors[i]);
            stock.faucet();
            usd.faucet();
            stock.approve(address(factory), type(uint256).max);
            usd.approve(address(factory), type(uint256).max);
            vm.stopPrank();
        }
    }

    function create(uint256 actorSeed, uint256 amountSeed, bool put) external {
        address actor = actors[actorSeed % actors.length];
        uint256 premium = bound(amountSeed, 1, 10e6);
        if (usd.balanceOf(actor) < premium) return;
        vm.prank(actor);
        factory.createRequest(put ? Option.OptionType.Put : Option.OptionType.Call,
            0.1e18, 10e6, premium, uint64(block.timestamp + 2 days), uint64(block.timestamp + 1 days));
    }

    function accept(uint256 idSeed, uint256 actorSeed) external {
        if (factory.requestCount() == 0) return;
        uint256 id = idSeed % factory.requestCount();
        OptionFactory.BuyRequest memory r = factory.getRequest(id);
        address actor = actors[actorSeed % actors.length];
        if (r.state != OptionFactory.RequestState.Open || actor == r.buyer || block.timestamp >= r.acceptUntil) return;
        if (r.optionType == Option.OptionType.Call ? stock.balanceOf(actor) < r.underlyingAmount : usd.balanceOf(actor) < r.strikeTotal) return;
        vm.prank(actor);
        factory.acceptRequest(id);
        accepted++;
    }

    function cancel(uint256 idSeed) external {
        if (factory.requestCount() == 0) return;
        uint256 id = idSeed % factory.requestCount();
        OptionFactory.BuyRequest memory r = factory.getRequest(id);
        if (r.state != OptionFactory.RequestState.Open) return;
        vm.prank(r.buyer);
        factory.cancelRequest(id);
        cancelled++;
    }

    function settle(uint256 idSeed) external {
        if (factory.optionCount() == 0) return;
        Option o = Option(factory.options(idSeed % factory.optionCount()));
        if (o.state() != Option.State.Active) return;
        if (block.timestamp >= o.expiry()) {
            vm.prank(o.writer());
            o.reclaimExpired();
        } else {
            address holder = o.buyer();
            if (o.optionType() == Option.OptionType.Call ? usd.balanceOf(holder) < o.strikeTotal() : stock.balanceOf(holder) < o.underlyingAmount()) return;
            vm.startPrank(holder);
            stock.approve(address(o), o.underlyingAmount());
            usd.approve(address(o), o.strikeTotal());
            o.exercise();
            vm.stopPrank();
        }
    }

    function donate(uint256 seed) external {
        uint256 value = bound(seed, 0, 1e6);
        if (usd.balanceOf(actors[0]) < value) return;
        vm.prank(actors[0]);
        usd.transfer(address(factory), value);
        donations += value;
    }

    function advance(uint256 seed) external { vm.warp(block.timestamp + bound(seed, 0, 12 hours)); }
}

contract RequestInvariantTest is StdInvariant, Test {
    OptionFactory factory;
    MockStock stock;
    MockUSD usd;
    RequestHandler handler;

    function setUp() public {
        stock = new MockStock();
        usd = new MockUSD();
        factory = new OptionFactory(address(stock), address(usd));
        handler = new RequestHandler(factory, stock, usd);
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.create.selector;
        selectors[1] = handler.accept.selector;
        selectors[2] = handler.cancel.selector;
        selectors[3] = handler.settle.selector;
        selectors[4] = handler.donate.selector;
        selectors[5] = handler.advance.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariantEscrowAndCollateralConserveTokens() public view {
        uint256 reserved;
        uint256 accepted;
        uint256 cancelled;
        for (uint256 i; i < factory.requestCount(); i++) {
            OptionFactory.BuyRequest memory r = factory.getRequest(i);
            if (r.state == OptionFactory.RequestState.Open) {
                reserved += r.premium;
                assertEq(r.option, address(0));
            } else if (r.state == OptionFactory.RequestState.Accepted) {
                assertTrue(r.option != address(0));
                assertEq(Option(r.option).buyer(), r.buyer);
                accepted++;
            } else { assertEq(r.option, address(0)); cancelled++; }
        }
        assertEq(factory.reservedPremium(), reserved);
        assertEq(usd.balanceOf(address(factory)), reserved + handler.donations());
        assertEq(factory.optionCount(), accepted);
        assertEq(accepted, handler.accepted());
        assertEq(cancelled, handler.cancelled());
        uint256 totalStock = stock.balanceOf(address(factory));
        uint256 totalUSD = usd.balanceOf(address(factory));
        for (uint256 i; i < 3; i++) {
            totalStock += stock.balanceOf(handler.actors(i));
            totalUSD += usd.balanceOf(handler.actors(i));
        }
        for (uint256 i; i < factory.optionCount(); i++) {
            Option o = Option(factory.options(i));
            uint256 s = stock.balanceOf(address(o));
            uint256 u = usd.balanceOf(address(o));
            assertTrue(o.funded());
            if (o.state() == Option.State.Active) {
                assertEq(s, o.optionType() == Option.OptionType.Call ? o.underlyingAmount() : 0);
                assertEq(u, o.optionType() == Option.OptionType.Put ? o.strikeTotal() : 0);
            } else { assertEq(s, 0); assertEq(u, 0); }
            totalStock += s;
            totalUSD += u;
        }
        assertEq(totalStock, 30e18);
        assertEq(totalUSD, 30_000e6);
    }
}
