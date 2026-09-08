// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideVolatilityOracle } from "../../src/oracle/RiptideVolatilityOracle.sol";

/// @notice Test harness exposing internal state seeding and negative-control paths.
contract RiptideVolatilityOracleHarness is RiptideVolatilityOracle {
    constructor(address router_, address swapRouter_, address volIndexer_)
        RiptideVolatilityOracle(router_, swapRouter_, volIndexer_)
    {}

    function seedState(
        bytes32 strategyKey,
        uint128 varWad_,
        uint128 sigmaWad_,
        uint40 lastObsTs_,
        uint128 lastPriceWad_,
        bool initialized_
    ) external {
        _state[strategyKey] = OracleState({
            varWad: varWad_,
            sigmaWad: sigmaWad_,
            lastObsTs: lastObsTs_,
            lastPriceWad: lastPriceWad_,
            initialized: initialized_
        });
    }

    function observeAlwaysMutate(bytes32 strategyKey, uint128 priceWad, uint40 ts) external returns (uint128) {
        return _observePrice(strategyKey, priceWad, ts, 0, false);
    }

    function observeWithLogReturn(
        bytes32 strategyKey,
        int256 logReturnWad,
        uint128 priceWad,
        uint40 ts,
        uint128 gkTermWad,
        bool useGk
    ) external returns (uint128) {
        return _observeWithLogReturn(strategyKey, logReturnWad, priceWad, ts, gkTermWad, useGk);
    }
}
