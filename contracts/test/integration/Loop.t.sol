// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Gate 6: closed-loop fee update after rebalance observation.
contract LoopTest is RiptideForkBase {
    function setUp() public {
        vm.warp(10_000);
        _deploySystem();
    }

    function test_loopFeeUpdatesAfterRebalance() public {
        ISwapVM.Order memory swapOrder = _shipAndRegister();
        uint24 fee0 = _feeReported();
        uint128 sigma0 = oracle.sigmaWad(strategyKey);

        strategy.feeProvider = address(provider);
        ISwapVM.Order memory rebOrder =
            rebalanceRouter.buildRebalanceOrder(maker, strategy, uint40(block.timestamp + 1 hours), 1e18, resolver, true);
        bytes32 rebHash = rebalanceRouter.hash(rebOrder);

        tokenQuote.mint(maker, 5_000_000e18);
        vm.startPrank(maker);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(rebOrder), _tokens(), _amounts(100e18, 500_000e18));
        rebalanceRouter.registerStrategy(strategyKey, rebHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken));
        vm.stopPrank();

        vm.warp(block.timestamp + 600);
        tokenQuote.mint(taker, 1_000_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        rebalanceRouter.swap(rebOrder, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();

        uint128 sigma1 = oracle.sigmaWad(strategyKey);
        assertTrue(sigma1 != sigma0 || sigma0 == 0, "sigma should update after rebalance observe");

        uint24 fee1 = _feeReported();
        assertTrue(fee1 != fee0 || fee0 == strategy.fee.feeMin, "fee should move after controller advance");

        (, uint256 quoteOut,) = _quoteExactIn(swapOrder, 100e18);
        assertGt(quoteOut, 0);
    }
}
