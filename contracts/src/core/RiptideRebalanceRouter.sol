// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SwapVM } from "@1inch/swap-vm/SwapVM.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { Context } from "@1inch/swap-vm/libs/VM.sol";

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { RiptideOpcodes } from "./RiptideOpcodes.sol";
import { RiptideRebalanceModule, IRiptideRebalanceApp } from "./RiptideRebalanceModule.sol";
import { IRiptideRebalanceKernel } from "../interfaces/IRiptideRebalanceKernel.sol";
import { IRiptideVolatilityOracle } from "../oracle/IRiptideVolatilityOracle.sol";
import { IRiptideLvrFeeProvider } from "../interfaces/IRiptideLvrFeeProvider.sol";
import { IRiptideEvents } from "../interfaces/IRiptideEvents.sol";

/// @title RiptideRebalanceRouter
/// @notice Mechanism 2 rebalance router (EIP-170 split companion to RiptideSwapVMRouter).
contract RiptideRebalanceRouter is SwapVM, RiptideOpcodes, IRiptideEvents, IRiptideRebalanceApp {
    IRiptideRebalanceKernel public immutable KERNEL;
    IRiptideVolatilityOracle public immutable ORACLE;
    IRiptideLvrFeeProvider public immutable FEE_PROVIDER;
    RiptideRebalanceModule public immutable MODULE;

    /// @dev Auction start timestamp used when the rebalance Aqua order was shipped.
    mapping(bytes32 strategyKey => uint40) public rebalanceAuctionStart;

    event RiptideRebalanceExecuted(bytes32 indexed orderHash);

    error IRiptideRebalanceAppUnauthorized();

    constructor(
        address aqua,
        address weth,
        address owner,
        string memory name,
        string memory version,
        address kernel,
        address oracle,
        address feeProvider
    ) SwapVM(aqua, weth, owner, name, version) {
        KERNEL = IRiptideRebalanceKernel(kernel);
        ORACLE = IRiptideVolatilityOracle(oracle);
        FEE_PROVIDER = IRiptideLvrFeeProvider(feeProvider);
        MODULE = new RiptideRebalanceModule(kernel, oracle, feeProvider, address(this));
    }

    function _instructions() internal pure override returns (function(Context memory, bytes calldata) internal[] memory) {
        return _extendOpcodes(_riptideRebalanceOpcode);
    }

    function runtimeState(bytes32 strategyKey) external view returns (RiptideTypes.ControllerState memory) {
        return MODULE.runtimeState(strategyKey);
    }

    function orderStrategyKey(bytes32 orderHash) external view returns (bytes32) {
        return MODULE.orderStrategyKey(orderHash);
    }

    function registerStrategy(bytes32 strategyKey, bytes32 orderHash, bytes32 marketId) external {
        address bound = MODULE.makerOf(strategyKey);
        address maker = bound == address(0) ? msg.sender : bound;
        if (msg.sender != maker && msg.sender != owner()) {
            revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        }
        MODULE.registerStrategy(strategyKey, orderHash, marketId, maker);
    }

    function setRebalanceAuctionStart(bytes32 strategyKey, uint40 auctionStart) external {
        address maker = MODULE.makerOf(strategyKey);
        if (maker == address(0) || (msg.sender != maker && msg.sender != owner())) {
            revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        }
        rebalanceAuctionStart[strategyKey] = auctionStart;
    }

    function pullForRebalance(address maker, bytes32 strategyHash, address token, uint256 amount, address to)
        external
    {
        if (msg.sender != address(MODULE)) revert IRiptideRebalanceAppUnauthorized();
        AQUA.pull(maker, strategyHash, token, amount, to);
    }

    function observeForRebalance(bytes32 strategyKey, uint128 priceWad, uint40 ts) external {
        if (msg.sender != address(MODULE)) revert IRiptideRebalanceAppUnauthorized();
        ORACLE.observe(strategyKey, priceWad, ts, false);
    }

    function advanceControllerForRebalance(bytes32 strategyKey) external {
        if (msg.sender != address(MODULE)) revert IRiptideRebalanceAppUnauthorized();
        FEE_PROVIDER.advanceController(strategyKey);
    }

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
    ) external {
        if (msg.sender != address(MODULE)) revert IRiptideRebalanceAppUnauthorized();
        emit RebalanceSettled(
            strategyKey,
            maker,
            resolver,
            marketId,
            tokenIn,
            tokenOut,
            executedInWad,
            staleInWad,
            surplusWad,
            retainToLPWad,
            payToResolverWad,
            revealedPriceWad,
            versionAfter
        );
        emit RiptideRebalanceExecuted(orderHash);
    }

    function buildRebalanceOrder(
        address maker,
        RiptideTypes.Strategy calldata strategy,
        uint40 deadline,
        uint256 outWad,
        address resolver,
        bool useAuctionBalanceIn
    ) external view returns (ISwapVM.Order memory order) {
        return MODULE.buildRebalanceOrder(
            maker, strategy, deadline, outWad, resolver, useAuctionBalanceIn, uint40(block.timestamp)
        );
    }

    function buildRebalanceOrderWithAuctionStart(
        address maker,
        RiptideTypes.Strategy calldata strategy,
        uint40 deadline,
        uint256 outWad,
        address resolver,
        bool useAuctionBalanceIn,
        uint40 auctionStart
    ) external view returns (ISwapVM.Order memory order) {
        return MODULE.buildRebalanceOrder(
            maker, strategy, deadline, outWad, resolver, useAuctionBalanceIn, auctionStart
        );
    }

    function _riptideRebalanceOpcode(Context memory ctx, bytes calldata args) internal {
        MODULE.execute(
            ctx.query.orderHash,
            ctx.query.maker,
            ctx.query.tokenIn,
            ctx.query.tokenOut,
            ctx.swap.amountIn,
            ctx.swap.balanceIn,
            ctx.swap.balanceOut,
            ctx.vm.isStaticContext,
            args
        );
    }
}
