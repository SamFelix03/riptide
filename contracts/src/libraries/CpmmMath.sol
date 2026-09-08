// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideErrors } from "../types/RiptideErrors.sol";
import { WadMulDiv } from "./WadMulDiv.sol";
import { LvrMath } from "./LvrMath.sol";

/// @title CpmmMath
/// @notice CPMM swap math (LVR_MATH.md §2.1).
library CpmmMath {
    using WadMulDiv for uint256;

    uint256 internal constant BPS = 1e7;

    function exactIn(uint256 reserveIn, uint256 reserveOut, uint256 amountIn, uint256 feeBps)
        internal
        pure
        returns (uint256 amountOut)
    {
        if (reserveIn == 0 || reserveOut == 0 || amountIn == 0) {
            revert RiptideErrors.RiptideMathDivisionByZero();
        }
        if (feeBps >= BPS) revert RiptideErrors.RiptideInvalidFeeBounds(uint24(feeBps), uint24(feeBps));
        uint256 inNet = WadMulDiv.mulDiv(amountIn, BPS - feeBps, BPS, WadMulDiv.Rounding.Down);
        uint256 denom = reserveIn + inNet;
        amountOut = WadMulDiv.mulDiv(reserveOut, inNet, denom, WadMulDiv.Rounding.Down);
    }

    function exactOut(uint256 reserveIn, uint256 reserveOut, uint256 amountOut, uint256 feeBps)
        internal
        pure
        returns (uint256 amountIn)
    {
        if (reserveIn == 0 || reserveOut == 0 || amountOut == 0 || amountOut >= reserveOut) {
            revert RiptideErrors.RiptideMathDivisionByZero();
        }
        if (feeBps >= BPS) revert RiptideErrors.RiptideInvalidFeeBounds(uint24(feeBps), uint24(feeBps));
        uint256 inNet = WadMulDiv.mulDiv(reserveIn, reserveOut, reserveOut - amountOut, WadMulDiv.Rounding.Up)
            - reserveIn;
        amountIn = WadMulDiv.mulDiv(inNet, BPS, BPS - feeBps, WadMulDiv.Rounding.Up);
    }

    function lvrGeneral(uint256 sigmaWad, uint256 priceWad, uint256 valueWad) internal pure returns (uint256) {
        uint256 vDoublePrime = WadMulDiv.mulDiv(
            valueWad,
            WadMulDiv.WAD,
            WadMulDiv.mulDiv(priceWad, priceWad, WadMulDiv.WAD, WadMulDiv.Rounding.Down),
            WadMulDiv.Rounding.Down
        ) / 4;
        uint256 sigma2P2 = WadMulDiv.mulDiv(
            WadMulDiv.mulDiv(sigmaWad, sigmaWad, WadMulDiv.WAD, WadMulDiv.Rounding.Down),
            WadMulDiv.mulDiv(priceWad, priceWad, WadMulDiv.WAD, WadMulDiv.Rounding.Down),
            WadMulDiv.WAD,
            WadMulDiv.Rounding.Down
        );
        return WadMulDiv.mulDiv(sigma2P2, vDoublePrime, 2 * WadMulDiv.WAD, WadMulDiv.Rounding.Down);
    }

    function lvrCpmm(uint256 sigmaWad, uint256 valueWad) internal pure returns (uint256) {
        return LvrMath.lvrRateCpmm(sigmaWad, valueWad);
    }
}
