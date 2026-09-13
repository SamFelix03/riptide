// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { TakerTraitsLib } from "@1inch/swap-vm/libs/TakerTraits.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideTypes } from "../src/types/RiptideTypes.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";
import { MockChainlinkAggregator } from "../test/mocks/MockChainlinkAggregator.sol";
import { RiptideDeployer } from "./RiptideDeployer.sol";
import { ScriptConfig } from "./ScriptConfig.sol";
import { RiptideSeedLib } from "./RiptideSeedLib.sol";
import { RiptideConstants } from "../src/core/RiptideConstants.sol";

/// @notice Orchestrator: deploy → seed → one taker swap (Mechanism 1 smoke).
contract DemoScript is Script {
    function run() external {
        vm.warp(1_700_000_000);
        (address deployer, address maker1, address maker2, address maker3, address taker,) = ScriptConfig.anvilAccounts();

        vm.startBroadcast(ScriptConfig.DEPLOYER_KEY);
        RiptideDeployer.System memory sys = RiptideDeployer.deployFresh(deployer, deployer);
        vm.stopBroadcast();

        ScriptConfig.Manifest memory m = _manifest(sys);
        MockChainlinkAggregator feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);

        RiptideSeedLib.SeedResult memory seeded = RiptideSeedLib.seedAll(m, maker1, maker2, maker3, feed);
        _demoSwap(m, sys, maker2, taker, feed);
        console2.log("Demo swap S2 strategyKey", vm.toString(seeded.seeded[1].strategyKey));
    }

    function _demoSwap(
        ScriptConfig.Manifest memory m,
        RiptideDeployer.System memory sys,
        address maker2,
        address taker,
        MockChainlinkAggregator feed
    ) private {
        RiptideTypes.Strategy memory strategy = ScriptConfig.strategyS2(
            maker2, m.demoBase, m.demoQuote, address(feed), m.feeProvider, bytes32(uint256(2))
        );
        // Must be the same deadline RiptideSeedLib shipped with: the deadline is part of the
        // program bytes, so a different one rebuilds a different order hash and Aqua has no
        // such active strategy.
        ISwapVM.Order memory order =
            sys.swapRouter.buildSwapOrder(maker2, strategy, RiptideConstants.SWAP_ORDER_DEADLINE);

        uint256 amountIn = 1000e18;
        vm.broadcast(ScriptConfig.DEPLOYER_KEY);
        RiptideDemoToken(m.demoQuote).mint(taker, amountIn);

        vm.startBroadcast(ScriptConfig.TAKER_KEY);
        RiptideDemoToken(m.demoQuote).approve(m.swapRouter, amountIn);
        (, uint256 amountOut,) = sys.swapRouter.riptideSwap(
            order, m.demoQuote, m.demoBase, amountIn, _swapTakerData(taker, true)
        );
        vm.stopBroadcast();
        console2.log("amountOut", amountOut);
    }

    function _manifest(RiptideDeployer.System memory sys) private view returns (ScriptConfig.Manifest memory m) {
        m.chainId = block.chainid;
        m.name = "anvil";
        m.blockNumber = block.number;
        m.commit = "local";
        m.aqua = address(sys.aqua);
        m.swapRouter = address(sys.swapRouter);
        m.rebalanceRouter = address(sys.rebalanceRouter);
        m.kernel = address(sys.kernel);
        m.oracle = address(sys.oracle);
        m.feeProvider = address(sys.provider);
        m.settler = address(sys.settler);
        m.quoter = address(sys.quoter);
        m.lens = address(sys.lens);
        m.batchExecutor = address(sys.batchExecutor);
        m.demoBase = address(sys.demoBase);
        m.demoQuote = address(sys.demoQuote);
        ScriptConfig.fillNetworkFields(m);
    }

    function _swapTakerData(address taker_, bool exactIn) private pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker_,
                isExactIn: exactIn,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: true,
                useTransferFromAndAquaPush: true,
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
