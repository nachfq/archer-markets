// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OptionTest} from "./Option.t.sol";
import {Option} from "../src/Option.sol";

contract ResaleTest is OptionTest {
    function _listed(bool put) internal returns (Option option) {
        option = _create(put ? Option.OptionType.Put : Option.OptionType.Call);
        _buy(option);
        vm.prank(buyer);
        option.listForResale(8e6);
        vm.startPrank(stranger);
        usd.faucet();
        stock.faucet();
        usd.approve(address(option), type(uint256).max);
        stock.approve(address(option), type(uint256).max);
        vm.stopPrank();
    }

    function testFuzzResaleThenExerciseConservesBalances(bool put, uint64 priceSeed) public {
        Option option = _listed(put);
        uint256 price = bound(uint256(priceSeed), 1, 9_900e6);
        vm.prank(buyer);
        option.listForResale(price);
        uint256 writerBalance = usd.balanceOf(writer);
        vm.prank(stranger);
        option.buyResale(buyer, price, 2);
        assertEq(option.buyer(), stranger);
        assertEq(option.resalePrice(), 0);
        assertEq(option.listingNonce(), 3);
        assertEq(usd.balanceOf(writer), writerBalance);
        assertEq(usd.balanceOf(buyer), 10_000e6 - PREMIUM + price);
        assertEq(usd.balanceOf(stranger), 10_000e6 - price);
        assertEq(option.collateralAmount(), put ? STRIKE : LOT);
        vm.prank(buyer);
        vm.expectRevert(Option.Unauthorized.selector);
        option.exercise();
        vm.prank(stranger);
        option.exercise();
        assertEq(stock.balanceOf(writer) + stock.balanceOf(buyer) + stock.balanceOf(stranger), 30e18);
        assertEq(usd.balanceOf(writer) + usd.balanceOf(buyer) + usd.balanceOf(stranger), 30_000e6);
        assertEq(usd.balanceOf(writer), put ? 10_000e6 + PREMIUM - STRIKE : 10_000e6 + PREMIUM + STRIKE);
        _empty(option);
    }

    function testStaleQuoteAndFailedPaymentRollBack() public {
        Option option = _listed(false);
        vm.prank(buyer);
        option.listForResale(9e6);
        vm.startPrank(stranger);
        vm.expectRevert(Option.StaleListing.selector);
        option.buyResale(buyer, 8e6, 1);
        vm.expectRevert(Option.StaleListing.selector);
        option.buyResale(buyer, 9e6, 1);
        usd.approve(address(option), 0);
        vm.expectRevert();
        option.buyResale(buyer, 9e6, 2);
        vm.stopPrank();
        assertEq(option.buyer(), buyer);
        assertEq(option.resalePrice(), 9e6);
        assertEq(option.listingNonce(), 2);
        assertEq(usd.balanceOf(stranger), 10_000e6);
        assertEq(stock.balanceOf(address(option)), LOT);
    }

    function testCancelRelistAndSecondSale() public {
        Option option = _listed(true);
        vm.startPrank(buyer);
        option.cancelResale();
        option.listForResale(8e6);
        vm.stopPrank();
        vm.prank(stranger);
        vm.expectRevert(Option.StaleListing.selector);
        option.buyResale(buyer, 8e6, 1);
        vm.prank(stranger);
        option.buyResale(buyer, 8e6, 3);
        vm.prank(stranger);
        option.listForResale(6e6);
        vm.prank(buyer);
        option.buyResale(stranger, 6e6, 5);
        assertEq(option.buyer(), buyer);
        assertEq(option.listingNonce(), 6);
        assertEq(usd.balanceOf(buyer), 10_000e6 - PREMIUM + 2e6);
        assertEq(usd.balanceOf(stranger), 10_000e6 - 2e6);
    }

    function testListingDoesNotLockExerciseAndDeadlineInvalidatesSale() public {
        Option first = _listed(false);
        vm.prank(buyer);
        first.exercise();
        assertEq(first.resalePrice(), 0);
        vm.prank(stranger);
        vm.expectRevert(Option.InvalidState.selector);
        first.buyResale(buyer, 8e6, 1);
        Option second = _listed(true);
        vm.warp(expires);
        vm.prank(stranger);
        vm.expectRevert(Option.OptionExpired.selector);
        second.buyResale(buyer, 8e6, 1);
        vm.prank(buyer);
        vm.expectRevert(Option.OptionExpired.selector);
        second.listForResale(1);
        vm.prank(writer);
        second.reclaimExpired();
        assertEq(second.resalePrice(), 0);
        _empty(second);
    }

    function testListingPermissionsAndPositivePrice() public {
        Option option = _listed(false);
        vm.prank(writer);
        vm.expectRevert(Option.Unauthorized.selector);
        option.buyResale(buyer, 8e6, 1);
        vm.startPrank(buyer);
        vm.expectRevert(Option.Unauthorized.selector);
        option.buyResale(buyer, 8e6, 1);
        vm.expectRevert(Option.InvalidTerms.selector);
        option.listForResale(0);
        vm.stopPrank();
        vm.startPrank(stranger);
        vm.expectRevert(Option.Unauthorized.selector);
        option.listForResale(1);
        vm.expectRevert(Option.Unauthorized.selector);
        option.cancelResale();
        vm.stopPrank();
        assertEq(option.resalePrice(), 8e6);
        assertEq(factory.version(), 2);
    }
}
