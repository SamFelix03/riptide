// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { FeeController } from "../libraries/FeeController.sol";
import { IRiptideVolatilityOracle } from "../oracle/IRiptideVolatilityOracle.sol";
import { IRiptideLvrFeeProvider } from "../interfaces/IRiptideLvrFeeProvider.sol";
import { IRiptideEvents } from "../interfaces/IRiptideEvents.sol";

/// @title RiptideLvrFeeProvider
/// @notice Mechanism 1: dynamic LVR fee provider for FeeProtocol (CONTRACTS.md §8).
/// @dev Implements pinned IProtocolFeeProvider.getFeeBpsAndRecipient (RESOLUTIONS.md §5).
contract RiptideLvrFeeProvider is IRiptideLvrFeeProvider, IRiptideEvents {
    uint256 internal constant BPS = 1e7;

    struct StrategyRegistration {
        bytes32 strategyKey;
        address receiver;
        RiptideTypes.FeePolicy fee;
    }

    struct ControllerSnapshot {
        uint24 feeReported;
        int192 integral;
    }

    IRiptideVolatilityOracle public immutable ORACLE;
    address public immutable ROUTER;
    address public immutable REBALANCE_ROUTER;
    address public immutable owner;

    mapping(bytes32 orderHash => StrategyRegistration) internal _byOrderHash;
    mapping(bytes32 strategyKey => StrategyRegistration) internal _byStrategyKey;
    mapping(bytes32 strategyKey => ControllerSnapshot) internal _controller;

    modifier onlyRouterOrOwner() {
        if (msg.sender != ROUTER && msg.sender != owner) revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        _;
    }

    modifier onlyRouter() {
        if (msg.sender != ROUTER && msg.sender != REBALANCE_ROUTER) {
            revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        }
        _;
    }

    constructor(IRiptideVolatilityOracle oracle_, address router_, address rebalanceRouter_, address owner_) {
        if (address(oracle_) == address(0) || owner_ == address(0)) {
            revert RiptideErrors.RiptideZeroAddress();
        }
        ORACLE = oracle_;
        ROUTER = router_;
        REBALANCE_ROUTER = rebalanceRouter_;
        owner = owner_;
    }

    function registerStrategy(bytes32 strategyKey, bytes32 orderHash, RiptideTypes.FeePolicy calldata fee, address receiver)
        external
        onlyRouterOrOwner
    {
        if (receiver == address(0)) revert RiptideErrors.RiptideZeroAddress();
        if (fee.feeMin == 0 || fee.feeMin >= fee.feeMax || fee.feeMax >= BPS) {
            revert RiptideErrors.RiptideInvalidFeeBounds(fee.feeMin, fee.feeMax);
        }

        StrategyRegistration memory reg = StrategyRegistration({ strategyKey: strategyKey, receiver: receiver, fee: fee });
        _byOrderHash[orderHash] = reg;
        _byStrategyKey[strategyKey] = reg;

        ControllerSnapshot storage snap = _controller[strategyKey];
        if (snap.feeReported == 0) {
            snap.feeReported = fee.feeMin;
        }
    }

    function getFeeBpsAndRecipient(bytes32 orderHash, address, address, address, address, bool)
        external
        view
        returns (uint32 feeBps, address to)
    {
        StrategyRegistration memory reg = _byOrderHash[orderHash];
        if (reg.receiver == address(0)) {
            revert RiptideErrors.RiptideStrategyNotActive(orderHash);
        }

        ControllerSnapshot memory snap = _controller[reg.strategyKey];
        uint24 reported = snap.feeReported;
        if (reported < reg.fee.feeMin || reported > reg.fee.feeMax || reported >= BPS) {
            revert RiptideErrors.RiptideFeeOutOfRange(reported, 0);
        }

        return (uint32(reported), reg.receiver);
    }

    function advanceController(bytes32 strategyKey) external onlyRouter returns (uint24 feeReported, uint24 feeTarget_) {
        StrategyRegistration memory reg = _byStrategyKey[strategyKey];
        if (reg.receiver == address(0)) revert RiptideErrors.RiptideStrategyNotActive(strategyKey);

        ControllerSnapshot storage snap = _controller[strategyKey];
        uint128 sigmaWad = ORACLE.sigmaWad(strategyKey);
        feeTarget_ = FeeController.feeTarget(sigmaWad, reg.fee.lambda, reg.fee.feeMin, reg.fee.feeMax);

        FeeController.PiState memory state = FeeController.PiState({
            feeReported: snap.feeReported,
            integral: snap.integral,
            kp: reg.fee.kp,
            ki: reg.fee.ki,
            iMax: reg.fee.iMax,
            feeMin: reg.fee.feeMin,
            feeMax: reg.fee.feeMax
        });
        (feeReported, snap.integral) = FeeController.piStep(state, feeTarget_);
        snap.feeReported = feeReported;

        emit FeeControllerUpdated(strategyKey, sigmaWad, feeTarget_, feeReported);
    }

    function feeTarget(bytes32 strategyKey) external view returns (uint24) {
        StrategyRegistration memory reg = _byStrategyKey[strategyKey];
        if (reg.receiver == address(0)) revert RiptideErrors.RiptideStrategyNotActive(strategyKey);
        uint128 sigmaWad = ORACLE.sigmaWad(strategyKey);
        return FeeController.feeTarget(sigmaWad, reg.fee.lambda, reg.fee.feeMin, reg.fee.feeMax);
    }

    function controllerState(bytes32 strategyKey) external view returns (uint24 feeReported, int192 integral) {
        ControllerSnapshot memory snap = _controller[strategyKey];
        return (snap.feeReported, snap.integral);
    }
}
