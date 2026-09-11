// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, stdJson } from "forge-std/Test.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { IRiptideBatchExecutor } from "../../src/interfaces/IRiptideBatchExecutor.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";
import { RiptideDemoToken } from "../../src/demo/RiptideDemoToken.sol";
import { MockChainlinkAggregator } from "../mocks/MockChainlinkAggregator.sol";
import { ScriptConfig } from "../../script/ScriptConfig.sol";
import { RiptideSeedLib } from "../../script/RiptideSeedLib.sol";

/// @notice Validates BatchExecutor against the live Anvil manifest deployment.
contract AnvilBatchTest is Test {
    using stdJson for string;

    function test_batchExactInOnManifestAnvil() public {
        vm.createSelectFork(vm.envOr("RPC_URL", string("http://127.0.0.1:8545")));

        string memory path = ScriptConfig.manifestPath(block.chainid);
        string memory json = vm.readFile(path);

        ScriptConfig.Manifest memory m;
        m.chainId = json.readUint(".chainId");
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
        m.chainlinkFeed = json.readAddress(".chainlinkFeed");

        ScriptConfig.SeededStrategy memory seeded;
        seeded.id = json.readString(".seededStrategies[0].id");
        seeded.maker = json.readAddress(".seededStrategies[0].maker");
        seeded.salt = json.readBytes32(".seededStrategies[0].salt");
        seeded.strategyKey = json.readBytes32(".seededStrategies[0].strategyKey");
        seeded.orderHash = json.readBytes32(".seededStrategies[0].orderHash");

        MockChainlinkAggregator feed = MockChainlinkAggregator(m.chainlinkFeed);
        RiptideTypes.Strategy memory strategy =
            _strategyForId(seeded.id, seeded.maker, m, seeded.salt, feed);

        RiptideSwapVMRouter swapRouter = RiptideSwapVMRouter(payable(m.swapRouter));
        ISwapVM.Order memory order =
            swapRouter.buildSwapOrder(seeded.maker, strategy, RiptideConstants.SWAP_ORDER_DEADLINE);
        assertEq(swapRouter.hash(order), seeded.orderHash, "order hash drift");

        (, , , , address taker,) = ScriptConfig.anvilAccounts();
        RiptideDemoToken(m.demoQuote).mint(taker, 10_000_000e18);

        IRiptideBatchExecutor.FillRequest[] memory fills = new IRiptideBatchExecutor.FillRequest[](1);
        fills[0] = IRiptideBatchExecutor.FillRequest({
            order: abi.encode(order),
            maker: seeded.maker,
            strategyKey: seeded.strategyKey,
            expectedVersion: 0,
            amount: 1e18
        });

        IRiptideBatchExecutor.Route memory route = IRiptideBatchExecutor.Route({
            base: m.demoBase,
            quote: m.demoQuote,
            kind: RiptideTypes.QuoteKind.ExactInput,
            payer: taker,
            recipient: taker,
            refundRecipient: taker,
            deadline: uint40(block.timestamp + 1 hours),
            salt: bytes32(uint256(1)),
            aggregateLimit: 1,
            fills: fills
        });

        vm.startPrank(taker);
        RiptideDemoToken(m.demoQuote).approve(m.batchExecutor, type(uint256).max);
        (uint256 inAmt, uint256 outAmt) = IRiptideBatchExecutor(m.batchExecutor).execute(route);
        vm.stopPrank();

        assertGt(inAmt, 0);
        assertGt(outAmt, 0);
    }

    function _strategyForId(
        string memory id,
        address maker,
        ScriptConfig.Manifest memory manifest,
        bytes32 salt,
        MockChainlinkAggregator feed
    ) private pure returns (RiptideTypes.Strategy memory s) {
        if (keccak256(bytes(id)) == keccak256("S1")) {
            s = ScriptConfig.strategyS1(maker, manifest.demoBase, manifest.demoQuote, address(feed), manifest.feeProvider, salt);
        } else if (keccak256(bytes(id)) == keccak256("S2")) {
            s = ScriptConfig.strategyS2(maker, manifest.demoBase, manifest.demoQuote, address(feed), manifest.feeProvider, salt);
        } else {
            s = ScriptConfig.strategyS3(maker, manifest.demoBase, manifest.demoQuote, address(feed), manifest.feeProvider, salt);
        }
    }
}
