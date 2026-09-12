// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Runtime: rebalance bumps rebalance-router version.
contract RuntimeVersionTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function _shipRebalance() internal returns (ISwapVM.Order memory order) {
        strategy.feeProvider = address(provider);
        order =
            rebalanceRouter.buildRebalanceOrder(maker, strategy, uint40(block.timestamp + 1 hours), 1e18, true);
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

    function test_rebalanceBumpsRuntimeVersion() public {
        ISwapVM.Order memory order = _shipRebalance();
        assertEq(rebalanceRouter.runtimeState(strategyKey).version, 0);

        tokenQuote.mint(taker, 500_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        rebalanceRouter.swap(order, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();

        assertEq(rebalanceRouter.runtimeState(strategyKey).version, 1);
        assertEq(swapRouter.strategyVersion(strategyKey), 1, "swap version unchanged by rebalance");
    }
}
