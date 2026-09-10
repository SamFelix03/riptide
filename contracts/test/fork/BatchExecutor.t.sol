// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { IRiptideBatchExecutor } from "../../src/interfaces/IRiptideBatchExecutor.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Multi-maker atomic batch routes (Gate 7).
contract BatchExecutorTest is RiptideForkBase {
    address internal maker2 = makeAddr("maker2");
    bytes32 internal strategyKey2;
    bytes32 internal orderHash2;
    ISwapVM.Order internal order1;
    ISwapVM.Order internal order2;

    function setUp() public {
        _deploySystem();
        _shipMaker1();
        _shipMaker2();
    }

    function _shipMaker1() internal {
        strategy.feeProvider = address(provider);
        order1 = swapRouter.buildSwapOrder(maker, strategy, uint40(block.timestamp + 1 hours));
        orderHash = swapRouter.hash(order1);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(swapRouter), abi.encode(order1), _tokens(), _amounts(100e18, 200_000e18));
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);
        rebalanceRouter.registerStrategy(
            strategyKey, orderHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken)
        );
        vm.stopPrank();
    }

    function _shipMaker2() internal {
        RiptideTypes.Strategy memory s2 = strategy;
        s2.maker = maker2;
        s2.salt = bytes32(uint256(2));
        order2 = swapRouter.buildSwapOrder(maker2, s2, uint40(block.timestamp + 1 hours));
        orderHash2 = swapRouter.hash(order2);
        strategyKey2 = RiptideStrategyCodec.runtimeStrategyKey(maker2, s2.salt);

        tokenBase.mint(maker2, 1000e18);
        tokenQuote.mint(maker2, 2_000_000e18);
        vm.startPrank(maker2);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(swapRouter), abi.encode(order2), _tokens(), _amounts(100e18, 200_000e18));
        swapRouter.registerStrategy(strategyKey2, orderHash2, s2, maker2);
        rebalanceRouter.registerStrategy(
            strategyKey2, orderHash2, RiptideStrategyCodec.marketId(s2.baseToken, s2.quoteToken)
        );
        vm.stopPrank();
    }

    function _routeExactIn(uint256 amt1, uint256 amt2) internal view returns (IRiptideBatchExecutor.Route memory route) {
        IRiptideBatchExecutor.FillRequest[] memory fills = new IRiptideBatchExecutor.FillRequest[](2);
        fills[0] = IRiptideBatchExecutor.FillRequest({
            order: abi.encode(order1),
            maker: maker,
            strategyKey: strategyKey,
            expectedVersion: 0,
            amount: amt1
        });
        fills[1] = IRiptideBatchExecutor.FillRequest({
            order: abi.encode(order2),
            maker: maker2,
            strategyKey: strategyKey2,
            expectedVersion: 0,
            amount: amt2
        });
        route = IRiptideBatchExecutor.Route({
            base: address(tokenBase),
            quote: address(tokenQuote),
            kind: RiptideTypes.QuoteKind.ExactInput,
            payer: taker,
            recipient: taker,
            refundRecipient: taker,
            deadline: uint40(block.timestamp + 1 hours),
            salt: bytes32(uint256(1)),
            aggregateLimit: 1,
            fills: fills
        });
    }

    function test_batchExactInTwoMakers() public {
        IRiptideBatchExecutor.Route memory route = _routeExactIn(1000e18, 500e18);
        (uint256 inAmt, uint256 outAmt) = _executeBatch(route);
        assertGt(inAmt, 0);
        assertGt(outAmt, 0);
        assertGt(tokenBase.balanceOf(taker), 0);
    }

    function test_batchExactOutTwoMakers() public {
        IRiptideBatchExecutor.FillRequest[] memory fills = new IRiptideBatchExecutor.FillRequest[](2);
        fills[0] = IRiptideBatchExecutor.FillRequest({
            order: abi.encode(order1),
            maker: maker,
            strategyKey: strategyKey,
            expectedVersion: 0,
            amount: 1e18
        });
        fills[1] = IRiptideBatchExecutor.FillRequest({
            order: abi.encode(order2),
            maker: maker2,
            strategyKey: strategyKey2,
            expectedVersion: 0,
            amount: 1e18
        });
        IRiptideBatchExecutor.Route memory route = IRiptideBatchExecutor.Route({
            base: address(tokenBase),
            quote: address(tokenQuote),
            kind: RiptideTypes.QuoteKind.ExactOutput,
            payer: taker,
            recipient: taker,
            refundRecipient: taker,
            deadline: uint40(block.timestamp + 1 hours),
            salt: bytes32(uint256(2)),
            aggregateLimit: type(uint256).max,
            fills: fills
        });
        (uint256 inAmt, uint256 outAmt) = _executeBatch(route);
        assertEq(outAmt, 2e18);
        assertGt(inAmt, 0);
    }

    function test_batchStaleVersionReverts() public {
        IRiptideBatchExecutor.Route memory route = _routeExactIn(1000e18, 500e18);
        route.fills[0].expectedVersion = 99;

        tokenQuote.mint(taker, 10_000_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(batchExecutor), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideStaleVersion.selector, uint64(99), uint64(0)));
        batchExecutor.execute(route);
        vm.stopPrank();
    }

    function test_batchRollbackOnFailure() public {
        IRiptideBatchExecutor.Route memory route = _routeExactIn(1000e18, 500e18);
        route.aggregateLimit = type(uint256).max / 2;

        tokenQuote.mint(taker, 10_000_000e18);
        uint256 quoteBefore = tokenQuote.balanceOf(taker);
        uint256 baseBefore = tokenBase.balanceOf(taker);

        vm.startPrank(taker);
        tokenQuote.approve(address(batchExecutor), type(uint256).max);
        vm.expectRevert();
        batchExecutor.execute(route);
        vm.stopPrank();

        assertEq(tokenBase.balanceOf(taker), baseBefore);
        assertEq(tokenQuote.balanceOf(taker), quoteBefore);
    }

    function test_batchRejectsSpoofedPayer() public {
        IRiptideBatchExecutor.Route memory route = _routeExactIn(1000e18, 500e18);
        tokenQuote.mint(taker, 10_000_000e18);
        vm.prank(taker);
        tokenQuote.approve(address(batchExecutor), type(uint256).max);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnauthorizedResolver.selector, attacker));
        batchExecutor.execute(route);
    }
}
