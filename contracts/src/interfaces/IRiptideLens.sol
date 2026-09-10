// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";

/// @title IRiptideLens
/// @notice Strategy reconciliation lens (CONTRACTS.md §13).
interface IRiptideLens {
    struct StrategyState {
        RiptideTypes.ControllerState runtime;
        uint24 feeReported;
        uint128 sigmaWad;
        uint256 aquaBase;
        uint256 aquaQuote;
        uint256 walletBase;
        uint256 walletQuote;
        uint256 allowanceBase;
        uint256 allowanceQuote;
        uint64 swapVersion;
    }

    function strategyState(address maker, bytes32 strategyHash, address base, address quote)
        external
        view
        returns (StrategyState memory state);
}
