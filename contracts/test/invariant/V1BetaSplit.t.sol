// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideMakerTraits } from "../../src/core/RiptideMakerTraits.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";
import { DiamondSplitOverPay } from "../negative/DiamondSplitOverPay.sol";

/// @notice V1: β-split conservation on live rebalance path.
contract V1BetaSplitTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function _shipRebalance() internal returns (ISwapVM.Order memory order) {
        strategy.feeProvider = address(provider);
        order =
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
        rebalanceRouter.registerStrategy(strategyKey, orderHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken));
        vm.stopPrank();
    }

    function test_v1BetaSplitConservation() public {
        ISwapVM.Order memory order = _shipRebalance();

        uint256 resolverBefore = tokenQuote.balanceOf(resolver);
        tokenQuote.mint(taker, 500_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        (uint256 amountIn,,) =
            rebalanceRouter.swap(order, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();

        uint256 resolverGain = tokenQuote.balanceOf(resolver) - resolverBefore;
        uint256 surplus = amountIn - kernel.staleBaselineIn(1e18, strategy.reserveBaseWad, strategy.reserveQuoteWad, RiptideTypes.QuoteKind.ExactOutput);
        (uint256 pay, uint256 retain) = _split(surplus, strategy.auction.beta);

        assertEq(pay + retain, surplus);
        assertGe(retain, WadMulDiv.mulDiv(strategy.auction.beta, surplus, WadMulDiv.WAD, WadMulDiv.Rounding.Down));
        assertEq(resolverGain, pay);
    }

    function test_v1_negativeControlMustFail() public pure {
        uint256 surplus = 1000;
        uint256 beta = 950_000_000_000_000_000;
        (uint256 pay, uint256 retain) = DiamondSplitOverPay.split(surplus, beta);
        assertEq(pay + retain, surplus);
        uint256 minRetain = WadMulDiv.mulDiv(beta, surplus, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        assertLt(retain, minRetain, "over-pay breaks beta floor");
        pay;
    }

    function _split(uint256 surplus, uint64 beta) internal pure returns (uint256 pay, uint256 retain) {
        pay = WadMulDiv.mulDiv(
            WadMulDiv.WAD - beta, surplus, WadMulDiv.WAD, WadMulDiv.Rounding.Down
        );
        retain = surplus - pay;
    }
}
