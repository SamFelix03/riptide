// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Calldata } from "@1inch/solidity-utils/contracts/libraries/Calldata.sol";
import { TransientLock, TransientLockLib } from "@1inch/solidity-utils/contracts/libraries/TransientLock.sol";

import { Context, ContextLib } from "@1inch/swap-vm/libs/VM.sol";

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { WadMulDiv } from "../libraries/WadMulDiv.sol";
import { IRiptideRebalanceKernel } from "../interfaces/IRiptideRebalanceKernel.sol";
import { IRiptideVolatilityOracle } from "../oracle/IRiptideVolatilityOracle.sol";
import { IRiptideLvrFeeProvider } from "../interfaces/IRiptideLvrFeeProvider.sol";
import { IRiptideEvents } from "../interfaces/IRiptideEvents.sol";

/// @title RiptideRebalanceInstruction
/// @notice Custom SwapVM instruction for Mechanism 2 surplus settlement (CONTRACTS.md §10).
abstract contract RiptideRebalanceInstruction is IRiptideEvents {
    using Calldata for bytes;
    using ContextLib for Context;
    using TransientLockLib for TransientLock;

    IRiptideRebalanceKernel public immutable KERNEL;
    IRiptideVolatilityOracle public immutable ORACLE;
    IRiptideLvrFeeProvider public immutable FEE_PROVIDER;

    mapping(bytes32 strategyKey => RiptideTypes.ControllerState) internal _runtime;
    mapping(bytes32 => bytes32) internal _marketIds;
    mapping(bytes32 => bytes32) internal _orderStrategyKeys;

    TransientLock internal _riptideLock;

    event RiptideRebalanceExecuted(bytes32 indexed orderHash);

    constructor(address kernel_, address oracle_, address feeProvider_) {
        if (kernel_ == address(0) || oracle_ == address(0) || feeProvider_ == address(0)) {
            revert RiptideErrors.RiptideZeroAddress();
        }
        KERNEL = IRiptideRebalanceKernel(kernel_);
        ORACLE = IRiptideVolatilityOracle(oracle_);
        FEE_PROVIDER = IRiptideLvrFeeProvider(feeProvider_);
    }

    function runtimeState(bytes32 strategyKey) external view returns (RiptideTypes.ControllerState memory) {
        return _runtime[strategyKey];
    }

    function orderStrategyKey(bytes32 orderHash) external view returns (bytes32) {
        return _orderStrategyKeys[orderHash];
    }

    function _riptideRebalanceOpcode(Context memory ctx, bytes calldata args) internal virtual {
        _riptideRebalance(ctx, args);
    }

    function _riptideRebalance(Context memory ctx, bytes calldata args) internal {
        if (args.length < 44) revert RiptideErrors.RiptideInvalidEncodingLength(args.length, 44);

        uint64 beta = uint64(bytes8(args[0:8]));
        uint128 staleInWad = uint128(bytes16(args[8:24]));
        address resolver = address(bytes20(args[24:44]));

        bytes32 strategyKey = _orderStrategyKeys[ctx.query.orderHash];
        if (strategyKey == bytes32(0)) {
            revert RiptideErrors.RiptideStrategyNotActive(ctx.query.orderHash);
        }

        RiptideTypes.RebalanceResult memory result = KERNEL.splitSurplus(ctx.swap.amountIn, staleInWad, beta);

        if (!ctx.vm.isStaticContext) {
            if (_riptideLock.isLocked()) revert RiptideErrors.RiptideReentrantExecution();
            _riptideLock.lock();
            if (result.payToResolver > 0) {
                _aquaPull(ctx.query.maker, ctx.query.orderHash, ctx.query.tokenIn, result.payToResolver, resolver);
            }

            uint128 revealedPriceWad = _revealedPriceWad(ctx);
            ORACLE.observe(strategyKey, revealedPriceWad, uint40(block.timestamp), false);
            FEE_PROVIDER.advanceController(strategyKey);
            _advanceRuntime(strategyKey, revealedPriceWad);

            emit RebalanceSettled(
                strategyKey,
                ctx.query.maker,
                resolver,
                _marketIds[strategyKey],
                ctx.query.tokenIn,
                ctx.query.tokenOut,
                ctx.swap.amountIn,
                staleInWad,
                result.surplusWad,
                result.retainToLP,
                result.payToResolver,
                revealedPriceWad,
                _runtime[strategyKey].version
            );
            emit RiptideRebalanceExecuted(ctx.query.orderHash);
            _riptideLock.unlock();
        }
    }

    function _advanceRuntime(bytes32 strategyKey, uint128 revealedPriceWad) internal {
        RiptideTypes.ControllerState storage st = _runtime[strategyKey];
        (st.feeReported, st.integral) = FEE_PROVIDER.controllerState(strategyKey);
        st.lastPriceWad = revealedPriceWad;
        st.lastRebalanceTs = uint40(block.timestamp);
        st.lastObsTs = uint40(block.timestamp);
        st.version += 1;
        st.initialized = true;
    }

    function _revealedPriceWad(Context memory ctx) internal pure returns (uint128) {
        uint256 reserveIn = ctx.swap.balanceIn;
        uint256 reserveOut = ctx.swap.balanceOut;
        if (reserveOut == 0) revert RiptideErrors.RiptideMathDivisionByZero();
        return uint128(WadMulDiv.mulDiv(reserveIn, WadMulDiv.WAD, reserveOut, WadMulDiv.Rounding.Down));
    }

    function _aquaPull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) internal virtual;
}
