// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { ScriptConfig } from "./ScriptConfig.sol";
import { RiptideSeedLib } from "./RiptideSeedLib.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";
import { MockChainlinkAggregator } from "../test/mocks/MockChainlinkAggregator.sol";

/// @notice Seed three demo strategies; updates deployments/<chainId>.json seededStrategies.
contract SeedScript is Script {
    using stdJson for string;

    function run() external {
        uint256 chainId = block.chainid;
        require(chainId == ScriptConfig.ANVIL_CHAIN_ID, "seed is Anvil-only; testnet makers ship from a connected wallet");
        uint256 deployerKey = ScriptConfig.deployerPrivateKey();
        string memory path = ScriptConfig.manifestPath(chainId);
        string memory json = vm.readFile(path);

        ScriptConfig.Manifest memory m;
        m.chainId = json.readUint(".chainId");
        m.name = json.readString(".name");
        m.blockNumber = json.readUint(".blockNumber");
        m.commit = json.keyExists(".commit") ? json.readString(".commit") : string("local");
        m.aqua = json.readAddress(".aqua");
        m.swapRouter = json.readAddress(".swapRouter");
        m.rebalanceRouter = json.readAddress(".rebalanceRouter");
        m.kernel = json.readAddress(".kernel");
        m.oracle = json.readAddress(".oracle");
        m.feeProvider = json.readAddress(".feeProvider");
        m.settler = json.readAddress(".settler");
        m.quoter = json.readAddress(".quoter");
        m.lens = json.readAddress(".lens");
        m.batchExecutor = json.readAddress(".batchExecutor");
        m.demoBase = json.readAddress(".demoTokens.base");
        m.demoQuote = json.readAddress(".demoTokens.quote");
        if (json.keyExists(".subgraphUrl")) {
            m.subgraphUrl = json.readString(".subgraphUrl");
        }
        m.rpcUrl = json.readString(".rpcUrl");
        if (json.keyExists(".explorerUrl")) {
            m.explorerUrl = json.readString(".explorerUrl");
        }

        (, address maker1, address maker2, address maker3, address taker,) = ScriptConfig.anvilAccounts();

        MockChainlinkAggregator feed;
        if (json.keyExists(".chainlinkFeed")) {
            address existingFeed = json.readAddress(".chainlinkFeed");
            if (existingFeed.code.length > 0) {
                feed = MockChainlinkAggregator(existingFeed);
                vm.startBroadcast(deployerKey);
                feed.setRound(2_000e8, block.timestamp);
                vm.stopBroadcast();
            } else {
                feed = _deployFeed(deployerKey);
            }
        } else {
            feed = _deployFeed(deployerKey);
        }

        RiptideSeedLib.SeedResult memory result = RiptideSeedLib.seedAll(m, maker1, maker2, maker3, feed);
        _fundTaker(m, deployerKey, taker);

        m.seededStrategies = result.seeded;
        m.chainlinkFeed = address(feed);
        m.demoResolver = taker;
        ScriptConfig.writeManifest(m);

        console2.log("Seeded strategies", result.seeded.length);
        console2.log("chainlinkFeed", address(feed));
    }

    function _deployFeed(uint256 deployerKey) private returns (MockChainlinkAggregator feed) {
        vm.startBroadcast(deployerKey);
        feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);
        vm.stopBroadcast();
    }

    function _fundTaker(ScriptConfig.Manifest memory m, uint256 deployerKey, address taker) private {
        vm.startBroadcast(deployerKey);
        RiptideDemoToken(m.demoQuote).mint(taker, 10_000e18);
        vm.stopBroadcast();

        vm.startBroadcast(ScriptConfig.takerPrivateKey());
        RiptideDemoToken(m.demoQuote).approve(m.batchExecutor, type(uint256).max);
        RiptideDemoToken(m.demoQuote).approve(m.settler, type(uint256).max);
        vm.stopBroadcast();
    }
}
