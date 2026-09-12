// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { Vm } from "forge-std/Vm.sol";

/// @notice Permissionless auction settler fork tests.
contract AuctionSettlerTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_permissionlessSettlePaysResolver() public {
        strategy.feeProvider = address(provider);
        _shipRebalanceStrategy();

        tokenQuote.mint(resolver, 500_000e18);
        uint256 quoteBefore = tokenQuote.balanceOf(resolver);
        uint256 baseBefore = tokenBase.balanceOf(resolver);

        vm.startPrank(resolver);
        tokenQuote.approve(address(settler), type(uint256).max);
        RiptideTypes.RebalanceResult memory result =
            settler.settleRebalance(maker, strategy, 1e18, 500_000e18, uint40(block.timestamp + 1 hours));
        vm.stopPrank();

        assertGt(result.payToResolver, 0);
        // Both legs have to reach the caller. The settler is the VM taker, so the bought
        // base lands on it first; if it is not swept the caller pays quote for nothing.
        assertEq(tokenBase.balanceOf(resolver) - baseBefore, 1e18, "caller receives outWad of base");
        uint256 amountIn = kernel.staleBaselineIn(
            1e18, strategy.reserveBaseWad, strategy.reserveQuoteWad, RiptideTypes.QuoteKind.ExactOutput
        ) + result.surplusWad;
        assertEq(
            quoteBefore - tokenQuote.balanceOf(resolver),
            amountIn - result.payToResolver,
            "caller paid amountIn net of the beta rebate"
        );
        assertEq(tokenBase.balanceOf(address(settler)), 0, "settler holds no base");
        assertEq(tokenQuote.balanceOf(address(settler)), 0, "settler holds no quote");
    }

    /// @notice Any address can settle - nothing about the resolver is baked into the order.
    function test_anyAddressCanSettle() public {
        strategy.feeProvider = address(provider);
        _shipRebalanceStrategy();

        address stranger = address(0xB0B);
        tokenQuote.mint(stranger, 500_000e18);
        uint256 quoteBefore = tokenQuote.balanceOf(stranger);

        vm.startPrank(stranger);
        tokenQuote.approve(address(settler), type(uint256).max);
        RiptideTypes.RebalanceResult memory result =
            settler.settleRebalance(maker, strategy, 1e18, 500_000e18, uint40(block.timestamp + 1 hours));
        vm.stopPrank();

        assertGt(result.payToResolver, 0);
        assertEq(tokenBase.balanceOf(stranger), 1e18, "stranger receives the bought base");
        uint256 amountIn = kernel.staleBaselineIn(
            1e18, strategy.reserveBaseWad, strategy.reserveQuoteWad, RiptideTypes.QuoteKind.ExactOutput
        ) + result.surplusWad;
        assertEq(
            quoteBefore - tokenQuote.balanceOf(stranger),
            amountIn - result.payToResolver,
            "stranger was rebated the same way any resolver would be"
        );
        assertEq(tokenQuote.balanceOf(resolver), 0, "the old designated resolver gets nothing");
    }

    /// @notice The settler's own receipt names the caller, not the VM taker.
    function test_auctionSettledEventNamesTheCaller() public {
        strategy.feeProvider = address(provider);
        _shipRebalanceStrategy();

        address stranger = address(0xB0B);
        tokenQuote.mint(stranger, 500_000e18);

        // Predict the split so the event can be matched exactly rather than loosely.
        uint256 staleIn = kernel.staleBaselineIn(
            1e18, strategy.reserveBaseWad, strategy.reserveQuoteWad, RiptideTypes.QuoteKind.ExactOutput
        );

        vm.startPrank(stranger);
        tokenQuote.approve(address(settler), type(uint256).max);
        vm.recordLogs();
        RiptideTypes.RebalanceResult memory result =
            settler.settleRebalance(maker, strategy, 1e18, 500_000e18, uint40(block.timestamp + 1 hours));
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("AuctionSettled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)");
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != topic) continue;
            seen = true;
            assertEq(logs[i].emitter, address(settler), "emitted by the settler");
            assertEq(address(uint160(uint256(logs[i].topics[2]))), stranger, "settledBy is msg.sender");
            assertEq(address(uint160(uint256(logs[i].topics[3]))), maker, "maker");
            (uint256 outWad, uint256 amountInWad, uint256 surplusWad, uint256 payWad, uint256 retainWad) =
                abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, uint256));
            assertEq(outWad, 1e18, "outWad");
            assertEq(amountInWad, staleIn + result.surplusWad, "amountIn");
            assertEq(surplusWad, result.surplusWad, "surplus");
            assertEq(payWad, result.payToResolver, "payToResolver");
            assertEq(retainWad, result.retainToLP, "retainToLP");
        }
        assertTrue(seen, "AuctionSettled was emitted");
    }

    function test_expiredSettleReverts() public {
        strategy.feeProvider = address(provider);
        _shipRebalanceStrategy();

        vm.warp(block.timestamp + 2 hours);
        tokenQuote.mint(resolver, 500_000e18);
        vm.startPrank(resolver);
        tokenQuote.approve(address(settler), type(uint256).max);
        vm.expectRevert();
        settler.settleRebalance(maker, strategy, 1e18, 500_000e18, uint40(block.timestamp - 1));
        vm.stopPrank();
    }
}
