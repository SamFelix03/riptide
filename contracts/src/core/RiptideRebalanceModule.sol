// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { TransientLock, TransientLockLib } from "@1inch/solidity-utils/contracts/libraries/TransientLock.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { ControlsArgsBuilder } from "@1inch/swap-vm/instructions/Controls.sol";
import { DecayArgsBuilder } from "@1inch/swap-vm/instructions/Decay.sol";
import { DutchAuctionArgsBuilder } from "@1inch/swap-vm/instructions/DutchAuction.sol";

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { RiptideConstants } from "./RiptideConstants.sol";
import { RiptideMakerTraits } from "./RiptideMakerTraits.sol";
import { RiptideStrategyCodec } from "./RiptideStrategyCodec.sol";
import { WadMulDiv } from "../libraries/WadMulDiv.sol";
import { IRiptideRebalanceKernel } from "../interfaces/IRiptideRebalanceKernel.sol";
import { IRiptideVolatilityOracle } from "../oracle/IRiptideVolatilityOracle.sol";
import { IRiptideLvrFeeProvider } from "../interfaces/IRiptideLvrFeeProvider.sol";

interface IRiptideRebalanceApp {
    function pullForRebalance(address maker, bytes32 strategyHash, address token, uint256 amount, address to)
        external;

    function observeForRebalance(bytes32 strategyKey, uint128 priceWad, uint40 ts) external;

    function advanceControllerForRebalance(bytes32 strategyKey) external;

    function emitRebalanceSettled(
        bytes32 strategyKey,
        address maker,
        address resolver,
        bytes32 marketId,
        address tokenIn,
        address tokenOut,
        uint256 executedInWad,
        uint256 staleInWad,
        uint256 surplusWad,
        uint256 retainToLPWad,
        uint256 payToResolverWad,
        uint128 revealedPriceWad,
        uint64 versionAfter,
        bytes32 orderHash
    ) external;
}

