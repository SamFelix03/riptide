// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Vm } from "forge-std/Vm.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { RiptideTypes } from "../src/types/RiptideTypes.sol";
import { RiptideStrategyCodec } from "../src/core/RiptideStrategyCodec.sol";
import { RiptideConstants } from "../src/core/RiptideConstants.sol";
import { RiptideSwapVMRouter } from "../src/core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../src/core/RiptideRebalanceRouter.sol";
import { RiptideDemoToken } from "../src/demo/RiptideDemoToken.sol";
import { MockChainlinkAggregator } from "../test/mocks/MockChainlinkAggregator.sol";
import { ScriptConfig } from "./ScriptConfig.sol";

/// @notice Seeds three demo strategies with distinct fee/auction policies.
library RiptideSeedLib {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct SeedResult {
        ScriptConfig.SeededStrategy[] seeded;
    }

    function seedAll(
        ScriptConfig.Manifest memory m,
        address maker1,
        address maker2,
        address maker3,
        MockChainlinkAggregator feed
    ) internal returns (SeedResult memory result) {
        result.seeded = new ScriptConfig.SeededStrategy[](3);
        result.seeded[0] = _seedOneBroadcast(m, maker1, 1, "S1", bytes32(uint256(1)), feed);
        result.seeded[1] = _seedOneBroadcast(m, maker2, 2, "S2", bytes32(uint256(2)), feed);
        result.seeded[2] = _seedOneBroadcast(m, maker3, 3, "S3", bytes32(uint256(3)), feed);
    }

    function seedAllForTest(
        ScriptConfig.Manifest memory m,
        address deployer,
        address maker1,
        address maker2,
        address maker3,
        MockChainlinkAggregator feed
    ) internal returns (SeedResult memory result) {
        result.seeded = new ScriptConfig.SeededStrategy[](3);
        result.seeded[0] = _seedOnePrank(m, deployer, maker1, "S1", bytes32(uint256(1)), feed);
        result.seeded[1] = _seedOnePrank(m, deployer, maker2, "S2", bytes32(uint256(2)), feed);
        result.seeded[2] = _seedOnePrank(m, deployer, maker3, "S3", bytes32(uint256(3)), feed);
    }

    function previewSeed(
        ScriptConfig.Manifest memory m,
        address maker,
        string memory id,
        bytes32 salt,
        MockChainlinkAggregator feed
    ) internal view returns (ScriptConfig.SeededStrategy memory entry) {
        RiptideTypes.Strategy memory s = _strategyForId(id, maker, m, salt, feed);
        RiptideSwapVMRouter swapRouter = RiptideSwapVMRouter(payable(m.swapRouter));
        ISwapVM.Order memory order = swapRouter.buildSwapOrder(maker, s, RiptideConstants.SWAP_ORDER_DEADLINE);
        entry = ScriptConfig.SeededStrategy({
            id: id,
            maker: maker,
            salt: salt,
            strategyKey: RiptideStrategyCodec.runtimeStrategyKey(maker, salt),
            orderHash: swapRouter.hash(order)
        });
    }

    function _seedOneBroadcast(
        ScriptConfig.Manifest memory m,
        address maker,
        uint256,
        string memory id,
        bytes32 salt,
        MockChainlinkAggregator feed
    ) private returns (ScriptConfig.SeededStrategy memory entry) {
        entry = previewSeed(m, maker, id, salt, feed);
        VM.startBroadcast(ScriptConfig.deployerPrivateKey());
        _mintToMaker(m, maker);
        VM.stopBroadcast();
        VM.startBroadcast(ScriptConfig.makerKey(maker));
        _shipAndRegister(m, maker, id, salt, feed);
        VM.stopBroadcast();
    }

    function _seedOnePrank(
        ScriptConfig.Manifest memory m,
        address deployer,
        address maker,
        string memory id,
        bytes32 salt,
        MockChainlinkAggregator feed
    ) private returns (ScriptConfig.SeededStrategy memory entry) {
        entry = previewSeed(m, maker, id, salt, feed);
        VM.startPrank(deployer);
        _mintToMaker(m, maker);
        VM.stopPrank();
        VM.startPrank(maker);
        _shipAndRegister(m, maker, id, salt, feed);
        VM.stopPrank();
    }

    function _mintToMaker(ScriptConfig.Manifest memory m, address maker) private {
        RiptideDemoToken(m.demoBase).mint(maker, 1000e18);
        RiptideDemoToken(m.demoQuote).mint(maker, 2_000_000e18);
    }

    function _shipAndRegister(
        ScriptConfig.Manifest memory m,
        address maker,
        string memory id,
        bytes32 salt,
        MockChainlinkAggregator feed
    ) private {
        RiptideTypes.Strategy memory s = _strategyForId(id, maker, m, salt, feed);
        RiptideSwapVMRouter swapRouter = RiptideSwapVMRouter(payable(m.swapRouter));
        RiptideRebalanceRouter rebalanceRouter = RiptideRebalanceRouter(payable(m.rebalanceRouter));
        Aqua aqua = Aqua(m.aqua);

        ISwapVM.Order memory order = swapRouter.buildSwapOrder(maker, s, RiptideConstants.SWAP_ORDER_DEADLINE);
        bytes32 orderHash = swapRouter.hash(order);
        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, salt);

        RiptideDemoToken(m.demoBase).approve(address(aqua), type(uint256).max);
        RiptideDemoToken(m.demoQuote).approve(address(aqua), type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = m.demoBase;
        tokens[1] = m.demoQuote;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 200_000e18;
        aqua.ship(address(swapRouter), abi.encode(order), tokens, amounts);

        // Demo UI resolver role — order hash must match settler msg.sender.
        address demoResolver = VM.addr(ScriptConfig.takerPrivateKey());
        ISwapVM.Order memory rebOrder = rebalanceRouter.buildRebalanceOrderWithAuctionStart(
            maker,
            s,
            RiptideConstants.SWAP_ORDER_DEADLINE,
            RiptideConstants.SEED_REBALANCE_OUT_WAD,
            demoResolver,
            true,
            uint40(block.timestamp)
        );
        bytes32 rebHash = rebalanceRouter.hash(rebOrder);
        aqua.ship(address(rebalanceRouter), abi.encode(rebOrder), tokens, amounts);

        swapRouter.registerStrategy(strategyKey, orderHash, s, maker);
        bytes32 market = RiptideStrategyCodec.marketId(s.baseToken, s.quoteToken);
        // Swap order hash: lens + Aqua balances on swap router. Rebalance hash: M2 execution + preview.
        rebalanceRouter.registerStrategy(strategyKey, orderHash, market);
        rebalanceRouter.registerStrategy(strategyKey, rebHash, market);
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, uint40(block.timestamp));
    }

    function _strategyForId(
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
