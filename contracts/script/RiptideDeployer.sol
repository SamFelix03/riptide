// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Vm } from "forge-std/Vm.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { RiptideRebalanceKernel } from "../src/core/RiptideRebalanceKernel.sol";
import { RiptideVolatilityOracle } from "../src/oracle/RiptideVolatilityOracle.sol";
import { RiptideLvrFeeProvider } from "../src/fees/RiptideLvrFeeProvider.sol";
import { RiptideSwapVMRouter } from "../src/core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../src/core/RiptideRebalanceRouter.sol";
import { RiptideAuctionSettler } from "../src/periphery/RiptideAuctionSettler.sol";
import { RiptideQuoter } from "../src/periphery/RiptideQuoter.sol";
import { RiptideLens } from "../src/periphery/RiptideLens.sol";
import { RiptideBatchExecutor } from "../src/periphery/RiptideBatchExecutor.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";

/// @notice Shared deploy logic for scripts and tests.
library RiptideDeployer {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct System {
        Aqua aqua;
        RiptideRebalanceKernel kernel;
        RiptideVolatilityOracle oracle;
        RiptideLvrFeeProvider provider;
        RiptideSwapVMRouter swapRouter;
        RiptideRebalanceRouter rebalanceRouter;
        RiptideAuctionSettler settler;
        RiptideQuoter quoter;
        RiptideLens lens;
        RiptideBatchExecutor batchExecutor;
        RiptideDemoToken demoBase;
        RiptideDemoToken demoQuote;
    }

    function deployFresh(address owner, address createAccount) internal returns (System memory s) {
        s.aqua = new Aqua();
        return deployWithAqua(address(s.aqua), owner, createAccount);
    }

    function deployWithAqua(address aqua, address owner, address createAccount) internal returns (System memory s) {
        s = deployProtocolWithAqua(aqua, owner, createAccount);
        s.demoBase = new RiptideDemoToken("Riptide Demo Base", "RBASE");
        s.demoQuote = new RiptideDemoToken("Riptide Demo Quote", "RQUOTE");
    }

    /// @notice Protocol stack against an existing Aqua. Caller assigns demo tokens.
    function deployProtocolWithAqua(address aqua, address owner, address createAccount) internal returns (System memory s) {
        s.aqua = Aqua(aqua);

        uint256 nonce = VM.getNonce(createAccount);
        address swapRouterAddr = VM.computeCreateAddress(createAccount, nonce + 3);
        address rebalanceRouterAddr = VM.computeCreateAddress(createAccount, nonce + 4);

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
    }

    /// @notice Continue a partial deploy after Aqua + kernel + oracle + fee provider exist.
    /// @dev Next CREATE nonce must be the predicted swap router address (oracle constructor arg).
    function deployFromRouters(
        address aqua,
        address owner,
        address kernel,
        address oracle,
        address provider
    ) internal returns (System memory s) {
        s.aqua = Aqua(aqua);
        s.kernel = RiptideRebalanceKernel(kernel);
        s.oracle = RiptideVolatilityOracle(oracle);
        s.provider = RiptideLvrFeeProvider(provider);
        s.swapRouter = new RiptideSwapVMRouter(aqua, address(0), owner, "RiptideSwap", "1", oracle, provider);
        s.rebalanceRouter = new RiptideRebalanceRouter(
            aqua, address(0), owner, "RiptideRebalance", "1", kernel, oracle, provider
        );
        s.settler = new RiptideAuctionSettler(address(s.rebalanceRouter), kernel);
        s.quoter = new RiptideQuoter(
            address(s.swapRouter), address(s.rebalanceRouter), kernel, provider, oracle
        );
        s.lens = new RiptideLens(
            address(s.swapRouter), address(s.rebalanceRouter), aqua, provider, oracle
        );
        s.batchExecutor = new RiptideBatchExecutor(address(s.swapRouter), address(s.rebalanceRouter));
        s.demoBase = new RiptideDemoToken("Riptide Demo Base", "RBASE");
        s.demoQuote = new RiptideDemoToken("Riptide Demo Quote", "RQUOTE");
    }
}