/// @title RiptideRebalanceModule
/// @notice Mechanism 2 settlement logic extracted from the interpreter so the router fits EIP-170.
contract RiptideRebalanceModule {
    using TransientLockLib for TransientLock;
    using SafeCast for uint256;

    address public immutable ROUTER;
    IRiptideRebalanceKernel public immutable KERNEL;
    IRiptideVolatilityOracle public immutable ORACLE;
    IRiptideLvrFeeProvider public immutable FEE_PROVIDER;

    mapping(bytes32 strategyKey => RiptideTypes.ControllerState) internal _runtime;
    mapping(bytes32 => bytes32) internal _marketIds;
    mapping(bytes32 => bytes32) internal _orderStrategyKeys;
    mapping(bytes32 strategyKey => address) internal _makers;

    TransientLock internal _riptideLock;

    constructor(address kernel_, address oracle_, address feeProvider_, address router_) {
        if (kernel_ == address(0) || oracle_ == address(0) || feeProvider_ == address(0) || router_ == address(0)) {
            revert RiptideErrors.RiptideZeroAddress();
        }
        KERNEL = IRiptideRebalanceKernel(kernel_);
        ORACLE = IRiptideVolatilityOracle(oracle_);
        FEE_PROVIDER = IRiptideLvrFeeProvider(feeProvider_);
        ROUTER = router_;
    }

    function runtimeState(bytes32 strategyKey) external view returns (RiptideTypes.ControllerState memory) {
        return _runtime[strategyKey];
    }

    function orderStrategyKey(bytes32 orderHash) external view returns (bytes32) {
        return _orderStrategyKeys[orderHash];
    }

    function makerOf(bytes32 strategyKey) external view returns (address) {
        return _makers[strategyKey];
    }

    function registerStrategy(bytes32 strategyKey, bytes32 orderHash, bytes32 marketId, address maker) external {
        if (msg.sender != ROUTER) revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        if (maker == address(0)) revert RiptideErrors.RiptideZeroAddress();
        address existing = _makers[strategyKey];
        if (existing == address(0)) {
            _makers[strategyKey] = maker;
        } else if (existing != maker) {
            revert RiptideErrors.RiptideUnauthorizedResolver(maker);
        }
        _marketIds[strategyKey] = marketId;
        _orderStrategyKeys[orderHash] = strategyKey;
    }

    function buildRebalanceOrder(
        address maker,
        RiptideTypes.Strategy calldata strategy,
        uint40 deadline,
        uint256 outWad,
        address resolver,
        bool useAuctionBalanceIn,
        uint40 auctionStart
    ) external view returns (ISwapVM.Order memory order) {
        RiptideTypes.Strategy memory s = strategy;
        s.maker = maker;
        RiptideStrategyCodec.validateStructure(s);

        uint256 staleInWad =
            KERNEL.staleBaselineIn(outWad, s.reserveBaseWad, s.reserveQuoteWad, RiptideTypes.QuoteKind.ExactOutput);
        bytes memory data = bytes.concat(
            RiptideStrategyCodec.encode(s),
            _buildRebalanceProgram(s, deadline, staleInWad, resolver, useAuctionBalanceIn, auctionStart)
        );
        order = RiptideMakerTraits.buildOrder(maker, data);
    }

    function execute(
        bytes32 orderHash,
        address maker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 balanceIn,
        uint256 balanceOut,
        bool isStatic,
        bytes calldata args
    ) external {
        if (msg.sender != ROUTER) revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        if (args.length < 44) revert RiptideErrors.RiptideInvalidEncodingLength(args.length, 44);

        uint64 beta = uint64(bytes8(args[0:8]));
        uint128 staleInWad = uint128(bytes16(args[8:24]));
        address resolver = address(bytes20(args[24:44]));

        bytes32 strategyKey = _orderStrategyKeys[orderHash];
        if (strategyKey == bytes32(0)) {
            revert RiptideErrors.RiptideStrategyNotActive(orderHash);
        }

        RiptideTypes.RebalanceResult memory result = KERNEL.splitSurplus(amountIn, staleInWad, beta);

        if (!isStatic) {
            if (_riptideLock.isLocked()) revert RiptideErrors.RiptideReentrantExecution();
            _riptideLock.lock();
            if (result.payToResolver > 0) {
                IRiptideRebalanceApp(ROUTER).pullForRebalance(maker, orderHash, tokenIn, result.payToResolver, resolver);
            }

            uint128 revealedPriceWad = _revealedPriceWad(balanceIn, balanceOut);
            IRiptideRebalanceApp(ROUTER).observeForRebalance(strategyKey, revealedPriceWad, uint40(block.timestamp));
            IRiptideRebalanceApp(ROUTER).advanceControllerForRebalance(strategyKey);
            _advanceRuntime(strategyKey, revealedPriceWad);

            IRiptideRebalanceApp(ROUTER).emitRebalanceSettled(
                strategyKey,
                maker,
                resolver,
                _marketIds[strategyKey],
                tokenIn,
                tokenOut,
                amountIn,
                staleInWad,
                result.surplusWad,
                result.retainToLP,
                result.payToResolver,
                revealedPriceWad,
                _runtime[strategyKey].version,
                orderHash
            );
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

    function _revealedPriceWad(uint256 reserveIn, uint256 reserveOut) internal pure returns (uint128) {
        if (reserveOut == 0) revert RiptideErrors.RiptideMathDivisionByZero();
        return uint128(WadMulDiv.mulDiv(reserveIn, WadMulDiv.WAD, reserveOut, WadMulDiv.Rounding.Down));
    }

    function _buildRebalanceProgram(
        RiptideTypes.Strategy memory s,
        uint40 deadline,
        uint256 staleInWad,
        address resolver,
        bool useAuctionBalanceIn,
        uint40 auctionStart
    ) internal pure returns (bytes memory program) {
        bytes memory auctionArgs = DutchAuctionArgsBuilder.build(auctionStart, s.auction.duration, s.auction.decay);
        bytes memory rebalanceArgs = abi.encodePacked(s.auction.beta, uint128(staleInWad), resolver);

        program = bytes.concat(
            _encodeInstruction(RiptideConstants.OP_DEADLINE, ControlsArgsBuilder.buildDeadline(deadline)),
            useAuctionBalanceIn
                ? _encodeInstruction(RiptideConstants.OP_DUTCH_AUCTION_BALANCE_IN, auctionArgs)
                : _encodeInstruction(RiptideConstants.OP_DUTCH_AUCTION_BALANCE_OUT, auctionArgs),
            _encodeInstruction(RiptideConstants.OP_DECAY, DecayArgsBuilder.build(s.auction.antiSandwichPeriod)),
            _encodeInstruction(RiptideConstants.OP_XYCSWAP, ""),
            _encodeInstruction(RiptideConstants.RIPTIDE_REBALANCE_OPCODE, rebalanceArgs),
            _encodeInstruction(RiptideConstants.OP_SALT, ControlsArgsBuilder.buildSalt(uint64(uint256(s.salt))))
        );
    }

    function _encodeInstruction(uint8 opcode, bytes memory args) internal pure returns (bytes memory) {
        return abi.encodePacked(opcode, args.length.toUint8(), args);
    }
}
