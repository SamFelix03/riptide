// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";

/// @title IRiptideQuoter
/// @notice View-only quote helpers (CONTRACTS.md §13).
interface IRiptideQuoter {
    function quoteSwap(RiptideTypes.Strategy calldata s, RiptideTypes.QuoteKind kind, uint256 rawAmount)
        external
        view
        returns (uint256 amountIn, uint256 amountOut, uint24 feeBpsApplied, uint128 sigmaWad);

    function previewRebalance(RiptideTypes.Strategy calldata s, uint256 outWad)
        external
        view
        returns (RiptideTypes.RebalanceResult memory result, uint128 auctionPriceNowWad);
}
