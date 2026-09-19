// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {OptionMarketV4 as Market} from "../src/OptionMarketV4.sol";
import {OptionV4} from "../src/OptionV4.sol";
import {MockStock} from "../src/MockStock.sol";
import {MockUSD} from "../src/MockUSD.sol";

contract V4Handler is Test {
    Market public market;
    MockStock public stock;
    MockUSD public usd;
    address[3] public actors;
    uint64 public expiry;
    constructor(Market m, MockStock s, MockUSD q) {
        market=m;stock=s;usd=q;expiry=uint64(block.timestamp+7 days);
        for(uint160 i;i<3;i++) {
            actors[i]=address(100+i); vm.startPrank(actors[i]);
            stock.faucet();usd.faucet();stock.approve(address(m),type(uint256).max);usd.approve(address(m),type(uint256).max);
            vm.stopPrank();
        }
    }
    function place(uint256 actorSeed, uint32 priceSeed, bool buy, bool put) external {
        if(block.timestamp>=expiry) return;
        address actor=actors[actorSeed%3];
        vm.prank(actor);
        // Self-trades and depleted wallets are expected to revert atomically.
        try market.placeOrder(put?1:0,1000,expiry,buy,uint32(bound(priceSeed,1,100))) {} catch {}
    }
    function cancel(uint256 seed) external {
        if(market.orderCount()==0) return;
        uint64 id=uint64(seed%market.orderCount()+1);Market.Order memory o=market.getOrder(id);
        if(o.state!=Market.OrderState.Open) return;
        vm.prank(o.owner);market.cancelOrder(id);
    }
    function resale(uint256 seed, uint32 price) external {
        if(market.optionCount()==0) return;
        OptionV4 o=OptionV4(market.options(seed%market.optionCount()));
        if(o.state()!=OptionV4.State.Active || block.timestamp>=o.expiry() || market.optionOrder(address(o))!=0) return;
        vm.prank(o.buyer());try market.placeResale(address(o),uint32(bound(price,1,100))) {} catch {}
    }
    function settle(uint256 seed) external {
        if(market.optionCount()==0) return;
        OptionV4 o=OptionV4(market.options(seed%market.optionCount()));
        if(uint8(o.state())>1) return;
        if(block.timestamp>=o.expiry()) {vm.prank(o.writer());o.reclaimExpired();}
        else if(o.state()==OptionV4.State.Active) {
            vm.startPrank(o.buyer());stock.approve(address(o),1e18);usd.approve(address(o),10e6);
            try o.exercise() {} catch {} vm.stopPrank();
        }
    }
    function advance(uint256 seed) external {vm.warp(block.timestamp+bound(seed,0,12 hours));}
}
contract MarketV4InvariantTest is StdInvariant, Test {
    Market market;MockStock stock;MockUSD usd;V4Handler handler;
    function setUp() public {
        stock=new MockStock();usd=new MockUSD();market=new Market(address(stock),address(usd));handler=new V4Handler(market,stock,usd);
        bytes4[] memory selectors=new bytes4[](5);
        selectors[0]=handler.place.selector;selectors[1]=handler.cancel.selector;selectors[2]=handler.resale.selector;selectors[3]=handler.settle.selector;selectors[4]=handler.advance.selector;
        targetSelector(FuzzSelector({addr:address(handler),selectors:selectors}));targetContract(address(handler));
    }
    function invariantFundsAndPriceTimePriority() public view {
        uint256 reserved;uint256 totalStock=stock.balanceOf(address(market));uint256 totalUSD=usd.balanceOf(address(market));
        for(uint256 i;i<3;i++) {totalStock+=stock.balanceOf(handler.actors(i));totalUSD+=usd.balanceOf(handler.actors(i));}
        for(uint64 id=1;id<=market.orderCount();id++) {Market.Order memory o=market.getOrder(id);if(o.buy&&o.state==Market.OrderState.Open) reserved+=uint256(o.price)*10000;}
        assertEq(market.reservedPremium(),reserved);assertEq(usd.balanceOf(address(market)),reserved);
        for(uint256 i;i<market.optionCount();i++) {
            OptionV4 o=OptionV4(market.options(i));uint256 s=stock.balanceOf(address(o));uint256 q=usd.balanceOf(address(o));
            assertEq(o.underlyingAmount(),1e18);assertTrue(o.funded());
            if(uint8(o.state())<=1) {assertEq(s,o.optionType()==0?1e18:0);assertEq(q,o.optionType()==1?10e6:0);}
            else {assertEq(s,0);assertEq(q,0);}
            if(o.state()==OptionV4.State.Active) assertTrue(o.buyer()!=o.writer());
            totalStock+=s;totalUSD+=q;
        }
        assertEq(totalStock,30e18);assertEq(totalUSD,30_000e6);
        for(uint8 kind;kind<2;kind++) {
            bytes32 key=market.seriesKey(kind,1000,handler.expiry());uint64 bid;uint64 ask;
            for(uint64 id=1;id<=market.orderCount();id++) {
                Market.Order memory o=market.getOrder(id);
                if(o.series!=key||o.state!=Market.OrderState.Open||block.timestamp>=handler.expiry()) continue;
                if(o.buy) {if(bid==0||o.price>market.getOrder(bid).price) bid=id;}
                else if(ask==0||o.price<market.getOrder(ask).price) ask=id;
            }
            assertEq(market.bestOrder(key,true),bid);assertEq(market.bestOrder(key,false),ask);
            if(bid!=0&&ask!=0) assertLt(market.getOrder(bid).price,market.getOrder(ask).price);
        }
    }
}
