// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { IRiptideEvents } from "./IRiptideEvents.sol";

/// @title IRiptideBatchExecutor
/// @notice Atomic multi-strategy taker settlement (CONTRACTS.md §14).
interface IRiptideBatchExecutor is IRiptideEvents {
    struct FillRequest {
        bytes order;
        address maker;
        bytes32 strategyKey;
        uint64 expectedVersion;
        uint256 amount;
    }

    struct Route {
        address base;
        address quote;
        RiptideTypes.QuoteKind kind;
        address payer;
        address recipient;
        address refundRecipient;
        uint40 deadline;
        bytes32 salt;
        uint256 aggregateLimit;
        FillRequest[] fills;
    }

    function execute(Route calldata route) external payable returns (uint256 amountIn, uint256 amountOut);
}
