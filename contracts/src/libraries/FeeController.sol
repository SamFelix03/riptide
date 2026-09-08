// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { WadMulDiv } from "./WadMulDiv.sol";

/// @title FeeController
/// @notice Break-even fee target and clamped PI controller (LVR_MATH.md §4).
library FeeController {
    using WadMulDiv for uint256;

    uint256 internal constant BPS = 1e7;

    struct PiState {
        uint24 feeReported;
        int192 integral;
        uint64 kp;
        uint64 ki;
        uint64 iMax;
        uint24 feeMin;
        uint24 feeMax;
    }

    function feeTarget(uint256 sigmaWad, uint256 lambdaQ, uint24 feeMin, uint24 feeMax) internal pure returns (uint24) {
        uint256 sigma2 = WadMulDiv.mulDiv(sigmaWad, sigmaWad, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        uint256 phiStar = WadMulDiv.mulDiv(sigma2, WadMulDiv.WAD, 8 * lambdaQ, WadMulDiv.Rounding.Down);
        uint256 raw = WadMulDiv.mulDiv(phiStar, BPS, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        if (raw < feeMin) return feeMin;
        if (raw > feeMax) return feeMax;
        return uint24(raw);
    }

    function piStep(PiState memory state, uint24 target) internal pure returns (uint24 feeReported, int192 integral) {
        int256 error = int256(uint256(target)) - int256(uint256(state.feeReported));
        int256 kiError = int256(uint256(state.ki)) * error / int256(WadMulDiv.WAD);
        integral = _clampIntegral(state.integral + kiError, state.iMax);
        int256 kpError = int256(uint256(state.kp)) * error / int256(WadMulDiv.WAD);
        int256 next = int256(uint256(state.feeReported)) + kpError + integral;
        if (next < int256(uint256(state.feeMin))) next = int256(uint256(state.feeMin));
        if (next > int256(uint256(state.feeMax))) next = int256(uint256(state.feeMax));
        feeReported = uint24(uint256(next));
    }

    function _clampIntegral(int256 value, uint64 iMax) private pure returns (int192) {
        int256 maxI = int256(uint256(iMax));
        if (value > maxI) return int192(maxI);
        if (value < -maxI) return int192(-maxI);
        return int192(value);
    }
}
