// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideMakerTraits } from "./RiptideMakerTraits.sol";
import { RiptideSwapOpcodes } from "./RiptideSwapOpcodes.sol";
import { ControlsArgsBuilder } from "@1inch/swap-vm/instructions/Controls.sol";
import { FeeArgsBuilder } from "@1inch/swap-vm/instructions/Fee.sol";

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { RiptideConstants } from "./RiptideConstants.sol";
import { RiptideStrategyCodec } from "./RiptideStrategyCodec.sol";
import { IRiptideLvrFeeProvider } from "../interfaces/IRiptideLvrFeeProvider.sol";
import { IRiptideVolatilityOracle } from "../oracle/IRiptideVolatilityOracle.sol";
import { IRiptideEvents } from "../interfaces/IRiptideEvents.sol";
import { RiptideVolatilityOracle } from "../oracle/RiptideVolatilityOracle.sol";

/// @title RiptideSwapVMRouter
/// @notice Mechanism 1 swap router (EIP-170 split; rebalance uses RiptideRebalanceRouter).
contract RiptideSwapVMRouter is RiptideSwapOpcodes {
    using SafeCast for uint256;

    IRiptideLvrFeeProvider public immutable FEE_PROVIDER;
    IRiptideVolatilityOracle public immutable ORACLE;

    mapping(bytes32 => bytes32) internal _marketIds;
    mapping(bytes32 => uint64) internal _versions;

    constructor(
        address aqua,
        address weth,
        address owner,
        string memory name,
        string memory version,
        address oracle,
        address feeProvider
    ) RiptideSwapOpcodes(aqua, weth, owner, name, version) {
        if (oracle == address(0) || feeProvider == address(0)) revert RiptideErrors.RiptideZeroAddress();
        ORACLE = IRiptideVolatilityOracle(oracle);
        FEE_PROVIDER = IRiptideLvrFeeProvider(feeProvider);
    }

    function strategyVersion(bytes32 strategyKey) external view returns (uint64) {
        return _versions[strategyKey];
    }

    function marketId(bytes32 strategyKey) external view returns (bytes32) {
        return _marketIds[strategyKey];
    }

    function registerStrategy(bytes32 strategyKey, bytes32 orderHash, RiptideTypes.Strategy calldata strategy, address receiver)
        external
    {
        if (msg.sender != strategy.maker && msg.sender != owner()) {
            revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        }
        RiptideStrategyCodec.validateStructure(strategy);
        _marketIds[strategyKey] = RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken);
        FEE_PROVIDER.registerStrategy(strategyKey, orderHash, strategy.fee, receiver);
        RiptideVolatilityOracle(address(ORACLE)).configureStrategy(strategyKey, strategy.fee, strategy.oracle);
        if (_versions[strategyKey] == 0) {
            _versions[strategyKey] = 1;
            emit StrategyRuntimeInitialized(
                strategyKey,
                _marketIds[strategyKey],
                strategy.maker,
                orderHash,
                strategy.reserveBaseWad,
                strategy.reserveQuoteWad,
                _versions[strategyKey]
            );
        }
    }

    function buildSwapOrder(address maker, RiptideTypes.Strategy calldata strategy, uint40 deadline)
        external
        pure
        returns (ISwapVM.Order memory order)
    {
        RiptideTypes.Strategy memory s = strategy;
        s.maker = maker;
        RiptideStrategyCodec.validateStructure(s);
        bytes memory data = bytes.concat(RiptideStrategyCodec.encode(s), _buildSwapProgram(s, deadline));
        order = _makeOrder(maker, data);
    }

    function riptideSwap(
        ISwapVM.Order calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bytes calldata takerTraitsAndData
    ) external returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash) {
        bytes memory data = abi.encodeCall(
            ISwapVM.swap, (order, tokenIn, tokenOut, amount, takerTraitsAndData)
        );
        (bool success, bytes memory result) = address(this).delegatecall(data);
        require(success, RiptideErrors.RiptideSwapFailed());
        (amountIn, amountOut, orderHash) = abi.decode(result, (uint256, uint256, bytes32));

        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKeyFromData(order.maker, order.data);
        FEE_PROVIDER.advanceController(strategyKey);
        (uint24 feeApplied,) = FEE_PROVIDER.controllerState(strategyKey);
        uint128 sigma = ORACLE.sigmaWad(strategyKey);
        (uint256 balIn, uint256 balOut) = AQUA.safeBalances(order.maker, address(this), orderHash, tokenIn, tokenOut);
        emit SwapFilled(
            orderHash,
            strategyKey,
            order.maker,
            _marketIds[strategyKey],
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            feeApplied,
            sigma,
            uint128(balIn),
            uint128(balOut),
            _versions[strategyKey]
        );
    }

    function _buildSwapProgram(RiptideTypes.Strategy memory s, uint40 deadline) internal pure returns (bytes memory program) {
        program = bytes.concat(
            _encodeInstruction(RiptideConstants.OP_DEADLINE, ControlsArgsBuilder.buildDeadline(deadline)),
            _encodeInstruction(RiptideConstants.OP_AQUA_DYNAMIC_PROTOCOL_FEE, FeeArgsBuilder.buildDynamicProtocolFee(s.feeProvider)),
            _encodeInstruction(RiptideConstants.OP_XYCSWAP, ""),
            _encodeInstruction(RiptideConstants.OP_SALT, ControlsArgsBuilder.buildSalt(uint64(uint256(s.salt))))
        );
    }

    function _makeOrder(address maker, bytes memory data) internal pure returns (ISwapVM.Order memory order) {
        order = RiptideMakerTraits.buildOrder(maker, data);
    }

    function _encodeInstruction(uint8 opcode, bytes memory args) internal pure returns (bytes memory) {
        return abi.encodePacked(opcode, args.length.toUint8(), args);
    }

    event StrategyRuntimeInitialized(
        bytes32 indexed strategyKey,
        bytes32 indexed marketId,
        address indexed maker,
        bytes32 strategyHash,
        uint128 reserveBaseWad,
        uint128 reserveQuoteWad,
        uint64 version
    );

    event SwapFilled(
        bytes32 indexed routeId,
        bytes32 indexed strategyKey,
        address indexed maker,
        bytes32 marketId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint24 feeBpsApplied,
        uint128 sigmaWad,
        uint128 reserveBaseAfterWad,
        uint128 reserveQuoteAfterWad,
        uint64 versionAfter
    );
}
