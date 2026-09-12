// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideMakerTraits } from "../../src/core/RiptideMakerTraits.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { BrokenRebalanceProgram } from "../negative/BrokenRebalanceProgram.sol";

/// @notice V5: expired rebalance reverts before Aqua balances change.
contract V5DeadlineFirstTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function _shipRebalance(uint40 deadline) internal returns (ISwapVM.Order memory order) {
        strategy.feeProvider = address(provider);
        order =
            rebalanceRouter.buildRebalanceOrder(maker, strategy, deadline, 1e18, true);
        orderHash = rebalanceRouter.hash(order);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(order), _tokens(), _amounts(100e18, 200_000e18));
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);
        rebalanceRouter.registerStrategy(strategyKey, orderHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken));
        vm.stopPrank();
    }

    function test_v5ExpiredRebalanceBalancesUnchanged() public {
        ISwapVM.Order memory order = _shipRebalance(uint40(block.timestamp + 100));

        (uint256 baseBefore, uint256 quoteBefore) =
            aqua.safeBalances(maker, address(rebalanceRouter), orderHash, address(tokenBase), address(tokenQuote));

        vm.warp(block.timestamp + 101);
        tokenQuote.mint(taker, 500_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        vm.expectRevert();
        rebalanceRouter.swap(order, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();

        (uint256 baseAfter, uint256 quoteAfter) =
            aqua.safeBalances(maker, address(rebalanceRouter), orderHash, address(tokenBase), address(tokenQuote));
        assertEq(baseBefore, baseAfter);
        assertEq(quoteBefore, quoteAfter);
    }

    function test_v5_negativeControlMustFail() public {
        strategy.feeProvider = address(provider);
        RiptideTypes.Strategy memory s = strategy;
        bytes memory data = bytes.concat(
            RiptideStrategyCodec.encode(s),
            BrokenRebalanceProgram.build(s, uint40(block.timestamp - 1), 1, true)
        );
        ISwapVM.Order memory order = RiptideMakerTraits.buildOrder(maker, data);
        orderHash = rebalanceRouter.hash(order);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(order), _tokens(), _amounts(100e18, 200_000e18));
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);
        rebalanceRouter.registerStrategy(strategyKey, orderHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken));
        vm.stopPrank();

        tokenQuote.mint(taker, 500_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        vm.expectRevert();
        rebalanceRouter.swap(order, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();
    }
}
