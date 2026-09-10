// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { MockChainlinkAggregator } from "../mocks/MockChainlinkAggregator.sol";
import { RiptideDeployer } from "../../script/RiptideDeployer.sol";
import { ScriptConfig } from "../../script/ScriptConfig.sol";
import { RiptideSeedLib } from "../../script/RiptideSeedLib.sol";

/// @notice Deploy + seed integration without broadcast; idempotent strategy hashes.
contract DeploySeedTest is Test {
    using stdJson for string;

    function test_deploySeed_manifestFieldsAndCodecParity() public {
        vm.warp(1_700_000_000);

        (address deployer, address maker1, address maker2, address maker3,,) = ScriptConfig.anvilAccounts();
        RiptideDeployer.System memory sys = RiptideDeployer.deployFresh(deployer, address(this));

        assertTrue(address(sys.aqua) != address(0));
        assertTrue(address(sys.swapRouter) != address(0));
        assertTrue(address(sys.rebalanceRouter) != address(0));
        assertTrue(address(sys.demoBase) != address(0));
        assertTrue(address(sys.demoQuote) != address(0));
        assertLe(address(sys.swapRouter).code.length, 24_576, "swap router exceeds EIP-170");
        assertLe(address(sys.rebalanceRouter).code.length, 24_576, "rebalance router exceeds EIP-170");

        ScriptConfig.Manifest memory m = _manifest(sys);
        MockChainlinkAggregator feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);

        RiptideSeedLib.SeedResult memory result =
            RiptideSeedLib.seedAllForTest(m, deployer, maker1, maker2, maker3, feed);

        assertEq(result.seeded.length, 3);
        for (uint256 i; i < 3; ++i) {
            ScriptConfig.SeededStrategy memory entry = result.seeded[i];
            assertTrue(entry.strategyKey != bytes32(0));
            assertTrue(entry.orderHash != bytes32(0));
            assertEq(entry.strategyKey, RiptideStrategyCodec.runtimeStrategyKey(entry.maker, entry.salt));

            ScriptConfig.SeededStrategy memory preview =
                RiptideSeedLib.previewSeed(m, entry.maker, entry.id, entry.salt, feed);
            assertEq(preview.strategyKey, entry.strategyKey);
            assertEq(preview.orderHash, entry.orderHash);
        }

        m.seededStrategies = result.seeded;
        m.chainlinkFeed = address(feed);
        (,,,, address taker,) = ScriptConfig.anvilAccounts();
        m.demoResolver = taker;
        ScriptConfig.writeManifest(m);

        string memory json = vm.readFile(ScriptConfig.manifestPath(block.chainid));
        assertEq(json.readUint(".chainId"), block.chainid);
        assertTrue(json.keyExists(".swapRouter"));
        assertTrue(json.keyExists(".rebalanceRouter"));
        assertTrue(json.keyExists(".demoTokens.base"));
        assertTrue(json.keyExists(".demoTokens.quote"));
        assertTrue(json.keyExists(".seededStrategies[0].strategyKey"));
        assertTrue(json.keyExists(".seededStrategies[1].strategyKey"));
        assertTrue(json.keyExists(".seededStrategies[2].strategyKey"));
        assertEq(json.readAddress(".swapRouter"), address(sys.swapRouter));
        assertEq(json.readAddress(".rebalanceRouter"), address(sys.rebalanceRouter));
    }

    function test_seedIdempotent_strategyKeyAndOrderHash() public {
        vm.warp(1_700_000_000);

        (address deployer, address maker1, address maker2, address maker3,,) = ScriptConfig.anvilAccounts();
        RiptideDeployer.System memory sys = RiptideDeployer.deployFresh(deployer, address(this));
        ScriptConfig.Manifest memory m = _manifest(sys);
        MockChainlinkAggregator feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);

        RiptideSeedLib.SeedResult memory first =
            RiptideSeedLib.seedAllForTest(m, deployer, maker1, maker2, maker3, feed);

        for (uint256 i; i < 3; ++i) {
            ScriptConfig.SeededStrategy memory again =
                RiptideSeedLib.previewSeed(m, first.seeded[i].maker, first.seeded[i].id, first.seeded[i].salt, feed);
            assertEq(again.strategyKey, first.seeded[i].strategyKey);
            assertEq(again.orderHash, first.seeded[i].orderHash);
        }
    }

    function _manifest(RiptideDeployer.System memory sys) private view returns (ScriptConfig.Manifest memory m) {
        m = ScriptConfig.Manifest({
            chainId: block.chainid,
            name: "anvil",
            blockNumber: block.number,
            commit: "local",
            aqua: address(sys.aqua),
            swapRouter: address(sys.swapRouter),
            rebalanceRouter: address(sys.rebalanceRouter),
            kernel: address(sys.kernel),
            oracle: address(sys.oracle),
            feeProvider: address(sys.provider),
            settler: address(sys.settler),
            quoter: address(sys.quoter),
            lens: address(sys.lens),
            batchExecutor: address(sys.batchExecutor),
            demoBase: address(sys.demoBase),
            demoQuote: address(sys.demoQuote),
            chainlinkFeed: address(0),
            demoResolver: address(0),
            seededStrategies: new ScriptConfig.SeededStrategy[](0),
            subgraphUrl: "",
            rpcUrl: "http://127.0.0.1:8545",
            explorerUrl: ""
        });
    }
}
