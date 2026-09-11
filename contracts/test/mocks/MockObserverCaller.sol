// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideVolatilityOracle } from "../../src/oracle/RiptideVolatilityOracle.sol";

/// @notice Forwards observe calls as an authorized router.
contract MockObserverCaller {
    RiptideVolatilityOracle public immutable oracle;

    constructor(RiptideVolatilityOracle oracle_) {
        oracle = oracle_;
    }

    function observe(bytes32 strategyKey, uint128 priceWad, uint40 ts, bool isStatic) external returns (uint128) {
        return oracle.observe(strategyKey, priceWad, ts, isStatic);
    }

    function observeRange(bytes32 strategyKey, uint128 h, uint128 l, uint128 c, uint128 o, uint40 ts)
        external
        returns (uint128)
    {
        return oracle.observeRange(strategyKey, h, l, c, o, ts);
    }

    function configureStrategy(bytes32 strategyKey, RiptideTypes.FeePolicy calldata fee, RiptideTypes.OracleConfig calldata oracleCfg)
        external
    {
        oracle.configureStrategy(strategyKey, fee, oracleCfg);
    }
}
