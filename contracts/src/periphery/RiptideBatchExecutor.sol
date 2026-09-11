// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TransientLock, TransientLockLib } from "@1inch/solidity-utils/contracts/libraries/TransientLock.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/libs/TakerTraits.sol";

import { IRiptideBatchExecutor } from "../interfaces/IRiptideBatchExecutor.sol";
import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { RiptideConstants } from "../core/RiptideConstants.sol";
import { RiptideSwapVMRouter } from "../core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../core/RiptideRebalanceRouter.sol";
import { RiptideStrategyCodec } from "../core/RiptideStrategyCodec.sol";

/// @title RiptideBatchExecutor
/// @notice Atomic multi-strategy taker settlement (CONTRACTS.md §14).
contract RiptideBatchExecutor is IRiptideBatchExecutor {
    using SafeERC20 for IERC20;
    using TransientLockLib for TransientLock;

    RiptideSwapVMRouter public immutable SWAP_ROUTER;
    RiptideRebalanceRouter public immutable REBALANCE_ROUTER;

    TransientLock internal _lock;

    constructor(address swapRouter, address rebalanceRouter) {
        if (swapRouter == address(0) || rebalanceRouter == address(0)) revert RiptideErrors.RiptideZeroAddress();
        SWAP_ROUTER = RiptideSwapVMRouter(payable(swapRouter));
        REBALANCE_ROUTER = RiptideRebalanceRouter(payable(rebalanceRouter));
    }

    /// @inheritdoc IRiptideBatchExecutor
    function execute(Route calldata route) external payable returns (uint256 amountIn, uint256 amountOut) {
        if (route.fills.length > RiptideConstants.MAX_FILLS) {
            revert RiptideErrors.RiptideTooManyFills(route.fills.length, RiptideConstants.MAX_FILLS);
        }
        if (block.timestamp > route.deadline) {
            revert RiptideErrors.RiptideDeadlineExpired(route.deadline, block.timestamp);
        }
        if (route.payer != msg.sender) {
            revert RiptideErrors.RiptideUnauthorizedResolver(msg.sender);
        }
        if (_lock.isLocked()) revert RiptideErrors.RiptideReentrantExecution();
        _lock.lock();

        bool exactIn = route.kind == RiptideTypes.QuoteKind.ExactInput;
        address tokenIn = route.quote;
        address tokenOut = route.base;

        uint256 totalIn;
        uint256 totalOut;
        bytes32 marketId;

        for (uint256 i; i < route.fills.length; ++i) {
            FillRequest calldata fill = route.fills[i];

            for (uint256 j = i + 1; j < route.fills.length; ++j) {
                if (route.fills[j].strategyKey == fill.strategyKey) {
                    revert RiptideErrors.RiptideDuplicateStrategy(fill.strategyKey);
                }
            }

            RiptideTypes.ControllerState memory st = REBALANCE_ROUTER.runtimeState(fill.strategyKey);
            if (st.version != fill.expectedVersion) {
                revert RiptideErrors.RiptideStaleVersion(fill.expectedVersion, st.version);
            }

            ISwapVM.Order memory order = abi.decode(fill.order, (ISwapVM.Order));
            bytes memory quoteData = _takerData(address(this), exactIn, false);

            (uint256 qIn, uint256 qOut,) =
                SWAP_ROUTER.asView().quote(order, tokenIn, tokenOut, fill.amount, quoteData);
            totalIn += qIn;
            totalOut += qOut;

            if (marketId == bytes32(0)) {
                marketId = SWAP_ROUTER.marketId(fill.strategyKey);
            }
        }

        if (exactIn) {
            if (totalOut < route.aggregateLimit) {
                revert RiptideErrors.RiptideSlippageExceeded(totalOut, route.aggregateLimit);
            }
        } else if (totalIn > route.aggregateLimit) {
            revert RiptideErrors.RiptideSlippageExceeded(totalIn, route.aggregateLimit);
        }

        IERC20(tokenIn).safeTransferFrom(route.payer, address(this), totalIn);
        IERC20(tokenIn).forceApprove(address(SWAP_ROUTER), totalIn);

        for (uint256 i; i < route.fills.length; ++i) {
            FillRequest calldata fill = route.fills[i];
            ISwapVM.Order memory order = abi.decode(fill.order, (ISwapVM.Order));
            bytes memory swapData = _takerData(address(this), exactIn, true);
            (uint256 fillIn, uint256 fillOut,) =
                SWAP_ROUTER.riptideSwap(order, tokenIn, tokenOut, fill.amount, swapData);
            amountIn += fillIn;
            amountOut += fillOut;
        }

        IERC20(tokenOut).safeTransfer(route.recipient, amountOut);
        uint256 refund = IERC20(tokenIn).balanceOf(address(this));
        if (refund > 0) {
            IERC20(tokenIn).safeTransfer(route.refundRecipient, refund);
        }

        bytes32 routeId = keccak256(abi.encode(route.salt, route.payer, block.timestamp));
        emit RouteExecuted(
            routeId,
            marketId,
            route.payer,
            route.recipient,
            route.kind,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            route.aggregateLimit,
            uint16(route.fills.length)
        );

        _lock.unlock();
    }

    function _takerData(address taker, bool exactIn, bool forSwap) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: exactIn,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: forSwap,
                useTransferFromAndAquaPush: forSwap,
                threshold: "",
                to: address(0),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }
}
