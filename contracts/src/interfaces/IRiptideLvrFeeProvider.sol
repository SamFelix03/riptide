// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IProtocolFeeProvider } from "@1inch/swap-vm/instructions/interfaces/IProtocolFeeProvider.sol";

import { RiptideTypes } from "../types/RiptideTypes.sol";

/// @title IRiptideLvrFeeProvider
/// @notice Mechanism 1 fee provider with router-gated PI advancement.
interface IRiptideLvrFeeProvider is IProtocolFeeProvider {
    function registerStrategy(bytes32 strategyKey, bytes32 orderHash, RiptideTypes.FeePolicy calldata fee, address receiver)
        external;

    function advanceController(bytes32 strategyKey) external returns (uint24 feeReported, uint24 feeTarget);

    function controllerState(bytes32 strategyKey) external view returns (uint24 feeReported, int192 integral);
}
