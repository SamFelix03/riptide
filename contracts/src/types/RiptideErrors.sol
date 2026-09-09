// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title RiptideErrors
/// @notice Canonical custom errors for RIPTIDE (CONTRACTS.md §3).
library RiptideErrors {
    // config / decode
    error RiptideZeroAddress();
    error RiptideIdenticalTokens(address token);
    error RiptideUnsupportedTokenDecimals(address token, uint8 decimals);
    error RiptideInvalidEncodingLength(uint256 actual, uint256 expected);
    error RiptideInvalidEncodingMagic(bytes4 actual, bytes4 expected);
    error RiptideUnsupportedEncodingVersion(uint8 actual, uint8 supported);
    error RiptideInvalidFeeBounds(uint24 feeMin, uint24 feeMax);
    error RiptideInvalidLambda(uint64 lambda);
    error RiptideInvalidBeta(uint64 beta);
    error RiptideInvalidDecay(uint64 decay);
    error RiptideInvalidSigmaBounds(uint64 sigmaMin, uint64 sigmaMax);

    // runtime auth / lifecycle
    error RiptideStrategyHashMismatch(bytes32 supplied, bytes32 computed);
    error RiptideStaleVersion(uint64 expected, uint64 actual);
    error RiptideStrategyNotActive(bytes32 strategyHash);
    error RiptideDeadlineExpired(uint40 deadline, uint256 timestamp);
    error RiptideUnauthorizedResolver(address caller);
    error RiptideUnauthorizedObserver(address caller);
    error RiptideReentrantExecution();

    // mechanism-2 economic guards
    error RiptideNoSurplus(int256 surplusWad);
    error RiptideAuctionWindowClosed(uint40 start, uint16 duration, uint256 nowTs);
    error RiptideStaleBaseline();

    // fee guard
    error RiptideFeeOutOfRange(uint256 feeBps, uint256 surplusBps);

    // oracle
    error RiptideStaleOracleRound(uint256 updatedAt, uint16 maxStaleness);
    error RiptideNonPositivePrice(int256 answer);

    // math domains
    error RiptideMathDivisionByZero();
    error RiptideMathOverflow();
    error RiptideMathUnderflow();
    error RiptideAmountOverflow(uint256 amount);
    error RiptideLogInputOutOfDomain(uint256 inputWad);
    error RiptideExpInputOutOfDomain(int256 inputWad);
    error RiptidePowOutOfDomain(uint256 baseWad, int256 exponentWad);

    // routing
    error RiptideSlippageExceeded(uint256 actual, uint256 limit);
    error RiptideTooManyFills(uint256 actual, uint256 maximum);
    error RiptideDuplicateStrategy(bytes32 strategyKey);
    error RiptideSwapFailed();
}
