// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { WadMulDiv } from "../libraries/WadMulDiv.sol";
import { CpmmMath } from "../libraries/CpmmMath.sol";
import { DiamondSplit } from "../libraries/DiamondSplit.sol";
import { DutchPow } from "../libraries/DutchPow.sol";
import { IRiptideRebalanceKernel } from "../interfaces/IRiptideRebalanceKernel.sol";

/// @title RiptideRebalanceKernel
/// @notice Stateless Mechanism 2 math kernel kept below EIP-170 (CONTRACTS.md §9).
contract RiptideRebalanceKernel is IRiptideRebalanceKernel {
    /// @inheritdoc IRiptideRebalanceKernel
    /// @dev ExactOutput: input required on stale curve for `outWad` with vector fee.
    ///      ExactInput: symmetric path with reserves swapped (output-sized rebalance leg).
    function staleBaselineIn(uint256 outWad, uint128 reserveInWad, uint128 reserveOutWad, RiptideTypes.QuoteKind kind)
        external
        pure
        returns (uint256 staleInWad)
    {
        if (kind == RiptideTypes.QuoteKind.ExactOutput) {
            return CpmmMath.exactOut(reserveInWad, reserveOutWad, outWad, 0);
        }
        return CpmmMath.exactOut(reserveOutWad, reserveInWad, outWad, 0);
    }

    /// @inheritdoc IRiptideRebalanceKernel
    function splitSurplus(uint256 executedInWad, uint256 staleInWad, uint64 beta)
        external
        pure
        returns (RiptideTypes.RebalanceResult memory result)
    {
        if (executedInWad < staleInWad) {
            revert RiptideErrors.RiptideNoSurplus(int256(executedInWad) - int256(staleInWad));
        }
        uint256 surplus = executedInWad - staleInWad;
        (uint256 payToResolver, uint256 retainToLP) = DiamondSplit.split(surplus, beta);
        result = RiptideTypes.RebalanceResult({
            surplusWad: surplus,
            payToResolver: payToResolver,
            retainToLP: retainToLP
        });
    }

    /// @inheritdoc IRiptideRebalanceKernel
    function auctionBalance(uint128 balanceWad, uint40 start, uint16 duration, uint64 decay, bool isIn, uint256 nowTs)
        external
        pure
        returns (uint128)
    {
        if (nowTs > uint256(start) + duration) {
            revert RiptideErrors.RiptideAuctionWindowClosed(start, duration, nowTs);
        }
        uint256 elapsed = nowTs - start;
        uint256 factor = DutchPow.pow(decay, elapsed);
        if (isIn) {
            return uint128(WadMulDiv.mulDiv(balanceWad, factor, WadMulDiv.WAD, WadMulDiv.Rounding.Down));
        }
        return uint128(WadMulDiv.mulDiv(balanceWad, WadMulDiv.WAD, factor, WadMulDiv.Rounding.Down));
    }
}
