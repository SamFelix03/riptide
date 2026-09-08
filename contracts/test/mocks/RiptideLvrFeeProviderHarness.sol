// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideLvrFeeProvider } from "../../src/fees/RiptideLvrFeeProvider.sol";
import { IRiptideVolatilityOracle } from "../../src/oracle/IRiptideVolatilityOracle.sol";

/// @notice Test harness exposing controller snapshot seeding.
contract RiptideLvrFeeProviderHarness is RiptideLvrFeeProvider {
    constructor(IRiptideVolatilityOracle oracle_, address router_, address rebalanceRouter_, address owner_)
        RiptideLvrFeeProvider(oracle_, router_, rebalanceRouter_, owner_)
    {}

    function setControllerState(bytes32 strategyKey, uint24 feeReported, int192 integral) external {
        _controller[strategyKey].feeReported = feeReported;
        _controller[strategyKey].integral = integral;
    }

    function getFeeBpsUnclamped(bytes32 orderHash) external view returns (uint32) {
        StrategyRegistration memory reg = _byOrderHash[orderHash];
        return uint32(_controller[reg.strategyKey].feeReported);
    }
}
