// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title RiptideTypes
/// @notice Shared structs and enums for RIPTIDE contracts (CONTRACTS.md §2).
library RiptideTypes {
    enum QuoteKind {
        ExactInput,
        ExactOutput
    }

    struct FeePolicy {
        uint24 feeMin;
        uint24 feeMax;
        uint64 lambda;
        uint64 kp;
        uint64 ki;
        uint64 iMax;
        uint64 sigmaMin;
        uint64 sigmaMax;
    }

    struct AuctionPolicy {
        uint64 beta;
        uint16 duration;
        uint64 decay;
        uint16 antiSandwichPeriod;
    }

    struct OracleConfig {
        address feed;
        uint8 decimals;
        uint16 maxStaleness;
    }

    struct Strategy {
        address maker;
        address baseToken;
        address quoteToken;
        uint128 reserveBaseWad;
        uint128 reserveQuoteWad;
        FeePolicy fee;
        AuctionPolicy auction;
        OracleConfig oracle;
        address feeProvider;
        bytes32 salt;
    }

    struct ControllerState {
        uint24 feeReported;
        int192 integral;
        uint128 varWad;
        uint40 lastObsTs;
        uint128 lastPriceWad;
        uint40 lastRebalanceTs;
        uint64 version;
        bool initialized;
    }

    struct RebalanceResult {
        uint256 surplusWad;
        uint256 payToResolver;
        uint256 retainToLP;
    }
}
