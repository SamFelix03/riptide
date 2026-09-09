// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";

/// @title IRiptideRebalanceKernel
/// @notice Stateless surplus/baseline/auction kernel (CONTRACTS.md §9).
interface IRiptideRebalanceKernel {
    function staleBaselineIn(uint256 outWad, uint128 reserveInWad, uint128 reserveOutWad, RiptideTypes.QuoteKind kind)
        external
        pure
        returns (uint256 staleInWad);

    function splitSurplus(uint256 executedInWad, uint256 staleInWad, uint64 beta)
        external
        pure
        returns (RiptideTypes.RebalanceResult memory);

    function auctionBalance(uint128 balanceWad, uint40 start, uint16 duration, uint64 decay, bool isIn, uint256 nowTs)
        external
        pure
        returns (uint128);
}
