// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { WadMulDiv } from "./WadMulDiv.sol";
import { LnExpMath } from "./LnExpMath.sol";

/// @title VolatilityMath
/// @notice EWMA + Garman-Klass realized volatility (LVR_MATH.md §3).
library VolatilityMath {
    using WadMulDiv for uint256;

    function ewmaVar(uint128 prevVarWad, int256 logReturnWad, uint64 lambdaWad, uint128 gkTermWad, bool useGk)
        internal
        pure
        returns (uint128 varWad)
    {
        uint256 r2 = uint256(logReturnWad >= 0 ? logReturnWad : -logReturnWad);
        r2 = WadMulDiv.mulDiv(r2, r2, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        uint256 obs = r2;
        if (useGk) {
            obs += gkTermWad;
        }
        uint256 oneMinus = WadMulDiv.WAD - uint256(lambdaWad);
        uint256 next = WadMulDiv.mulDiv(lambdaWad, prevVarWad, WadMulDiv.WAD, WadMulDiv.Rounding.Down)
            + WadMulDiv.mulDiv(oneMinus, obs, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        varWad = uint128(next);
    }

    function gkTerm(uint256 highWad, uint256 lowWad, uint256 closeWad, uint256 openWad) internal pure returns (uint128) {
        int256 hl = LnExpMath.lnWad(WadMulDiv.mulDiv(highWad, WadMulDiv.WAD, lowWad, WadMulDiv.Rounding.Down));
        int256 co = LnExpMath.lnWad(WadMulDiv.mulDiv(closeWad, WadMulDiv.WAD, openWad, WadMulDiv.Rounding.Down));
        uint256 hl2 = WadMulDiv.mulDiv(uint256(hl >= 0 ? hl : -hl), uint256(hl >= 0 ? hl : -hl), WadMulDiv.WAD, WadMulDiv.Rounding.Down) / 2;
        uint256 ln2CoeffWad = 2 * 693147180559945309 - WadMulDiv.WAD;
        uint256 co2 = WadMulDiv.mulDiv(uint256(co >= 0 ? co : -co), uint256(co >= 0 ? co : -co), WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        uint256 termCo = WadMulDiv.mulDiv(ln2CoeffWad, co2, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        uint256 gk = hl2 > termCo ? hl2 - termCo : 0;
        return uint128(gk);
    }

    function sigmaFromVar(uint128 varWad, uint64 dtWad, uint64 sigmaMinWad, uint64 sigmaMaxWad) internal pure returns (uint128 sigmaWad) {
        if (varWad == 0) {
            sigmaWad = 0;
        } else {
            uint256 ratio = WadMulDiv.mulDiv(varWad, WadMulDiv.WAD, dtWad, WadMulDiv.Rounding.Down);
            sigmaWad = uint128(LnExpMath.sqrtWad(ratio));
        }
        if (sigmaWad < sigmaMinWad) return sigmaMinWad;
        if (sigmaWad > sigmaMaxWad) return sigmaMaxWad;
    }

    function applyStaleFreeze(uint128 sigmaPrevWad, uint128 sigmaCandidateWad, bool isStale) internal pure returns (uint128) {
        return isStale ? sigmaPrevWad : sigmaCandidateWad;
    }
}
