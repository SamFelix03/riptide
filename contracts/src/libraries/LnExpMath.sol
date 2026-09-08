// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { WadMulDiv } from "./WadMulDiv.sol";

/// @title LnExpMath
/// @notice Checked ln/exp/pow/sqrt over Solady backend (LVR_MATH.md §1.2).
library LnExpMath {
    using WadMulDiv for uint256;

    int256 internal constant EXP_WAD_MIN = -41446531673892822313;
    int256 internal constant EXP_WAD_MAX = 135305999368893231589;

    function lnWad(uint256 x) internal pure returns (int256) {
        if (x == 0 || x > uint256(type(int256).max)) revert RiptideErrors.RiptideLogInputOutOfDomain(x);
        return FixedPointMathLib.lnWad(int256(x));
    }

    function expWad(int256 x) internal pure returns (uint256) {
        if (x <= EXP_WAD_MIN) return 0;
        if (x >= EXP_WAD_MAX) revert RiptideErrors.RiptideExpInputOutOfDomain(x);
        return uint256(FixedPointMathLib.expWad(x));
    }

    function powWad(uint256 baseWad, int256 exponentWad) internal pure returns (uint256) {
        if (baseWad == 0) revert RiptideErrors.RiptidePowOutOfDomain(baseWad, exponentWad);
        if (exponentWad == 0) return WadMulDiv.WAD;
        if (baseWad == WadMulDiv.WAD) return WadMulDiv.WAD;
        if (exponentWad == int256(WadMulDiv.WAD)) return baseWad;

        int256 lnBase = lnWad(baseWad);
        int256 expArg = lnBase * exponentWad / int256(WadMulDiv.WAD);
        if (expArg <= EXP_WAD_MIN || expArg >= EXP_WAD_MAX) {
            revert RiptideErrors.RiptidePowOutOfDomain(baseWad, exponentWad);
        }
        return expWad(expArg);
    }

    function sqrtWad(uint256 x) internal pure returns (uint256) {
        return FixedPointMathLib.sqrt(x * WadMulDiv.WAD);
    }
}
