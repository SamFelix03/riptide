// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Power } from "@1inch/swap-vm/libs/Power.sol";
import { Context, ContextLib } from "@1inch/swap-vm/libs/VM.sol";
import { DutchAuctionArgsBuilder } from "@1inch/swap-vm/instructions/DutchAuction.sol";

/// @notice Dutch auction handlers copied from swap-vm DutchAuction (avoids inheritance linearization conflict).
abstract contract RiptideDutchHandlers {
    using ContextLib for Context;
    using Math for uint256;
    using Power for uint256;

    error DutchAuctionShouldBeAppliedBeforeSwapAmountsComputed(uint256 amountIn, uint256 amountOut);
    error DutchAuctionExpired(uint256 currentTime, uint256 deadline);

    function _dutchAuctionBalanceIn1D(Context memory ctx, bytes calldata args) internal view {
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            DutchAuctionShouldBeAppliedBeforeSwapAmountsComputed(ctx.swap.amountIn, ctx.swap.amountOut)
        );

        (uint256 startTime, uint256 duration, uint256 decayFactor) = DutchAuctionArgsBuilder.parse(args);
        require(block.timestamp <= startTime + duration, DutchAuctionExpired(block.timestamp, startTime + duration));
        uint256 elapsed = block.timestamp - startTime;
        uint256 decay = decayFactor.pow(elapsed, 1e18);
        ctx.swap.balanceIn = ctx.swap.balanceIn * decay / 1e18;
    }

    function _dutchAuctionBalanceOut1D(Context memory ctx, bytes calldata args) internal view {
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            DutchAuctionShouldBeAppliedBeforeSwapAmountsComputed(ctx.swap.amountIn, ctx.swap.amountOut)
        );

        (uint256 startTime, uint256 duration, uint256 decayFactor) = DutchAuctionArgsBuilder.parse(args);
        require(block.timestamp <= startTime + duration, DutchAuctionExpired(block.timestamp, startTime + duration));
        uint256 elapsed = block.timestamp - startTime;
        uint256 decay = decayFactor.pow(elapsed, 1e18);
        ctx.swap.balanceOut = ctx.swap.balanceOut * 1e18 / decay;
    }
}
