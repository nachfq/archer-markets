// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Option} from "../src/Option.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MockStock} from "../src/MockStock.sol";

contract OptionTest is Test {
    MockStock stock;
    MockUSD usd;
    OptionFactory factory;
    address writer = makeAddr("writer");
    address buyer = makeAddr("buyer");
    address stranger = makeAddr("stranger");
    uint256 constant LOT = 0.25e18;
    uint256 constant STRIKE = 100e6;
    uint256 constant PREMIUM = 5e6;
    uint64 expires;

    function setUp() public {
        vm.warp(1_800_000_000);
        expires = uint64(block.timestamp + 7 days);
        stock = new MockStock();
        usd = new MockUSD();
        factory = new OptionFactory(address(stock), address(usd));
        vm.startPrank(writer);
        stock.faucet();
        usd.faucet();
        stock.approve(address(factory), type(uint256).max);
        usd.approve(address(factory), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(buyer);
        stock.faucet();
        usd.faucet();
        vm.stopPrank();
    }

    function _create(Option.OptionType kind) internal returns (Option option) {
        vm.prank(writer);
        option = Option(factory.createOption(kind, LOT, STRIKE, PREMIUM, expires));
    }

    function _buy(Option option) internal {
        vm.startPrank(buyer);
        usd.approve(address(option), type(uint256).max);
        stock.approve(address(option), type(uint256).max);
        option.buy();
        vm.stopPrank();
    }

    function _empty(Option option) internal view {
        assertEq(stock.balanceOf(address(option)), 0);
        assertEq(usd.balanceOf(address(option)), 0);
        assertEq(stock.balanceOf(address(factory)), 0);
        assertEq(usd.balanceOf(address(factory)), 0);
    }

    function testCallLifecycleConservesBalances() public {
        Option option = _create(Option.OptionType.Call);
        assertEq(stock.balanceOf(address(option)), LOT);
        assertTrue(option.funded());
        assertEq(factory.options(0), address(option));
        assertEq(factory.optionCount(), 1);
        _buy(option);
        assertEq(usd.balanceOf(writer), 10_000e6 + PREMIUM);
        vm.prank(buyer);
        option.exercise();
        assertEq(stock.balanceOf(writer), 10e18 - LOT);
        assertEq(stock.balanceOf(buyer), 10e18 + LOT);
        assertEq(usd.balanceOf(writer), 10_000e6 + PREMIUM + STRIKE);
        assertEq(usd.balanceOf(buyer), 10_000e6 - PREMIUM - STRIKE);
        assertEq(uint8(option.state()), uint8(Option.State.Exercised));
        _empty(option);
    }

    function testPutLifecycleConservesBalances() public {
        Option option = _create(Option.OptionType.Put);
        assertEq(usd.balanceOf(address(option)), STRIKE);
        _buy(option);
        vm.prank(buyer);
        option.exercise();
        assertEq(stock.balanceOf(writer), 10e18 + LOT);
        assertEq(stock.balanceOf(buyer), 10e18 - LOT);
        assertEq(usd.balanceOf(writer), 10_000e6 + PREMIUM - STRIKE);
        assertEq(usd.balanceOf(buyer), 10_000e6 - PREMIUM + STRIKE);
        assertEq(uint8(option.state()), uint8(Option.State.Exercised));
        _empty(option);
    }

    function testFuzzAllTerminalsConserveFunds(
        bool put,
        uint8 terminal,
        uint96 amountSeed,
        uint64 strikeSeed,
        uint64 premiumSeed
    ) public {
        uint256 amount = bound(uint256(amountSeed), 1, 10e18);
        uint256 strike = bound(uint256(strikeSeed), 1, 5_000e6);
        uint256 cost = bound(uint256(premiumSeed), 1, 5_000e6);
        uint256 outcome = bound(uint256(terminal), 0, 3); // cancel, expire open, expire bought, exercise
        vm.prank(writer);
        Option option = Option(
            factory.createOption(put ? Option.OptionType.Put : Option.OptionType.Call, amount, strike, cost, expires)
        );
        if (outcome >= 2) _buy(option);
        if (outcome == 0) {
            vm.prank(writer);
            option.cancel();
        } else if (outcome < 3) {
            vm.warp(expires);
            vm.prank(writer);
            option.reclaimExpired();
        } else {
            vm.prank(buyer);
            option.exercise();
        }
        _empty(option);
        assertEq(stock.balanceOf(writer) + stock.balanceOf(buyer), 20e18);
        assertEq(usd.balanceOf(writer) + usd.balanceOf(buyer), 20_000e6);
        uint256 paid = outcome >= 2 ? cost : 0;
        if (outcome == 3) {
            assertEq(stock.balanceOf(writer), put ? 10e18 + amount : 10e18 - amount);
            assertEq(usd.balanceOf(writer), put ? 10_000e6 + paid - strike : 10_000e6 + paid + strike);
        } else {
            assertEq(stock.balanceOf(writer), 10e18);
            assertEq(usd.balanceOf(writer), 10_000e6 + paid);
        }
    }

    function testBuyAtExpiryRevertsAndWriterReclaims() public {
        Option option = _create(Option.OptionType.Call);
        vm.warp(expires);
        vm.prank(buyer);
        vm.expectRevert(Option.OptionExpired.selector);
        option.buy();
        vm.prank(writer);
        option.reclaimExpired();
        assertEq(uint8(option.state()), uint8(Option.State.Expired));
        _empty(option);
    }

    function testExerciseAtExpiryRevertsAndPremiumStaysPaid() public {
        Option option = _create(Option.OptionType.Put);
        _buy(option);
        vm.warp(expires);
        vm.prank(buyer);
        vm.expectRevert(Option.OptionExpired.selector);
        option.exercise();
        vm.prank(writer);
        option.reclaimExpired();
        assertEq(usd.balanceOf(writer), 10_000e6 + PREMIUM);
        assertEq(stock.balanceOf(writer), 10e18);
        _empty(option);
    }

    function testExerciseImmediatelyAndJustBeforeExpiry() public {
        Option first = _create(Option.OptionType.Call);
        Option second = _create(Option.OptionType.Put);
        _buy(first);
        _buy(second);
        vm.prank(buyer);
        first.exercise();
        vm.warp(expires - 1);
        vm.prank(buyer);
        second.exercise();
        _empty(first);
        _empty(second);
    }

    function testCannotReclaimBeforeExpiry() public {
        Option option = _create(Option.OptionType.Call);
        vm.warp(expires - 1);
        vm.prank(writer);
        vm.expectRevert(Option.NotExpired.selector);
        option.reclaimExpired();
    }

    function testMissingCollateralApprovalRollsBackCreation() public {
        vm.startPrank(writer);
        stock.approve(address(factory), 0);
        vm.expectRevert();
        factory.createOption(Option.OptionType.Call, LOT, STRIKE, PREMIUM, expires);
        vm.stopPrank();
        assertEq(factory.optionCount(), 0);
        assertEq(stock.balanceOf(writer), 10e18);
    }

    function testMissingPremiumApprovalRollsBackBuyerAndState() public {
        Option option = _create(Option.OptionType.Call);
        vm.prank(buyer);
        vm.expectRevert();
        option.buy();
        assertEq(option.buyer(), address(0));
        assertEq(uint8(option.state()), uint8(Option.State.Open));
        assertEq(usd.balanceOf(writer), 10_000e6);
    }

    function testMissingCallExerciseApprovalLeavesCollateralAndState() public {
        Option option = _create(Option.OptionType.Call);
        vm.startPrank(buyer);
        usd.approve(address(option), PREMIUM);
        option.buy();
        vm.expectRevert();
        option.exercise();
        vm.stopPrank();
        assertEq(uint8(option.state()), uint8(Option.State.Active));
        assertEq(stock.balanceOf(address(option)), LOT);
        assertEq(usd.balanceOf(writer), 10_000e6 + PREMIUM);
    }

    function testMissingPutExerciseApprovalLeavesCollateralAndState() public {
        Option option = _create(Option.OptionType.Put);
        vm.startPrank(buyer);
        usd.approve(address(option), PREMIUM);
        option.buy();
        vm.expectRevert();
        option.exercise();
        vm.stopPrank();
        assertEq(uint8(option.state()), uint8(Option.State.Active));
        assertEq(usd.balanceOf(address(option)), STRIKE);
        assertEq(stock.balanceOf(writer), 10e18);
    }

    function testUnauthorizedActions() public {
        Option option = _create(Option.OptionType.Call);
        vm.startPrank(stranger);
        vm.expectRevert(Option.Unauthorized.selector);
        option.cancel();
        vm.expectRevert(Option.Unauthorized.selector);
        option.reclaimExpired();
        vm.expectRevert(Option.Unauthorized.selector);
        option.activateFunding();
        vm.stopPrank();
        vm.prank(writer);
        vm.expectRevert(Option.Unauthorized.selector);
        option.buy();
        _buy(option);
        vm.prank(writer);
        vm.expectRevert(Option.Unauthorized.selector);
        option.exercise();
        vm.prank(stranger);
        vm.expectRevert(Option.Unauthorized.selector);
        option.exercise();
    }

    function testSoldOptionCannotBeCancelledOrBoughtAgain() public {
        Option option = _create(Option.OptionType.Call);
        _buy(option);
        vm.prank(writer);
        vm.expectRevert(Option.InvalidState.selector);
        option.cancel();
        vm.prank(stranger);
        vm.expectRevert(Option.InvalidState.selector);
        option.buy();
    }

    function testTerminalStatesCannotBeReused() public {
        for (uint256 i; i < 3; ++i) {
            Option option = _create(Option.OptionType.Call);
            if (i == 0) {
                _buy(option);
                vm.prank(buyer);
                option.exercise();
            } else if (i == 1) {
                vm.prank(writer);
                option.cancel();
            } else {
                vm.warp(expires);
                vm.prank(writer);
                option.reclaimExpired();
            }
            vm.prank(buyer);
            vm.expectRevert(Option.InvalidState.selector);
            option.buy();
            vm.prank(writer);
            vm.expectRevert(Option.InvalidState.selector);
            option.cancel();
            vm.prank(writer);
            vm.expectRevert(Option.InvalidState.selector);
            option.reclaimExpired();
            if (i == 0) {
                vm.prank(buyer);
                vm.expectRevert(Option.InvalidState.selector);
                option.exercise();
            }
            _empty(option);
        }
    }

    function testUnfundedDirectDeploymentCannotBePurchased() public {
        Option option =
            new Option(writer, address(stock), address(usd), Option.OptionType.Call, LOT, STRIKE, PREMIUM, expires);
        vm.expectRevert(Option.NotFunded.selector);
        option.activateFunding();
        vm.prank(buyer);
        vm.expectRevert(Option.NotFunded.selector);
        option.buy();
        vm.prank(writer);
        vm.expectRevert(Option.NotFunded.selector);
        option.cancel();
    }

    function testFactoryCannotActivateTwice() public {
        Option option = _create(Option.OptionType.Call);
        vm.prank(address(factory));
        vm.expectRevert(Option.InvalidState.selector);
        option.activateFunding();
    }

    function testInvalidTerms() public {
        vm.startPrank(writer);
        vm.expectRevert(Option.InvalidTerms.selector);
        factory.createOption(Option.OptionType.Call, 0, STRIKE, PREMIUM, expires);
        vm.expectRevert(Option.InvalidTerms.selector);
        factory.createOption(Option.OptionType.Call, LOT, 0, PREMIUM, expires);
        vm.expectRevert(Option.InvalidTerms.selector);
        factory.createOption(Option.OptionType.Call, LOT, STRIKE, 0, expires);
        vm.expectRevert(Option.InvalidTerms.selector);
        factory.createOption(Option.OptionType.Call, LOT, STRIKE, PREMIUM, uint64(block.timestamp));
        vm.expectRevert(Option.InvalidTerms.selector);
        factory.createOption(Option.OptionType.Call, LOT, STRIKE, PREMIUM, uint64(block.timestamp - 1));
        vm.stopPrank();
        assertEq(factory.optionCount(), 0);
    }

    function testInvalidPair() public {
        vm.expectRevert(OptionFactory.InvalidPair.selector);
        new OptionFactory(address(0), address(usd));
        vm.expectRevert(OptionFactory.InvalidPair.selector);
        new OptionFactory(address(stock), address(stock));
        vm.expectRevert(OptionFactory.InvalidPair.selector);
        new OptionFactory(address(stock), stranger);
    }

    function testDonationsToNextCreateAddressCannotBlockFactory() public {
        for (uint256 kind; kind < 2; ++kind) {
            address predicted = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));
            IERC20 collateral = kind == 0 ? IERC20(address(stock)) : IERC20(address(usd));
            vm.prank(writer);
            assertTrue(collateral.transfer(predicted, 1));
            Option option = _create(kind == 0 ? Option.OptionType.Call : Option.OptionType.Put);
            assertEq(address(option), predicted);
            _buy(option);
            vm.prank(buyer);
            option.exercise();
            assertEq(collateral.balanceOf(predicted), 1); // donation is outside the immutable lot
            assertEq(uint8(option.state()), uint8(Option.State.Exercised));
        }
    }

    function testDecimalsAndMockDrips() public view {
        assertEq(stock.decimals(), 18);
        assertEq(usd.decimals(), 6);
        assertEq(stock.balanceOf(writer), 10e18);
        assertEq(usd.balanceOf(buyer), 10_000e6);
    }
}

