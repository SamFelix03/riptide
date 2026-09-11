// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Runtime: first-fill initialization emits version == 1.
contract RuntimeInitTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_runtimeInitEmitsVersionOne() public {
        strategy.feeProvider = address(provider);
        ISwapVM.Order memory order = swapRouter.buildSwapOrder(maker, strategy, uint40(block.timestamp + 1 hours));
        orderHash = swapRouter.hash(order);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        vm.expectEmit(true, true, true, true);
        emit RiptideSwapVMRouter.StrategyRuntimeInitialized(
            strategyKey,
            RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken),
            maker,
            orderHash,
            strategy.reserveBaseWad,
            strategy.reserveQuoteWad,
            1
        );

        vm.prank(maker);
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);

        assertEq(swapRouter.strategyVersion(strategyKey), 1);
    }
}
