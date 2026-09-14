// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OptionTest, AdversarialToken} from "./Option.t.sol";
import {Option} from "../src/Option.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RequestTest is OptionTest {
    function _request(bool put, uint256 premium) internal returns (uint256 id) {
        vm.startPrank(buyer);
        usd.approve(address(factory), premium);
        id = factory.createRequest(put ? Option.OptionType.Put : Option.OptionType.Call, LOT, STRIKE, premium, expires, expires - 1 days);
        vm.stopPrank();
    }

    function testFuzzRequestAcceptanceAndExerciseConserveFunds(bool put, uint64 seed) public {
        uint256 premium = bound(uint256(seed), 1, 5000e6);
        uint256 id = _request(put, premium);
        assertEq(factory.optionCount(), 0);
        assertEq(usd.balanceOf(address(factory)), premium);
        assertEq(factory.reservedPremium(), premium);
        assertEq(usd.balanceOf(buyer), 10_000e6 - premium);
        vm.prank(writer);
        Option o = Option(factory.acceptRequest(id));
        assertEq(factory.optionCount(), 1);
        assertEq(o.writer(), writer);
        assertEq(o.buyer(), buyer);
        assertEq(o.underlyingAmount(), LOT);
        assertEq(o.strikeTotal(), STRIKE);
        assertEq(uint8(o.state()), uint8(Option.State.Active));
        assertEq(factory.getRequest(id).option, address(o));
        assertEq(factory.reservedPremium(), 0);
        assertEq(usd.balanceOf(address(factory)), 0);
        assertEq(stock.balanceOf(address(o)), put ? 0 : LOT);
        assertEq(usd.balanceOf(address(o)), put ? STRIKE : 0);
        vm.startPrank(buyer);
        usd.approve(address(o), STRIKE);
        stock.approve(address(o), LOT);
        o.exercise();
        vm.stopPrank();
        assertEq(usd.balanceOf(writer), put ? 10_000e6 + premium - STRIKE : 10_000e6 + premium + STRIKE);
        assertEq(usd.balanceOf(writer) + usd.balanceOf(buyer), 20_000e6);
        assertEq(stock.balanceOf(writer) + stock.balanceOf(buyer), 20e18);
        _empty(o);
    }

    function testSeparateRequestEscrowsAndCancelAfterDeadline() public {
        uint256 first = _request(false, PREMIUM);
        uint256 second = _request(true, PREMIUM * 2);
        vm.prank(writer);
        factory.acceptRequest(first);
        assertEq(factory.reservedPremium(), PREMIUM * 2);
        assertEq(usd.balanceOf(address(factory)), PREMIUM * 2);
        vm.warp(expires - 1 days);
        vm.prank(writer);
        vm.expectRevert(OptionFactory.RequestExpired.selector);
        factory.acceptRequest(second);
        vm.prank(buyer);
        factory.cancelRequest(second);
        assertEq(usd.balanceOf(buyer), 10_000e6 - PREMIUM);
        assertEq(factory.reservedPremium(), 0);
        assertEq(usd.balanceOf(address(factory)), 0);
        assertEq(uint8(factory.getRequest(second).state), uint8(OptionFactory.RequestState.Cancelled));
    }

    function testCancellationAndCompetingAcceptancesCannotReusePremium() public {
        uint256 id = _request(false, PREMIUM);
        vm.prank(stranger);
        vm.expectRevert(OptionFactory.Unauthorized.selector);
        factory.cancelRequest(id);
        vm.prank(buyer);
        vm.expectRevert(OptionFactory.Unauthorized.selector);
        factory.acceptRequest(id);
        vm.prank(buyer);
        factory.cancelRequest(id);
        vm.prank(writer);
        vm.expectRevert(OptionFactory.RequestUnavailable.selector);
        factory.acceptRequest(id);
        vm.prank(buyer);
        vm.expectRevert(OptionFactory.RequestUnavailable.selector);
        factory.cancelRequest(id);
        uint256 another = _request(true, PREMIUM);
        vm.prank(writer);
        Option o = Option(factory.acceptRequest(another));
        vm.prank(stranger);
        vm.expectRevert(OptionFactory.RequestUnavailable.selector);
        factory.acceptRequest(another);
        vm.prank(buyer);
        vm.expectRevert(OptionFactory.RequestUnavailable.selector);
        factory.cancelRequest(another);
        vm.prank(writer);
        vm.expectRevert(Option.InvalidState.selector);
        o.cancel();
        assertEq(factory.optionCount(), 1);
        assertEq(factory.reservedPremium(), 0);
    }

    function testRevertedCollateralRollsBackRequestRegistryAndPremium() public {
        uint256 id = _request(false, PREMIUM);
        uint256 factoryNonce = vm.getNonce(address(factory));
        vm.prank(writer);
        stock.approve(address(factory), 0);
        vm.prank(writer);
        vm.expectRevert();
        factory.acceptRequest(id);
        assertEq(factory.optionCount(), 0);
        assertEq(vm.getNonce(address(factory)), factoryNonce);
        assertEq(uint8(factory.getRequest(id).state), uint8(OptionFactory.RequestState.Open));
        assertEq(factory.getRequest(id).option, address(0));
        assertEq(factory.reservedPremium(), PREMIUM);
        assertEq(usd.balanceOf(address(factory)), PREMIUM);
        assertEq(usd.balanceOf(writer), 10_000e6);
        vm.prank(buyer);
        factory.cancelRequest(id);
        assertEq(usd.balanceOf(buyer), 10_000e6);
    }

    function testRevertedPremiumTransferRollsBackCreationAndAcceptance() public {
        AdversarialToken bad = new AdversarialToken();
        OptionFactory f = new OptionFactory(address(stock), address(bad));
        bad.mint(buyer, PREMIUM * 2);
        vm.prank(buyer);
        bad.approve(address(f), type(uint256).max);
        bad.setFee(true);
        vm.prank(buyer);
        vm.expectRevert(OptionFactory.UnsupportedTokenTransfer.selector);
        f.createRequest(Option.OptionType.Call, LOT, STRIKE, PREMIUM, expires, expires - 1 days);
        assertEq(f.requestCount(), 0);
        assertEq(f.reservedPremium(), 0);
        assertEq(bad.balanceOf(buyer), PREMIUM * 2);
        bad.setFee(false);
        vm.prank(buyer);
        uint256 id = f.createRequest(Option.OptionType.Call, LOT, STRIKE, PREMIUM, expires, expires - 1 days);
        vm.prank(writer);
        stock.approve(address(f), LOT);
        bad.setFee(true);
        vm.prank(writer);
        vm.expectRevert(OptionFactory.UnsupportedTokenTransfer.selector);
        f.acceptRequest(id);
        assertEq(f.optionCount(), 0);
        assertEq(stock.balanceOf(writer), 10e18);
        assertEq(uint8(f.getRequest(id).state), uint8(OptionFactory.RequestState.Open));
        assertEq(f.reservedPremium(), PREMIUM);
        assertEq(bad.balanceOf(address(f)), PREMIUM);
        vm.prank(buyer);
        vm.expectRevert(OptionFactory.UnsupportedTokenTransfer.selector);
        f.cancelRequest(id);
        assertEq(f.reservedPremium(), PREMIUM);
        assertEq(uint8(f.getRequest(id).state), uint8(OptionFactory.RequestState.Open));
    }

    function testRequestCallbacksCannotReenterFactory() public {
        AdversarialToken bad = new AdversarialToken();
        OptionFactory f = new OptionFactory(address(stock), address(bad));
        bad.mint(buyer, PREMIUM);
        bad.setCallback(address(f), abi.encodeCall(f.cancelRequest, (0)));
        vm.startPrank(buyer);
        bad.approve(address(f), PREMIUM);
        uint256 id = f.createRequest(Option.OptionType.Call, LOT, STRIKE, PREMIUM, expires, expires - 1 days);
        vm.stopPrank();
        assertEq(bad.callbackError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(writer);
        stock.approve(address(f), LOT);
        vm.prank(writer);
        f.acceptRequest(id);
        assertEq(bad.callbackError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(f.reservedPremium(), 0);
    }

    function testLotSizeDeadlinesAndFactoryActivationPermissions() public {
        assertEq(factory.lotSize(), 0.1e18);
        vm.startPrank(buyer);
        usd.approve(address(factory), PREMIUM);
        vm.expectRevert(OptionFactory.InvalidLotSize.selector);
        factory.createRequest(Option.OptionType.Call, 0.15e18, STRIKE, PREMIUM, expires, expires - 1);
        vm.expectRevert(OptionFactory.InvalidTerms.selector);
        factory.createRequest(Option.OptionType.Call, LOT, STRIKE, PREMIUM, expires, expires);
        vm.expectRevert(OptionFactory.InvalidTerms.selector);
        factory.createRequest(Option.OptionType.Call, LOT, STRIKE, PREMIUM, expires, uint64(block.timestamp));
        vm.stopPrank();
        assertEq(factory.requestCount(), 0);
        Option o = _create(Option.OptionType.Call);
        vm.prank(buyer);
        vm.expectRevert(Option.Unauthorized.selector);
        o.activateRequestedPurchase(buyer);
        _buy(o);
        vm.prank(address(factory));
        vm.expectRevert(Option.InvalidState.selector);
        o.activateRequestedPurchase(buyer);
    }
}
