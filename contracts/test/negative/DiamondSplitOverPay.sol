// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";

/// @notice Negative control: over-pays resolver (must fail V1 conservation).
library DiamondSplitOverPay {
    using WadMulDiv for uint256;

    function split(uint256 surplusWad, uint256 betaWad) internal pure returns (uint256 payToResolver, uint256 retainToLP) {
        if (int256(surplusWad) < 0) revert RiptideErrors.RiptideNoSurplus(int256(surplusWad));
        if (betaWad == 0 || betaWad >= WadMulDiv.WAD) revert RiptideErrors.RiptideInvalidBeta(uint64(betaWad));
        payToResolver = WadMulDiv.mulDiv(WadMulDiv.WAD - betaWad, surplusWad, WadMulDiv.WAD, WadMulDiv.Rounding.Down) + 1;
        retainToLP = surplusWad - payToResolver;
    }
}
