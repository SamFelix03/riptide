// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { RiptideDeployer } from "./RiptideDeployer.sol";
import { ScriptConfig } from "./ScriptConfig.sol";
import { MockChainlinkAggregator } from "../test/mocks/MockChainlinkAggregator.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";

/// @notice Deploy full Riptide stack + demo tokens; write deployments/<chainId>.json.
contract DeployScript is Script {
    using stdJson for string;

    function run() external {
        uint256 deployerKey = ScriptConfig.deployerPrivateKey();
        address deployer = vm.addr(deployerKey);

        RiptideDeployer.System memory sys;
        uint256 preservedBlock;
        address feed;
        string memory path = ScriptConfig.manifestPath(block.chainid);
        bool force = vm.envOr("FORCE_PROTOCOL_REDEPLOY", uint256(0)) != 0;
        if (!force && vm.exists(path)) {
            string memory json = vm.readFile(path);
            address swapRouter = json.readAddress(".swapRouter");
            if (swapRouter.code.length > 0) {
                console2.log("swapRouter already deployed", swapRouter);
                return;
            }
        }
        if (force && vm.exists(path)) {
            string memory json = vm.readFile(path);
            address aqua = json.readAddress(".aqua");
            require(aqua.code.length > 0, "FORCE_PROTOCOL_REDEPLOY needs existing aqua");
            address demoBase = json.readAddress(".demoTokens.base");
            address demoQuote = json.readAddress(".demoTokens.quote");
            feed = json.readAddress(".chainlinkFeed");
            vm.startBroadcast(deployerKey);
            sys = RiptideDeployer.deployProtocolWithAqua(aqua, deployer, deployer);
            sys.demoBase = RiptideDemoToken(demoBase);
            sys.demoQuote = RiptideDemoToken(demoQuote);
            vm.stopBroadcast();
            console2.log("Forced protocol redeploy against existing Aqua/tokens/feed");
        } else if (_canResume()) {
            string memory json = vm.readFile(ScriptConfig.manifestPath(block.chainid));
            preservedBlock = json.readUint(".blockNumber");
            sys = _resume(deployerKey, deployer, json);
            feed = _deployFeed(deployerKey);
        } else {
            vm.startBroadcast(deployerKey);
            sys = RiptideDeployer.deployFresh(deployer, deployer);
            MockChainlinkAggregator aggregator = new MockChainlinkAggregator();
            aggregator.setRound(2_000e8, block.timestamp);
            feed = address(aggregator);
            vm.stopBroadcast();
        }

        ScriptConfig.Manifest memory manifest = _manifest(sys, feed);
        if (preservedBlock != 0) {
            manifest.blockNumber = preservedBlock;
        }
        _preservePublicMetadata(manifest);
        ScriptConfig.writeManifest(manifest);

        console2.log("chainId", manifest.chainId);
        console2.log("Deployed swapRouter", manifest.swapRouter);
        console2.log("Deployed demoBase", manifest.demoBase);
        console2.log("Deployed chainlinkFeed", feed);
    }

    function _canResume() private view returns (bool) {
        string memory path = ScriptConfig.manifestPath(block.chainid);
        if (!vm.exists(path)) return false;
        string memory json = vm.readFile(path);
        address aqua = json.readAddress(".aqua");
        address swapRouter = json.readAddress(".swapRouter");
        return aqua.code.length > 0 && swapRouter.code.length == 0;
    }

    function _resume(uint256 deployerKey, address deployer, string memory json)
        private
        returns (RiptideDeployer.System memory sys)
    {
        address expectedSwap = json.readAddress(".swapRouter");
        require(
            vm.computeCreateAddress(deployer, vm.getNonce(deployer)) == expectedSwap, "deploy resume nonce drifted"
        );
        vm.startBroadcast(deployerKey);
        sys = RiptideDeployer.deployFromRouters(
            json.readAddress(".aqua"),
            deployer,
            json.readAddress(".kernel"),
            json.readAddress(".oracle"),
            json.readAddress(".feeProvider")
        );
        vm.stopBroadcast();
    }

    function _deployFeed(uint256 deployerKey) private returns (address feed) {
        vm.startBroadcast(deployerKey);
        MockChainlinkAggregator aggregator = new MockChainlinkAggregator();
        aggregator.setRound(2_000e8, block.timestamp);
        feed = address(aggregator);
        vm.stopBroadcast();
    }

    function _manifest(RiptideDeployer.System memory sys, address feed)
        private
        view
        returns (ScriptConfig.Manifest memory m)
    {
        ScriptConfig.fillNetworkFields(m);
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
        m.chainlinkFeed = feed;
    }

    function _preservePublicMetadata(ScriptConfig.Manifest memory m) private view {
        string memory path = ScriptConfig.manifestPath(block.chainid);
        if (!vm.exists(path)) return;
        string memory json = vm.readFile(path);
        if (json.keyExists(".subgraphUrl")) {
            m.subgraphUrl = json.readString(".subgraphUrl");
        }
        if (json.keyExists(".demoResolver")) {
            address resolver = json.readAddress(".demoResolver");
            if (resolver != address(0)) m.demoResolver = resolver;
        }
        if (!json.keyExists(".seededStrategies")) return;
        uint256 n;
        while (json.keyExists(string.concat(".seededStrategies[", vm.toString(n), "].id"))) {
            n++;
        }
        if (n == 0) return;
        m.seededStrategies = new ScriptConfig.SeededStrategy[](n);
        for (uint256 i; i < n; ++i) {
            string memory base = string.concat(".seededStrategies[", vm.toString(i), "]");
            m.seededStrategies[i] = ScriptConfig.SeededStrategy({
                id: json.readString(string.concat(base, ".id")),
                maker: json.readAddress(string.concat(base, ".maker")),
                salt: json.readBytes32(string.concat(base, ".salt")),
                strategyKey: json.readBytes32(string.concat(base, ".strategyKey")),
                orderHash: json.readBytes32(string.concat(base, ".orderHash"))
            });
        }
    }
}
