// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { RiptideTypes } from "../src/types/RiptideTypes.sol";
import { RiptideRebalanceRouter } from "../src/core/RiptideRebalanceRouter.sol";
import { RiptideSwapVMRouter } from "../src/core/RiptideSwapVMRouter.sol";
import { RiptideConstants } from "../src/core/RiptideConstants.sol";
import { RiptideStrategyCodec } from "../src/core/RiptideStrategyCodec.sol";
import { RiptideAuctionSettler } from "../src/periphery/RiptideAuctionSettler.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";
import { MockChainlinkAggregator } from "../test/mocks/MockChainlinkAggregator.sol";
import { ScriptConfig } from "./ScriptConfig.sol";

/// @notice Resolver calls settleRebalance against a seeded strategy (default S2).
contract RebalanceScript is Script {
    using stdJson for string;

    function run() external {
        string memory json = vm.readFile(ScriptConfig.manifestPath(block.chainid));
        string memory strategyId = vm.envOr("STRATEGY_ID", string("S2"));

        address maker;
        uint256 makerKey;
        bytes32 salt;
        if (keccak256(bytes(strategyId)) == keccak256("S1")) {
            (, maker,,,,) = ScriptConfig.anvilAccounts();
            makerKey = ScriptConfig.MAKER1_KEY;
            salt = bytes32(uint256(1));
        } else if (keccak256(bytes(strategyId)) == keccak256("S3")) {
            (,,, maker,,) = ScriptConfig.anvilAccounts();
            makerKey = ScriptConfig.MAKER3_KEY;
            salt = bytes32(uint256(3));
        } else {
            (,, maker,,,) = ScriptConfig.anvilAccounts();
            makerKey = ScriptConfig.MAKER2_KEY;
            salt = bytes32(uint256(2));
        }

        address demoBase = json.readAddress(".demoTokens.base");
        address demoQuote = json.readAddress(".demoTokens.quote");
        address feeProvider = json.readAddress(".feeProvider");
        address settlerAddr = json.readAddress(".settler");
        address aquaAddr = json.readAddress(".aqua");
        RiptideRebalanceRouter rebalanceRouter = RiptideRebalanceRouter(payable(json.readAddress(".rebalanceRouter")));
        RiptideSwapVMRouter swapRouter = RiptideSwapVMRouter(payable(json.readAddress(".swapRouter")));

        MockChainlinkAggregator feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);

        RiptideTypes.Strategy memory strategy;
        if (keccak256(bytes(strategyId)) == keccak256("S1")) {
            strategy = ScriptConfig.strategyS1(maker, demoBase, demoQuote, address(feed), feeProvider, salt);
        } else if (keccak256(bytes(strategyId)) == keccak256("S3")) {
            strategy = ScriptConfig.strategyS3(maker, demoBase, demoQuote, address(feed), feeProvider, salt);
        } else {
            strategy = ScriptConfig.strategyS2(maker, demoBase, demoQuote, address(feed), feeProvider, salt);
        }

        // Nothing about the resolver goes into the order: the rebate follows the VM taker,
        // so any account can broadcast the settlement. This one is only used to fund and
        // approve the wallet the script happens to settle from.
        address resolver = vm.addr(ScriptConfig.RESOLVER_KEY);
        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, salt);
        // Pin the auction start: it is baked into the order bytes AND read from router
        // storage by the settler. The two must agree.
        uint40 auctionStart = uint40(block.timestamp);
        ISwapVM.Order memory rebOrder = rebalanceRouter.buildRebalanceOrderWithAuctionStart(
            maker, strategy, RiptideConstants.SWAP_ORDER_DEADLINE, 1e18, true, auctionStart
        );
        bytes32 rebHash = rebalanceRouter.hash(rebOrder);

        vm.startBroadcast(makerKey);
        RiptideDemoToken(demoBase).approve(aquaAddr, type(uint256).max);
        RiptideDemoToken(demoQuote).approve(aquaAddr, type(uint256).max);
        address[] memory tokens = new address[](2);
        tokens[0] = demoBase;
        tokens[1] = demoQuote;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 200_000e18;
        Aqua(aquaAddr).ship(address(rebalanceRouter), abi.encode(rebOrder), tokens, amounts);
        swapRouter.registerStrategy(strategyKey, rebHash, strategy, maker);
        rebalanceRouter.registerStrategy(strategyKey, rebHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken));
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, auctionStart);
        vm.stopBroadcast();

        RiptideAuctionSettler settler = RiptideAuctionSettler(settlerAddr);
        vm.startBroadcast(ScriptConfig.RESOLVER_KEY);
        RiptideDemoToken(demoQuote).mint(resolver, 500_000e18); // resolver == broadcaster
        RiptideDemoToken(demoQuote).approve(settlerAddr, type(uint256).max);
        RiptideTypes.RebalanceResult memory result =
            settler.settleRebalance(maker, strategy, 1e18, 500_000e18, RiptideConstants.SWAP_ORDER_DEADLINE);
        vm.stopBroadcast();

        console2.log("payToResolver", result.payToResolver);
    }
}
