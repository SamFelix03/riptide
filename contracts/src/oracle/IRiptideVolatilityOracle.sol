// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IRiptideVolatilityOracle
/// @notice On-chain realized-volatility estimator (CONTRACTS.md §7).
interface IRiptideVolatilityOracle {
    function sigmaWad(bytes32 strategyKey) external view returns (uint128);
    function varWad(bytes32 strategyKey) external view returns (uint128);

    /// @notice Advances EWMA with a new observation. No-op when isStatic is true.
    function observe(bytes32 strategyKey, uint128 priceWad, uint40 ts, bool isStatic)
        external
        returns (uint128 sigmaWad);

    function observeRange(bytes32 strategyKey, uint128 h, uint128 l, uint128 c, uint128 o, uint40 ts)
        external
        returns (uint128 sigmaWad);
}
