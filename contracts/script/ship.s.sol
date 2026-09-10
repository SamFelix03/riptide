// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { RiptideTypes } from "../src/types/RiptideTypes.sol";
import { RiptideSwapVMRouter } from "../src/core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../src/core/RiptideRebalanceRouter.sol";
import { RiptideStrategyCodec } from "../src/core/RiptideStrategyCodec.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";
import { MockChainlinkAggregator } from "../test/mocks/MockChainlinkAggregator.sol";
import { ScriptConfig } from "./ScriptConfig.sol";

/// @notice Ship a single strategy for a maker (MAKER_INDEX env: 1|2|3).
contract ShipScript is Script {
    using stdJson for string;

    function run() external {
        uint256 makerIndex = vm.envOr("MAKER_INDEX", uint256(1));
        string memory json = vm.readFile(ScriptConfig.manifestPath(block.chainid));

        address maker;
        uint256 makerKey;
        bytes32 salt;
        RiptideTypes.Strategy memory s;

        MockChainlinkAggregator feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);

        address demoBase = json.readAddress(".demoTokens.base");
        address demoQuote = json.readAddress(".demoTokens.quote");
        address feeProvider = json.readAddress(".feeProvider");

        if (makerIndex == 1) {
            (, maker,,,,) = ScriptConfig.anvilAccounts();
            makerKey = ScriptConfig.MAKER1_KEY;
            salt = bytes32(uint256(1));
            s = ScriptConfig.strategyS1(maker, demoBase, demoQuote, address(feed), feeProvider, salt);
        } else if (makerIndex == 2) {
            (,, maker,,,) = ScriptConfig.anvilAccounts();
            makerKey = ScriptConfig.MAKER2_KEY;
            salt = bytes32(uint256(2));
            s = ScriptConfig.strategyS2(maker, demoBase, demoQuote, address(feed), feeProvider, salt);
        } else {
            (,,, maker,,) = ScriptConfig.anvilAccounts();
            makerKey = ScriptConfig.MAKER3_KEY;
            salt = bytes32(uint256(3));
            s = ScriptConfig.strategyS3(maker, demoBase, demoQuote, address(feed), feeProvider, salt);
        }

        RiptideSwapVMRouter swapRouter = RiptideSwapVMRouter(payable(json.readAddress(".swapRouter")));
        RiptideRebalanceRouter rebalanceRouter = RiptideRebalanceRouter(payable(json.readAddress(".rebalanceRouter")));
        Aqua aqua = Aqua(json.readAddress(".aqua"));

        ISwapVM.Order memory order = swapRouter.buildSwapOrder(maker, s, uint40(block.timestamp + 7 days));
        bytes32 orderHash = swapRouter.hash(order);
        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, salt);

        vm.startBroadcast(ScriptConfig.DEPLOYER_KEY);
        RiptideDemoToken(demoBase).mint(maker, 1000e18);
        RiptideDemoToken(demoQuote).mint(maker, 2_000_000e18);
        vm.stopBroadcast();

        vm.startBroadcast(makerKey);
        RiptideDemoToken(demoBase).approve(address(aqua), type(uint256).max);
        RiptideDemoToken(demoQuote).approve(address(aqua), type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = demoBase;
        tokens[1] = demoQuote;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 200_000e18;
        aqua.ship(address(swapRouter), abi.encode(order), tokens, amounts);
        swapRouter.registerStrategy(strategyKey, orderHash, s, maker);
        rebalanceRouter.registerStrategy(strategyKey, orderHash, RiptideStrategyCodec.marketId(s.baseToken, s.quoteToken));
        vm.stopBroadcast();
    }
}
