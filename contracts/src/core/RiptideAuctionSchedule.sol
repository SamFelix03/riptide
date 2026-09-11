// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Calldata } from "@1inch/solidity-utils/contracts/libraries/Calldata.sol";
import { Power } from "@1inch/swap-vm/libs/Power.sol";
import { Context, ContextLib } from "@1inch/swap-vm/libs/VM.sol";

/// @title RiptideAuctionArgs
/// @notice Argument codec for RIPTIDE's declining-price rebalance schedule.
/// @dev Byte layout is deliberately identical to swap-vm's `DutchAuctionArgsBuilder`
///      (`uint40 start ‖ uint16 duration ‖ uint64 decay`, 15 bytes) so program bytes —
///      and therefore every live Aqua order hash — are unchanged. Only the ownership of
///      the code changes; see RiptideAuctionSchedule below for why.
library RiptideAuctionArgs {
    using Calldata for bytes;

    error RiptideAuctionDecayFactorTooLarge(uint64 decayFactor);
    error RiptideAuctionMissingStartTime();
    error RiptideAuctionMissingDuration();
    error RiptideAuctionMissingDecayFactor();

    function build(uint40 startTime, uint16 duration, uint64 decayFactor)
        internal
        pure
        returns (bytes memory)
    {
        require(decayFactor < 1e18, RiptideAuctionDecayFactorTooLarge(decayFactor));
        return abi.encodePacked(startTime, duration, decayFactor);
    }

    function parse(bytes calldata args)
        internal
        pure
        returns (uint40 startTime, uint16 duration, uint64 decayFactor)
    {
        startTime = uint40(bytes5(args.slice(0, 5, RiptideAuctionMissingStartTime.selector)));
        duration = uint16(bytes2(args.slice(5, 7, RiptideAuctionMissingDuration.selector)));
        decayFactor = uint64(bytes8(args.slice(7, 15, RiptideAuctionMissingDecayFactor.selector)));
    }
}

/// @title RiptideAuctionSchedule
/// @notice RIPTIDE-owned instructions that apply the declining-price rebalance schedule
///         by scaling the Aqua-seeded reserve registers before the CPMM leg runs.
///
/// @dev **Why RIPTIDE owns these rather than importing swap-vm's `DutchAuction`.**
///
///      In swap-vm v1.0.2 the opcode set is split by curve shape. `AquaOpcodes` is the
///      AMM group (non-linear curves: `XYCSwap`, `Decay`, `XYCConcentrate`, the fee
///      instructions) and is what the deployed `AquaSwapVMRouter` dispatches.
///      `LimitOpcodes` is the limit-order group (linear exchange ratios: `LimitSwap`,
///      `MinRate`, `Invalidators`, `TWAPSwap` …) — and `DutchAuction` lives there, not in
///      `AquaOpcodes`. 1inch's own SDK mirrors this: `AquaProgramBuilder` exposes no
///      `dutchAuction*`, only `RegularProgramBuilder` does.
///
///      RIPTIDE is an AMM. Borrowing an instruction out of the limit-order group into an
///      AMM router would mix the two sets that 1inch explicitly warns are incompatible,
///      and would couple us to an opcode whose semantics are free to evolve inside the
///      forthcoming `LimitSwapRouter`. So the schedule is a RIPTIDE instruction instead.
///
///      What it does is deliberately AMM-shaped: it only *scales a reserve register*, it
///      never prices a swap. `XYCSwap` still computes every amount from the constant
///      product curve — the schedule just shifts that curve over time, which is what makes
///      the rebalance right cheaper the longer it goes unclaimed. It must therefore run
///      before the swap leg, which the guard below enforces.
///
///      The arithmetic is unchanged from the reference implementation, so the recorded
///      differential vectors and the on-chain schedule continue to agree to the wei.
abstract contract RiptideAuctionSchedule {
    using ContextLib for Context;
    using Math for uint256;
    using Power for uint256;

    error RiptideAuctionMustPrecedeSwap(uint256 amountIn, uint256 amountOut);
    error RiptideAuctionWindowExpired(uint256 currentTime, uint256 deadline);

    /// @notice Shrink the maker's demanded input over the auction window.
    /// @dev `balanceIn *= decay^elapsed`, so the resolver pays less the longer it waits —
    ///      and the surplus retained for the LP shrinks with it.
    function _riptideAuctionBalanceIn(Context memory ctx, bytes calldata args) internal view {
        (uint256 balanceIn, uint256 decay) = _scheduleFactor(ctx, args);
        ctx.swap.balanceIn = balanceIn.mulDiv(decay, 1e18);
    }

    /// @notice Mirror of the above for the output register.
    function _riptideAuctionBalanceOut(Context memory ctx, bytes calldata args) internal view {
        (uint256 balanceOut, uint256 decay) = _scheduleFactorOut(ctx, args);
        ctx.swap.balanceOut = balanceOut.mulDiv(1e18, decay);
    }

    function _scheduleFactor(Context memory ctx, bytes calldata args)
        private
        view
        returns (uint256 balanceIn, uint256 decay)
    {
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            RiptideAuctionMustPrecedeSwap(ctx.swap.amountIn, ctx.swap.amountOut)
        );
        (uint40 startTime, uint16 duration, uint64 decayFactor) = RiptideAuctionArgs.parse(args);
        require(
            block.timestamp <= uint256(startTime) + duration,
            RiptideAuctionWindowExpired(block.timestamp, uint256(startTime) + duration)
        );
        decay = uint256(decayFactor).pow(block.timestamp - startTime, 1e18);
        balanceIn = ctx.swap.balanceIn;
    }

    function _scheduleFactorOut(Context memory ctx, bytes calldata args)
        private
        view
        returns (uint256 balanceOut, uint256 decay)
    {
        require(
            ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0,
            RiptideAuctionMustPrecedeSwap(ctx.swap.amountIn, ctx.swap.amountOut)
        );
        (uint40 startTime, uint16 duration, uint64 decayFactor) = RiptideAuctionArgs.parse(args);
        require(
            block.timestamp <= uint256(startTime) + duration,
            RiptideAuctionWindowExpired(block.timestamp, uint256(startTime) + duration)
        );
        decay = uint256(decayFactor).pow(block.timestamp - startTime, 1e18);
        balanceOut = ctx.swap.balanceOut;
    }
}