/// @dev Configurable hostile token to test rollback of second-leg failures and callback guards.
contract AdversarialToken is ERC20 {
    bool public chargeFee;
    address public callbackTarget;
    bytes public callbackData;
    bytes4 public callbackError;
    bool private callbackRunning;
    constructor() ERC20("Adversarial", "BAD") {}

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
                // We intentionally keep just the four-byte error selector, after checking its length.
                // forge-lint: disable-next-line(unsafe-typecast)
                callbackError = bytes4(result);
            }
            callbackRunning = false;
        }
    }
}

contract TokenSafetyTest is Test {
    AdversarialToken stock;
    AdversarialToken usd;
    OptionFactory factory;
    address writer = makeAddr("writer");
    address buyer = makeAddr("buyer");

    function setUp() public {
        stock = new AdversarialToken();
        usd = new AdversarialToken();
        factory = new OptionFactory(address(stock), address(usd));
        stock.mint(writer, 1000);
        stock.mint(buyer, 1000);
        usd.mint(writer, 1000);
        usd.mint(buyer, 1000);
        vm.startPrank(writer);
        stock.approve(address(factory), type(uint256).max);
        usd.approve(address(factory), type(uint256).max);
        vm.stopPrank();
    }

    function _create() internal returns (Option option) {
        vm.prank(writer);
        option = Option(factory.createOption(Option.OptionType.Call, 100, 200, 10, uint64(block.timestamp + 1 days)));
    }

    function _buy(Option option) internal {
        vm.startPrank(buyer);
        usd.approve(address(option), type(uint256).max);
        option.buy();
        vm.stopPrank();
    }

    function testFeeCollateralRevertsCreation() public {
        stock.setFee(true);
        vm.prank(writer);
        vm.expectRevert(OptionFactory.UnsupportedTokenTransfer.selector);
        factory.createOption(Option.OptionType.Call, 100, 200, 10, uint64(block.timestamp + 1 days));
        assertEq(factory.optionCount(), 0);
        assertEq(stock.balanceOf(writer), 1000);
    }

    function testFeePremiumRollsBackPurchase() public {
        Option option = _create();
        usd.setFee(true);
        vm.startPrank(buyer);
        usd.approve(address(option), type(uint256).max);
        vm.expectRevert(Option.UnsupportedTokenTransfer.selector);
        option.buy();
        vm.stopPrank();
        assertEq(uint8(option.state()), uint8(Option.State.Open));
        assertEq(option.buyer(), address(0));
        assertEq(usd.balanceOf(writer), 1000);
    }

    function testSecondLegFailureRollsBackFirstLegAndExercise() public {
        Option option = _create();
        _buy(option);
        stock.setFee(true);
        vm.prank(buyer);
        vm.expectRevert(Option.UnsupportedTokenTransfer.selector);
        option.exercise();
        assertEq(uint8(option.state()), uint8(Option.State.Active));
        assertEq(usd.balanceOf(writer), 1010);
        assertEq(usd.balanceOf(buyer), 990);
        assertEq(stock.balanceOf(address(option)), 100);
    }

    function testBuyAndExerciseRejectTokenCallbackReentry() public {
        Option option = _create();
        usd.setCallback(address(option), abi.encodeCall(Option.buy, ()));
        _buy(option);
        assertEq(usd.callbackError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        usd.setCallback(address(option), abi.encodeCall(Option.exercise, ()));
        vm.prank(buyer);
        option.exercise();
        assertEq(usd.callbackError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(usd.balanceOf(writer), 1210);
    }

    function testFactoryRejectsCollateralCallbackReentry() public {
        stock.setCallback(
            address(factory),
            abi.encodeCall(
                OptionFactory.createOption, (Option.OptionType.Call, 1, 1, 1, uint64(block.timestamp + 1 days))
            )
        );
        _create();
        assertEq(stock.callbackError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(factory.optionCount(), 1);
    }

    function testResaleFeeRollsBackOwnershipListingAndBalances() public {
        Option option = _create();
        _buy(option);
        address nextBuyer = makeAddr("nextBuyer");
        usd.mint(nextBuyer, 1000);
        vm.prank(buyer);
        option.listForResale(20);
        usd.setFee(true);
        vm.startPrank(nextBuyer);
        usd.approve(address(option), 20);
        vm.expectRevert(Option.UnsupportedTokenTransfer.selector);
        option.buyResale(buyer, 20, 1);
        vm.stopPrank();
        assertEq(option.buyer(), buyer);
        assertEq(option.resalePrice(), 20);
        assertEq(option.listingNonce(), 1);
        assertEq(usd.balanceOf(nextBuyer), 1000);
        assertEq(usd.balanceOf(buyer), 990);
        assertEq(usd.balanceOf(writer), 1010);
        assertEq(stock.balanceOf(address(option)), 100);
        assertEq(usd.allowance(nextBuyer, address(option)), 20);
    }

    function testResaleRejectsReentryAndExerciseRollbackPreservesListing() public {
        Option option = _create();
        _buy(option);
        address nextBuyer = makeAddr("nextBuyer");
        usd.mint(nextBuyer, 1000);
        vm.prank(buyer);
        option.listForResale(20);
        usd.setCallback(address(option), abi.encodeCall(Option.buyResale, (buyer, 20, 1)));
        vm.startPrank(nextBuyer);
        usd.approve(address(option), type(uint256).max);
        option.buyResale(buyer, 20, 1);
        assertEq(usd.callbackError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        option.listForResale(30);
        stock.setFee(true);
        vm.expectRevert(Option.UnsupportedTokenTransfer.selector);
        option.exercise();
        vm.stopPrank();
        assertEq(option.buyer(), nextBuyer);
        assertEq(option.resalePrice(), 30);
        assertEq(option.listingNonce(), 3);
        assertEq(usd.balanceOf(nextBuyer), 980);
        assertEq(usd.balanceOf(writer), 1010);
        assertEq(stock.balanceOf(address(option)), 100);
    }
}
