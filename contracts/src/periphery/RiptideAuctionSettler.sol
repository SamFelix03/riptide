// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/libs/TakerTraits.sol";

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { RiptideRebalanceRouter } from "../core/RiptideRebalanceRouter.sol";
import { RiptideRebalanceKernel } from "../core/RiptideRebalanceKernel.sol";
import { RiptideConstants } from "../core/RiptideConstants.sol";
import { RiptideStrategyCodec } from "../core/RiptideStrategyCodec.sol";

/// @title RiptideAuctionSettler
/// @notice Permissionless rebalance settlement for resolvers (CONTRACTS.md §12).
contract RiptideAuctionSettler {
    using SafeERC20 for IERC20;

    RiptideRebalanceRouter public immutable REBALANCE_ROUTER;
    RiptideRebalanceKernel public immutable KERNEL;

    constructor(address rebalanceRouter, address kernel) {
        if (rebalanceRouter == address(0) || kernel == address(0)) revert RiptideErrors.RiptideZeroAddress();
        REBALANCE_ROUTER = RiptideRebalanceRouter(payable(rebalanceRouter));
        KERNEL = RiptideRebalanceKernel(kernel);
    }

    function settleRebalance(
        address maker,
        RiptideTypes.Strategy calldata s,
        uint256 outWad,
        uint256 maxInWad,
        uint40 deadline
    ) external returns (RiptideTypes.RebalanceResult memory result) {
        if (deadline < block.timestamp) revert RiptideErrors.RiptideDeadlineExpired(deadline, block.timestamp);

        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, s.salt);
        uint40 auctionStart = REBALANCE_ROUTER.rebalanceAuctionStart(strategyKey);
        if (auctionStart == 0) revert RiptideErrors.RiptideRebalanceAuctionStartMissing(strategyKey);

        ISwapVM.Order memory order = REBALANCE_ROUTER.buildRebalanceOrderWithAuctionStart(
            maker, s, RiptideConstants.SWAP_ORDER_DEADLINE, outWad, msg.sender, true, auctionStart
        );

        uint256 staleInWad = KERNEL.staleBaselineIn(
            outWad, s.reserveBaseWad, s.reserveQuoteWad, RiptideTypes.QuoteKind.ExactOutput
        );

        IERC20(s.quoteToken).safeTransferFrom(msg.sender, address(this), maxInWad);
        IERC20(s.quoteToken).forceApprove(address(REBALANCE_ROUTER), maxInWad);

        bytes memory takerData = TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: address(this),
                isExactIn: false,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: true,
                useTransferFromAndAquaPush: true,
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

        (uint256 amountIn,,) = REBALANCE_ROUTER.swap(order, s.quoteToken, s.baseToken, outWad, takerData);

        if (amountIn > maxInWad) revert RiptideErrors.RiptideSlippageExceeded(amountIn, maxInWad);

        uint256 refund = IERC20(s.quoteToken).balanceOf(address(this));
        if (refund > 0) {
            IERC20(s.quoteToken).safeTransfer(msg.sender, refund);
        }
        IERC20(s.quoteToken).forceApprove(address(REBALANCE_ROUTER), 0);

        result = KERNEL.splitSurplus(amountIn, staleInWad, s.auction.beta);
    }
}
