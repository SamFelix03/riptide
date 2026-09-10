// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { ScriptConfig } from "./ScriptConfig.sol";

/// @notice Dock a seeded strategy by STRATEGY_HASH (strategyKey from manifest).
contract DockScript is Script {
    using stdJson for string;

    function run() external {
        bytes32 strategyHash = vm.envBytes32("STRATEGY_HASH");
        string memory json = vm.readFile(ScriptConfig.manifestPath(block.chainid));

        address swapRouter = json.readAddress(".swapRouter");
        address aquaAddr = json.readAddress(".aqua");
        address demoBase = json.readAddress(".demoTokens.base");
        address demoQuote = json.readAddress(".demoTokens.quote");

        bytes32 orderHash;
        address maker;
        for (uint256 i; i < 3; ++i) {
            string memory base = string.concat(".seededStrategies[", vm.toString(i), "]");
            if (json.readBytes32(string.concat(base, ".strategyKey")) == strategyHash) {
                orderHash = json.readBytes32(string.concat(base, ".orderHash"));
                maker = json.readAddress(string.concat(base, ".maker"));
                break;
            }
        }
        require(orderHash != bytes32(0), "Strategy not found in manifest");

        address[] memory tokens = new address[](2);
        tokens[0] = demoBase;
        tokens[1] = demoQuote;

        vm.startBroadcast(ScriptConfig.makerKey(maker));
        Aqua(aquaAddr).dock(swapRouter, orderHash, tokens);
        vm.stopBroadcast();

        console2.log("Docked strategy", vm.toString(strategyHash));
    }
}
