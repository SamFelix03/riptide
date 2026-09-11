// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, stdJson } from "forge-std/Script.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { IRiptideBatchExecutor } from "../src/interfaces/IRiptideBatchExecutor.sol";
import { RiptideTypes } from "../src/types/RiptideTypes.sol";
import { RiptideConstants } from "../src/core/RiptideConstants.sol";
import { RiptideSwapVMRouter } from "../src/core/RiptideSwapVMRouter.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";
import { MockChainlinkAggregator } from "../test/mocks/MockChainlinkAggregator.sol";
import { ScriptConfig } from "./ScriptConfig.sol";

/// @notice Broadcast a single-fill batch execute against live manifest (Anvil smoke).
contract BatchExecuteScript is Script {
    using stdJson for string;

    function run() external {
        string memory json = vm.readFile(ScriptConfig.manifestPath(block.chainid));

        address swapRouter = json.readAddress(".swapRouter");
        address batchExecutor = json.readAddress(".batchExecutor");
        address demoQuote = json.readAddress(".demoTokens.quote");
        address demoBase = json.readAddress(".demoTokens.base");
        address maker = json.readAddress(".seededStrategies[0].maker");
        bytes32 strategyKey = json.readBytes32(".seededStrategies[0].strategyKey");
        bytes32 orderHash = json.readBytes32(".seededStrategies[0].orderHash");
        string memory id = json.readString(".seededStrategies[0].id");
        bytes32 salt = json.readBytes32(".seededStrategies[0].salt");
        address feedAddr = json.readAddress(".chainlinkFeed");
        address feeProvider = json.readAddress(".feeProvider");

        (, , , , address taker,) = ScriptConfig.anvilAccounts();

        ScriptConfig.Manifest memory m;
        m.demoBase = demoBase;
        m.demoQuote = demoQuote;
        m.feeProvider = feeProvider;

        MockChainlinkAggregator feed = MockChainlinkAggregator(feedAddr);
        RiptideTypes.Strategy memory strategy = _strategy(id, maker, m, salt, feed);

        ISwapVM.Order memory order =
            RiptideSwapVMRouter(payable(swapRouter)).buildSwapOrder(maker, strategy, RiptideConstants.SWAP_ORDER_DEADLINE);
        require(RiptideSwapVMRouter(payable(swapRouter)).hash(order) == orderHash, "order hash drift");

        IRiptideBatchExecutor.FillRequest[] memory fills = new IRiptideBatchExecutor.FillRequest[](1);
        fills[0] = IRiptideBatchExecutor.FillRequest({
            order: abi.encode(order),
            maker: maker,
            strategyKey: strategyKey,
            expectedVersion: 0,
            amount: 1e18
        });

        IRiptideBatchExecutor.Route memory route = IRiptideBatchExecutor.Route({
            base: demoBase,
            quote: demoQuote,
            kind: RiptideTypes.QuoteKind.ExactInput,
            payer: taker,
            recipient: taker,
            refundRecipient: taker,
            deadline: uint40(block.timestamp + 1 hours),
            salt: bytes32(uint256(1)),
            aggregateLimit: 1,
            fills: fills
        });

        vm.startBroadcast(ScriptConfig.TAKER_KEY);
        RiptideDemoToken(demoQuote).faucet(10_000e18);
        RiptideDemoToken(demoQuote).approve(batchExecutor, type(uint256).max);
        IRiptideBatchExecutor(batchExecutor).execute(route);
        vm.stopBroadcast();
    }

    function _strategy(
        string memory id,
        address maker,
        ScriptConfig.Manifest memory m,
        bytes32 salt,
        MockChainlinkAggregator feed
    ) private pure returns (RiptideTypes.Strategy memory s) {
        if (keccak256(bytes(id)) == keccak256("S1")) {
            s = ScriptConfig.strategyS1(maker, m.demoBase, m.demoQuote, address(feed), m.feeProvider, salt);
        } else if (keccak256(bytes(id)) == keccak256("S2")) {
            s = ScriptConfig.strategyS2(maker, m.demoBase, m.demoQuote, address(feed), m.feeProvider, salt);
        } else {
            s = ScriptConfig.strategyS3(maker, m.demoBase, m.demoQuote, address(feed), m.feeProvider, salt);
        }
    }
}
