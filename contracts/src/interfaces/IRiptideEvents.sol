// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";

/// @title IRiptideEvents
/// @notice Canonical events consumed by the subgraph (CONTRACTS.md §4).
interface IRiptideEvents {
    /// @notice Materialize immutable runtime for a strategy.
    event StrategyRuntimeInitialized(
        bytes32 indexed strategyKey,
        bytes32 indexed marketId,
        address indexed maker,
        bytes32 strategyHash,
        uint128 reserveBaseWad,
        uint128 reserveQuoteWad,
        uint64 version
    );

    /// @notice One taker swap; carries the fee actually applied (Mechanism 1).
    event SwapFilled(
        bytes32 indexed routeId,
        bytes32 indexed strategyKey,
        address indexed maker,
        bytes32 marketId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint24 feeBpsApplied,
        uint128 sigmaWad,
        uint128 reserveBaseAfterWad,
        uint128 reserveQuoteAfterWad,
        uint64 versionAfter
    );

    /// @notice One rebalance; carries the β-split (Mechanism 2).
    event RebalanceSettled(
        bytes32 indexed strategyKey,
        address indexed maker,
        address indexed resolver,
        bytes32 marketId,
        address tokenIn,
        address tokenOut,
        uint256 executedInWad,
        uint256 staleInWad,
        uint256 surplusWad,
        uint256 retainToLPWad,
        uint256 payToResolverWad,
        uint128 revealedPriceWad,
        uint64 versionAfter
    );

    /// @notice One settlement through `RiptideAuctionSettler`, from the caller's point of view.
    /// @dev    The router's `RebalanceSettled` names the VM taker, which on this path is the
    ///         settler contract - correct, but it hides which address actually funded the
    ///         settlement and received the rebate. This is that receipt: `settledBy` is the
    ///         `msg.sender` that paid `amountInWad` of quote and received `outWad` of base
    ///         plus `payToResolverWad`.
    event AuctionSettled(
        bytes32 indexed strategyKey,
        address indexed settledBy,
        address indexed maker,
        uint256 outWad,
        uint256 amountInWad,
        uint256 surplusWad,
        uint256 payToResolverWad,
        uint256 retainToLPWad
    );

    /// @notice Fee controller advanced (Mechanism 1 telemetry).
    event FeeControllerUpdated(
        bytes32 indexed strategyKey, uint128 sigmaWad, uint24 feeTarget, uint24 feeReported
    );

    /// @notice Aggregate atomic taker route.
    event RouteExecuted(
        bytes32 indexed routeId,
        bytes32 indexed marketId,
        address indexed payer,
        address recipient,
        RiptideTypes.QuoteKind kind,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 limit,
        uint16 fillCount
    );
}
