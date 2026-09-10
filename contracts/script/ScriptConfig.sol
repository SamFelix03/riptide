// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Vm } from "forge-std/Vm.sol";

import { RiptideTypes } from "../src/types/RiptideTypes.sol";

/// @notice Anvil default accounts and manifest helpers for local deployment.
library ScriptConfig {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant MAKER1_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 internal constant MAKER2_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 internal constant MAKER3_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 internal constant TAKER_KEY = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
    uint256 internal constant RESOLVER_KEY = 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba;

    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    struct SeededStrategy {
        string id;
        address maker;
        bytes32 salt;
        bytes32 strategyKey;
        bytes32 orderHash;
    }

    struct Manifest {
        uint256 chainId;
        string name;
        uint256 blockNumber;
        string commit;
        address aqua;
        address swapRouter;
        address rebalanceRouter;
        address kernel;
        address oracle;
        address feeProvider;
        address settler;
        address quoter;
        address lens;
        address batchExecutor;
        address demoBase;
        address demoQuote;
        address chainlinkFeed;
        address demoResolver;
        SeededStrategy[] seededStrategies;
        string subgraphUrl;
        string rpcUrl;
        string explorerUrl;
    }

    function makerKey(address maker) internal pure returns (uint256 key) {
        if (maker == VM.addr(MAKER1_KEY)) return MAKER1_KEY;
        if (maker == VM.addr(MAKER2_KEY)) return MAKER2_KEY;
        if (maker == VM.addr(MAKER3_KEY)) return MAKER3_KEY;
        revert("Unknown maker");
    }

    function anvilAccounts()
        internal
        view
        returns (address deployer, address maker1, address maker2, address maker3, address taker, address resolver)
    {
        return demoAccounts();
    }

    /// @notice Anvil well-known keys for local script demos. Not used by the public frontend.
    function demoAccounts()
        internal
        view
        returns (address deployer, address maker1, address maker2, address maker3, address taker, address resolver)
    {
        deployer = VM.addr(deployerPrivateKey());
        maker1 = VM.addr(MAKER1_KEY);
        maker2 = VM.addr(MAKER2_KEY);
        maker3 = VM.addr(MAKER3_KEY);
        taker = VM.addr(TAKER_KEY);
        resolver = taker;
    }

    function takerPrivateKey() internal pure returns (uint256) {
        return TAKER_KEY;
    }

    /// @notice Broadcast key for deploy/seed. Anvil default unless `DEPLOYER_PRIVATE_KEY` is set.
    function deployerPrivateKey() internal view returns (uint256) {
        return VM.envOr("DEPLOYER_PRIVATE_KEY", DEPLOYER_KEY);
    }

    function fillNetworkFields(Manifest memory m) internal view {
        m.chainId = block.chainid;
        m.blockNumber = block.number;
        m.commit = VM.envOr("GIT_COMMIT", string("local"));
        if (block.chainid == BASE_SEPOLIA_CHAIN_ID) {
            m.name = "base-sepolia";
            m.rpcUrl = VM.envOr("PUBLIC_RPC_URL", string("https://sepolia.base.org"));
            m.explorerUrl = VM.envOr("EXPLORER_URL", string("https://sepolia.basescan.org"));
        } else if (block.chainid == ANVIL_CHAIN_ID) {
            m.name = "anvil";
            m.rpcUrl = VM.envOr("PUBLIC_RPC_URL", string("http://127.0.0.1:8545"));
            m.explorerUrl = "";
        } else {
            m.name = VM.toString(block.chainid);
            m.rpcUrl = VM.envOr("PUBLIC_RPC_URL", VM.envOr("RPC_URL", string("http://127.0.0.1:8545")));
            m.explorerUrl = VM.envOr("EXPLORER_URL", string(""));
        }
    }

    function manifestPath(uint256 chainId) internal pure returns (string memory) {
        return string.concat("../deployments/", VM.toString(chainId), ".json");
    }

    function writeManifest(Manifest memory m) internal {
        string memory json = "{";
        json = string.concat(json, '"chainId":', VM.toString(m.chainId));
        json = string.concat(json, ',"name":"', m.name, '"');
        json = string.concat(json, ',"blockNumber":', VM.toString(m.blockNumber));
        json = string.concat(json, ',"commit":"', m.commit, '"');
        json = string.concat(json, ',"aqua":"', VM.toString(m.aqua), '"');
        json = string.concat(json, ',"swapRouter":"', VM.toString(m.swapRouter), '"');
        json = string.concat(json, ',"rebalanceRouter":"', VM.toString(m.rebalanceRouter), '"');
        json = string.concat(json, ',"kernel":"', VM.toString(m.kernel), '"');
        json = string.concat(json, ',"oracle":"', VM.toString(m.oracle), '"');
        json = string.concat(json, ',"feeProvider":"', VM.toString(m.feeProvider), '"');
        json = string.concat(json, ',"settler":"', VM.toString(m.settler), '"');
        json = string.concat(json, ',"quoter":"', VM.toString(m.quoter), '"');
        json = string.concat(json, ',"lens":"', VM.toString(m.lens), '"');
        json = string.concat(json, ',"batchExecutor":"', VM.toString(m.batchExecutor), '"');
        json = string.concat(json, ',"demoTokens":{"base":"', VM.toString(m.demoBase), '"');
        json = string.concat(json, ',"quote":"', VM.toString(m.demoQuote), '"}');
        json = string.concat(json, ',"chainlinkFeed":"', VM.toString(m.chainlinkFeed), '"');
        json = string.concat(json, ',"demoResolver":"', VM.toString(m.demoResolver), '"');
        json = string.concat(json, ',"seededStrategies":', _seededArrayJson(m.seededStrategies));
        json = string.concat(json, ',"subgraphUrl":"', m.subgraphUrl, '"');
        json = string.concat(json, ',"rpcUrl":"', m.rpcUrl, '"');
        json = string.concat(json, ',"explorerUrl":"', m.explorerUrl, '"}');
        VM.writeFile(manifestPath(m.chainId), json);
    }

    function _seededArrayJson(SeededStrategy[] memory seeded) private pure returns (string memory) {
        if (seeded.length == 0) return "[]";
        bytes memory buf = bytes("[");
        for (uint256 i; i < seeded.length; ++i) {
            if (i > 0) buf = abi.encodePacked(buf, ",");
            buf = abi.encodePacked(
                buf,
                '{"id":"',
                seeded[i].id,
                '","maker":"',
                VM.toString(seeded[i].maker),
                '","salt":"',
                VM.toString(seeded[i].salt),
                '","strategyKey":"',
                VM.toString(seeded[i].strategyKey),
                '","orderHash":"',
                VM.toString(seeded[i].orderHash),
                '"}'
            );
        }
        return string(abi.encodePacked(buf, "]"));
    }

    function strategyS1(address maker, address base, address quote, address feed, address provider, bytes32 salt)
        internal
        pure
        returns (RiptideTypes.Strategy memory s)
    {
        s = _baseStrategy(maker, base, quote, feed, provider, salt);
        s.fee = RiptideTypes.FeePolicy({
            feeMin: 10_000,
            feeMax: 50_000,
            lambda: 990_000_000_000_000_000,
            kp: 100_000_000_000_000_000,
            ki: 50_000_000_000_000_000,
            iMax: 500_000_000_000_000_000,
            sigmaMin: 5_000_000_000_000_000,
            sigmaMax: 500_000_000_000_000_000
        });
        s.auction = RiptideTypes.AuctionPolicy({
            beta: 970_000_000_000_000_000,
            duration: 7200,
            decay: 995_000_000_000_000_000,
            antiSandwichPeriod: 600
        });
    }

    function strategyS2(address maker, address base, address quote, address feed, address provider, bytes32 salt)
        internal
        pure
        returns (RiptideTypes.Strategy memory s)
    {
        s = _baseStrategy(maker, base, quote, feed, provider, salt);
        s.fee = RiptideTypes.FeePolicy({
            feeMin: 30_000,
            feeMax: 500_000,
            lambda: 100_000_000_000_000_000,
            kp: 500_000_000_000_000_000,
            ki: 100_000_000_000_000_000,
            iMax: 1_000_000_000_000_000_000,
            sigmaMin: 10_000_000_000_000_000,
            sigmaMax: 1_000_000_000_000_000_000
        });
        s.auction = RiptideTypes.AuctionPolicy({
            beta: 950_000_000_000_000_000,
            duration: 3600,
            decay: 990_000_000_000_000_000,
            antiSandwichPeriod: 300
        });
    }

    function strategyS3(address maker, address base, address quote, address feed, address provider, bytes32 salt)
        internal
        pure
        returns (RiptideTypes.Strategy memory s)
    {
        s = _baseStrategy(maker, base, quote, feed, provider, salt);
        s.fee = RiptideTypes.FeePolicy({
            feeMin: 50_000,
            feeMax: 800_000,
            lambda: 850_000_000_000_000_000,
            kp: 800_000_000_000_000_000,
            ki: 200_000_000_000_000_000,
            iMax: 2_000_000_000_000_000_000,
            sigmaMin: 20_000_000_000_000_000,
            sigmaMax: 2_000_000_000_000_000_000
        });
        s.auction = RiptideTypes.AuctionPolicy({
            beta: 900_000_000_000_000_000,
            duration: 1800,
            decay: 980_000_000_000_000_000,
            antiSandwichPeriod: 120
        });
    }

    function _baseStrategy(address maker, address base, address quote, address feed, address provider, bytes32 salt)
        private
        pure
        returns (RiptideTypes.Strategy memory s)
    {
        s = RiptideTypes.Strategy({
            maker: maker,
            baseToken: base,
            quoteToken: quote,
            reserveBaseWad: 100e18,
            reserveQuoteWad: 200_000e18,
            fee: RiptideTypes.FeePolicy(0, 0, 0, 0, 0, 0, 0, 0),
            auction: RiptideTypes.AuctionPolicy(0, 0, 0, 0),
            oracle: RiptideTypes.OracleConfig({ feed: feed, decimals: 8, maxStaleness: 3600 }),
            feeProvider: provider,
            salt: salt
        });
    }
}
