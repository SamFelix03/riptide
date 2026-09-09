// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideRebalanceKernel } from "../../src/core/RiptideRebalanceKernel.sol";

/// @notice Gate 5: Mechanism 2 β-split rebalance settlement.
contract Mechanism2Test is RiptideForkBase {
    RiptideRebalanceKernel internal kernelRef;

    function setUp() public {
        _deploySystem();
        kernelRef = kernel;
    }

    function test_rebalanceSettlesSurplus() public {
        strategy.feeProvider = address(provider);
        ISwapVM.Order memory order =
            rebalanceRouter.buildRebalanceOrder(maker, strategy, uint40(block.timestamp + 1 hours), 1e18, resolver, true);
        orderHash = rebalanceRouter.hash(order);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(order), _tokens(), _amounts(100e18, 200_000e18));
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);
        rebalanceRouter.registerStrategy(
            strategyKey, orderHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken)
        );
        vm.stopPrank();

        uint256 resolverBefore = tokenQuote.balanceOf(resolver);
        tokenQuote.mint(taker, 500_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        rebalanceRouter.swap(order, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();

        assertGt(tokenQuote.balanceOf(resolver), resolverBefore, "resolver receives beta rebate");
    }

    function test_noSurplusKernelReverts() public {
        vm.expectRevert();
        kernelRef.splitSurplus(100, 200, 950_000_000_000_000_000);
    }
}
