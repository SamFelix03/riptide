// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { RiptideRebalanceKernel } from "../../src/core/RiptideRebalanceKernel.sol";
import { RiptideVolatilityOracle } from "../../src/oracle/RiptideVolatilityOracle.sol";
import { RiptideLvrFeeProvider } from "../../src/fees/RiptideLvrFeeProvider.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../../src/core/RiptideRebalanceRouter.sol";
import { RiptideAuctionSettler } from "../../src/periphery/RiptideAuctionSettler.sol";
import { RiptideQuoter } from "../../src/periphery/RiptideQuoter.sol";
import { RiptideLens } from "../../src/periphery/RiptideLens.sol";
import { RiptideBatchExecutor } from "../../src/periphery/RiptideBatchExecutor.sol";

/// @notice Deterministic deploy order for circular router/oracle/provider deps.
contract RiptideSystemDeployer is Test {
    struct System {
        RiptideRebalanceKernel kernel;
        RiptideVolatilityOracle oracle;
        RiptideLvrFeeProvider provider;
        RiptideSwapVMRouter swapRouter;
        RiptideRebalanceRouter rebalanceRouter;
        RiptideAuctionSettler settler;
        RiptideQuoter quoter;
        RiptideLens lens;
        RiptideBatchExecutor batchExecutor;
    }

    function deploy(address aqua, address owner) external returns (System memory s) {
        uint256 nonce = vm.getNonce(address(this));
        address swapRouterAddr = vm.computeCreateAddress(address(this), nonce + 3);
        address rebalanceRouterAddr = vm.computeCreateAddress(address(this), nonce + 4);

        s.kernel = new RiptideRebalanceKernel();
        s.oracle = new RiptideVolatilityOracle(rebalanceRouterAddr, swapRouterAddr, owner);
        s.provider = new RiptideLvrFeeProvider(s.oracle, swapRouterAddr, rebalanceRouterAddr, owner);
        s.swapRouter = new RiptideSwapVMRouter(aqua, address(0), owner, "RiptideSwap", "1", address(s.oracle), address(s.provider));
        s.rebalanceRouter = new RiptideRebalanceRouter(
            aqua, address(0), owner, "RiptideRebalance", "1", address(s.kernel), address(s.oracle), address(s.provider)
        );

        s.settler = new RiptideAuctionSettler(address(s.rebalanceRouter), address(s.kernel));
        s.quoter = new RiptideQuoter(
            address(s.swapRouter), address(s.rebalanceRouter), address(s.kernel), address(s.provider), address(s.oracle)
        );
        s.lens = new RiptideLens(
            address(s.swapRouter), address(s.rebalanceRouter), aqua, address(s.provider), address(s.oracle)
        );
        s.batchExecutor = new RiptideBatchExecutor(address(s.swapRouter), address(s.rebalanceRouter));

        assertEq(address(s.swapRouter), swapRouterAddr);
        assertEq(address(s.rebalanceRouter), rebalanceRouterAddr);
    }
}
