// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { WadMulDiv } from "./WadMulDiv.sol";

/// @title DutchPow
/// @notice Integer-exponent WAD power (matches SwapVM Power.sol).
library DutchPow {
    using WadMulDiv for uint256;

    function pow(uint256 baseWad, uint256 exponent) internal pure returns (uint256 result) {
        result = WadMulDiv.WAD;
        uint256 base = baseWad;
        uint256 exp = exponent;
        while (exp > 0) {
            if (exp & 1 == 1) {
                result = WadMulDiv.mulDiv(result, base, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
            }
            base = WadMulDiv.mulDiv(base, base, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
            exp >>= 1;
        }
    }
}
