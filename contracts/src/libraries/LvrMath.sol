// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { WadMulDiv } from "./WadMulDiv.sol";

/// @title LvrMath
/// @notice CPMM LVR rate ell = sigma^2/8 * V (LVR_MATH.md §2.1).
library LvrMath {
    using WadMulDiv for uint256;

    function lvrRateCpmm(uint256 sigmaWad, uint256 valueWad) internal pure returns (uint256 ellWad) {
        uint256 sigma2 = WadMulDiv.mulDiv(sigmaWad, sigmaWad, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        return WadMulDiv.mulDiv(sigma2, valueWad, 8 * WadMulDiv.WAD, WadMulDiv.Rounding.Down);
    }
}
