// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { CpmmMath } from "../../src/libraries/CpmmMath.sol";

/// @notice Gate 4: Mechanism 1 dynamic fee + quote/swap parity.
contract Mechanism1Test is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_swapChargesCommittedFee_quoteSwapParity() public {
        ISwapVM.Order memory order = _shipAndRegister();

        (, uint256 quoteOut,) = _quoteExactIn(order, 1000e18);
        assertGt(quoteOut, 0);

        (uint256 swapIn, uint256 swapOut,) = _riptideSwapExactIn(order, 1000e18);
        assertGt(swapOut, 0);
        assertEq(swapIn, 1000e18);
        assertEq(quoteOut, swapOut, "quote/swap amountOut parity");

        (uint24 feeReported,) = provider.controllerState(strategyKey);
        assertEq(feeReported, strategy.fee.feeMin, "dynamic fee at sigma=0 equals feeMin");
    }

    /// @notice The fee SwapVM actually charges must equal the fee RIPTIDE's own CpmmMath models.
    /// @dev RIPTIDE denominates fees in 1e7 and swap-vm in 1e9, so the provider scales by 100 at the
    ///      IProtocolFeeProvider boundary. If that conversion is missing or wrong, the VM charges a
    ///      different fee than `CpmmMath` (and than every off-chain quote), and this test fails.
    ///      Existing coverage could not catch it: the quoter/router differential asserts only that
    ///      those two agree, and both run the same VM program.
    function test_vmFeeMatchesCpmmMathAtRiptideScale() public {
        ISwapVM.Order memory order = _shipAndRegister();

        uint256 amountIn = 1000e18;
        (, uint256 vmOut,) = _quoteExactIn(order, amountIn);

        (uint24 feeReported,) = provider.controllerState(strategyKey);
        // Reserves the router seeds from Aqua: tokenIn = quote, tokenOut = base.
        uint256 expectedOut = CpmmMath.exactIn(
            strategy.reserveQuoteWad, strategy.reserveBaseWad, amountIn, feeReported
        );

        // Allow 1 wei: the VM subtracts a floored fee then swaps, CpmmMath floors the net input.
        assertApproxEqAbs(vmOut, expectedOut, 1, "VM fee scale must match CpmmMath 1e7 scale");
    }

    /// @notice A higher committed fee must actually reduce the taker's output.
    /// @dev Guards against the fee silently rounding to zero, which is what a 100x-too-small
    ///      scale produces for small fee values.
    function test_higherFeeReducesOutput() public {
        // Strategy A at the default 30_000 (0.3%).
        ISwapVM.Order memory orderLow = _shipAndRegister();
        (, uint256 outLowFee,) = _quoteExactIn(orderLow, 1000e18);

        // Strategy B, identical but at 300_000 (3%), shipped under a fresh salt.
        strategy.fee.feeMin = 300_000;
        strategy.salt = bytes32(uint256(2));
        ISwapVM.Order memory orderHigh = _shipAndRegister();
        (, uint256 outHighFee,) = _quoteExactIn(orderHigh, 1000e18);

        assertLt(outHighFee, outLowFee, "a 10x higher fee must reduce taker output");

        // Output must track the fee at RIPTIDE 1e7 scale. At the broken 1e9 scale both
        // quotes would be within a few wei of the zero-fee result and of each other.
        uint256 expectedHigh = CpmmMath.exactIn(
            strategy.reserveQuoteWad, strategy.reserveBaseWad, 1000e18, 300_000
        );
        assertApproxEqAbs(outHighFee, expectedHigh, 1, "3% fee output must match CpmmMath");

        // Sanity on magnitude: 3% vs 0.3% on 1000e18 in is ~27e18 of quote withheld,
        // which at this pool's price is a clearly measurable output difference.
        assertGt(outLowFee - outHighFee, 0.01e18, "fee difference must be economically visible");
    }
}
