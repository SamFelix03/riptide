// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";

import { IRiptideLens } from "../interfaces/IRiptideLens.sol";
import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { RiptideSwapVMRouter } from "../core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../core/RiptideRebalanceRouter.sol";
import { IRiptideLvrFeeProvider } from "../interfaces/IRiptideLvrFeeProvider.sol";
import { IRiptideVolatilityOracle } from "../oracle/IRiptideVolatilityOracle.sol";

/// @title RiptideLens
/// @notice Live strategy reconciliation (CONTRACTS.md §13).
contract RiptideLens is IRiptideLens {
    RiptideSwapVMRouter public immutable SWAP_ROUTER;
    RiptideRebalanceRouter public immutable REBALANCE_ROUTER;
    IAqua public immutable AQUA;
    IRiptideLvrFeeProvider public immutable FEE_PROVIDER;
    IRiptideVolatilityOracle public immutable ORACLE;

    constructor(address swapRouter, address rebalanceRouter, address aqua, address feeProvider, address oracle) {
        if (
            swapRouter == address(0) || rebalanceRouter == address(0) || aqua == address(0) || feeProvider == address(0)
                || oracle == address(0)
        ) {
            revert RiptideErrors.RiptideZeroAddress();
        }
        SWAP_ROUTER = RiptideSwapVMRouter(payable(swapRouter));
        REBALANCE_ROUTER = RiptideRebalanceRouter(payable(rebalanceRouter));
        AQUA = IAqua(aqua);
        FEE_PROVIDER = IRiptideLvrFeeProvider(feeProvider);
        ORACLE = IRiptideVolatilityOracle(oracle);
    }

    /// @inheritdoc IRiptideLens
    function strategyState(address maker, bytes32 strategyHash, address base, address quote)
        external
        view
        returns (StrategyState memory state)
    {
        bytes32 strategyKey = REBALANCE_ROUTER.orderStrategyKey(strategyHash);
        if (strategyKey == bytes32(0)) {
            revert RiptideErrors.RiptideStrategyNotActive(strategyHash);
        }

        state.runtime = REBALANCE_ROUTER.runtimeState(strategyKey);
        (state.feeReported,) = FEE_PROVIDER.controllerState(strategyKey);
        state.sigmaWad = ORACLE.sigmaWad(strategyKey);
        (state.aquaBase, state.aquaQuote) =
            AQUA.safeBalances(maker, address(SWAP_ROUTER), strategyHash, base, quote);
        state.walletBase = IERC20(base).balanceOf(maker);
        state.walletQuote = IERC20(quote).balanceOf(maker);
        state.allowanceBase = IERC20(base).allowance(maker, address(AQUA));
        state.allowanceQuote = IERC20(quote).allowance(maker, address(AQUA));
        state.swapVersion = SWAP_ROUTER.strategyVersion(strategyKey);
    }
}
