// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/libs/TakerTraits.sol";

import { IRiptideQuoter } from "../interfaces/IRiptideQuoter.sol";
import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { RiptideSwapVMRouter } from "../core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../core/RiptideRebalanceRouter.sol";
import { RiptideRebalanceKernel } from "../core/RiptideRebalanceKernel.sol";
import { RiptideConstants } from "../core/RiptideConstants.sol";
import { RiptideStrategyCodec } from "../core/RiptideStrategyCodec.sol";
import { IRiptideLvrFeeProvider } from "../interfaces/IRiptideLvrFeeProvider.sol";
import { IRiptideVolatilityOracle } from "../oracle/IRiptideVolatilityOracle.sol";

/// @title RiptideQuoter
/// @notice View-only quotes wrapping router `asView().quote` (CONTRACTS.md §13).
contract RiptideQuoter is IRiptideQuoter {
    RiptideSwapVMRouter public immutable SWAP_ROUTER;
    RiptideRebalanceRouter public immutable REBALANCE_ROUTER;
    RiptideRebalanceKernel public immutable KERNEL;
    IRiptideLvrFeeProvider public immutable FEE_PROVIDER;
    IRiptideVolatilityOracle public immutable ORACLE;

    constructor(address swapRouter, address rebalanceRouter, address kernel, address feeProvider, address oracle) {
        if (
            swapRouter == address(0) || rebalanceRouter == address(0) || kernel == address(0)
                || feeProvider == address(0) || oracle == address(0)
        ) {
            revert RiptideErrors.RiptideZeroAddress();
        }
        SWAP_ROUTER = RiptideSwapVMRouter(payable(swapRouter));
        REBALANCE_ROUTER = RiptideRebalanceRouter(payable(rebalanceRouter));
        KERNEL = RiptideRebalanceKernel(kernel);
        FEE_PROVIDER = IRiptideLvrFeeProvider(feeProvider);
        ORACLE = IRiptideVolatilityOracle(oracle);
    }

    /// @inheritdoc IRiptideQuoter
    function quoteSwap(RiptideTypes.Strategy calldata s, RiptideTypes.QuoteKind kind, uint256 rawAmount)
        external
        view
        returns (uint256 amountIn, uint256 amountOut, uint24 feeBpsApplied, uint128 sigmaWad)
    {
        ISwapVM.Order memory order = SWAP_ROUTER.buildSwapOrder(s.maker, s, RiptideConstants.SWAP_ORDER_DEADLINE);
        bool exactIn = kind == RiptideTypes.QuoteKind.ExactInput;
        bytes memory takerData = _quoteTakerData(exactIn);

        (amountIn, amountOut,) = SWAP_ROUTER.asView().quote(order, s.quoteToken, s.baseToken, rawAmount, takerData);

        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKey(s.maker, s.salt);
        (feeBpsApplied,) = FEE_PROVIDER.controllerState(strategyKey);
        sigmaWad = ORACLE.sigmaWad(strategyKey);
    }

    /// @inheritdoc IRiptideQuoter
    function previewRebalance(RiptideTypes.Strategy calldata s, uint256 outWad, address resolver)
        external
        view
        returns (RiptideTypes.RebalanceResult memory result, uint128 auctionPriceNowWad)
    {
        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKey(s.maker, s.salt);
        uint40 auctionStart = REBALANCE_ROUTER.rebalanceAuctionStart(strategyKey);
        if (auctionStart == 0) {
            revert RiptideErrors.RiptideRebalanceAuctionStartMissing(strategyKey);
        }

        ISwapVM.Order memory order = REBALANCE_ROUTER.buildRebalanceOrderWithAuctionStart(
            s.maker, s, RiptideConstants.SWAP_ORDER_DEADLINE, outWad, resolver, true, auctionStart
        );

        bytes memory takerData = _quoteTakerData(false);
        (uint256 amountIn,,) = REBALANCE_ROUTER.asView().quote(order, s.quoteToken, s.baseToken, outWad, takerData);

        uint256 staleInWad =
            KERNEL.staleBaselineIn(outWad, s.reserveBaseWad, s.reserveQuoteWad, RiptideTypes.QuoteKind.ExactOutput);
        result = KERNEL.splitSurplus(amountIn, staleInWad, s.auction.beta);

        auctionPriceNowWad = KERNEL.auctionBalance(
            s.reserveQuoteWad, auctionStart, s.auction.duration, s.auction.decay, true, block.timestamp
        );
    }

    function _quoteTakerData(bool exactIn) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: address(0),
                isExactIn: exactIn,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: false,
                threshold: "",
                to: address(0),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }
}
