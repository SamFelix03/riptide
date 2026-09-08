// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";
import { VolatilityMath } from "../../src/libraries/VolatilityMath.sol";
import { RiptideVolatilityOracleHarness } from "../mocks/RiptideVolatilityOracleHarness.sol";
import { MockChainlinkAggregator } from "../mocks/MockChainlinkAggregator.sol";
import { VectorLoader } from "../differential/VectorLoader.sol";

contract RiptideVolatilityOracleTest is VectorLoader {
    using stdJson for string;

    RiptideVolatilityOracleHarness internal oracle;
    bytes32 internal constant KEY = keccak256("test-strategy");

    function setUp() public {
        vm.warp(10_000);
        oracle = new RiptideVolatilityOracleHarness(address(this), address(this), address(this));
        _configureDefaultPolicy();
    }

    function _configureDefaultPolicy() internal {
        RiptideTypes.FeePolicy memory fee = RiptideTypes.FeePolicy({
            feeMin: 1,
            feeMax: 2,
            lambda: 940_000_000_000_000_000,
            kp: 0,
            ki: 0,
            iMax: 0,
            sigmaMin: 10_000_000_000_000_000,
            sigmaMax: 1_000_000_000_000_000_000
        });
        RiptideTypes.OracleConfig memory oracleCfg =
            RiptideTypes.OracleConfig({ feed: address(1), decimals: 8, maxStaleness: 0 });
        oracle.configureStrategy(KEY, fee, oracleCfg);
    }

    function _configurePolicyFromJson(string memory json, string memory base, bytes32 key) internal {
        RiptideTypes.FeePolicy memory fee = RiptideTypes.FeePolicy({
            feeMin: 1,
            feeMax: 2,
            lambda: uint64(json.readUint(string.concat(base, ".inputs.lambda"))),
            kp: 0,
            ki: 0,
            iMax: 0,
            sigmaMin: uint64(json.readUint(string.concat(base, ".inputs.sigmaMin"))),
            sigmaMax: uint64(json.readUint(string.concat(base, ".inputs.sigmaMax")))
        });
        uint16 maxStale = 0;
        if (json.keyExists(string.concat(base, ".inputs.maxStaleness"))) {
            maxStale = uint16(json.readUint(string.concat(base, ".inputs.maxStaleness")));
        }
        RiptideTypes.OracleConfig memory oracleCfg =
            RiptideTypes.OracleConfig({ feed: address(1), decimals: 8, maxStaleness: maxStale });
        oracle.configureStrategy(key, fee, oracleCfg);
    }

    function test_volatilityVectorParity() public {
        string memory json = _loadVector("volatility_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory id = json.readString(string.concat(base, ".id"));
            bytes32 key = keccak256(bytes(id));

            if (keccak256(bytes(id)) == keccak256("vol_stale_freeze")) {
                continue;
            }

            _configurePolicyFromJson(json, base, key);
            uint128 lastPrice = 1e18;
            uint40 lastTs = 1000;

            if (keccak256(bytes(id)) == keccak256("vol_clamp_min")) {
                uint128 sigma = oracle.observeWithLogReturn(key, 0, lastPrice, lastTs, 0, false);
                _assertUintOutput(sigma, json, string.concat(base, ".outputs.sigmaWad"));
                continue;
            }

            uint128 prevVar = uint128(json.readUint(string.concat(base, ".inputs.prevVar")));
            int256 logReturn = int256(json.readUint(string.concat(base, ".inputs.logReturn")));
            oracle.seedState(key, prevVar, 0, lastTs, lastPrice, true);

            if (keccak256(bytes(id)) == keccak256("vol_gk_blend")) {
                uint128 h = uint128(json.readUint(string.concat(base, ".inputs.high")));
                uint128 l = uint128(json.readUint(string.concat(base, ".inputs.low")));
                uint128 c = uint128(json.readUint(string.concat(base, ".inputs.close")));
                uint128 o = uint128(json.readUint(string.concat(base, ".inputs.open")));
                uint128 gk = VolatilityMath.gkTerm(h, l, c, o);
                uint128 sigmaGk = oracle.observeWithLogReturn(key, logReturn, c, lastTs + 1, gk, true);
                _assertUintOutput(oracle.varWad(key), json, string.concat(base, ".outputs.varWad"));
                _assertUintOutput(sigmaGk, json, string.concat(base, ".outputs.sigmaWad"));
                continue;
            }

            uint128 sigmaOut = oracle.observeWithLogReturn(key, logReturn, lastPrice + 1, lastTs + 1, 0, false);
            if (json.keyExists(string.concat(base, ".outputs.varWad"))) {
                _assertUintOutput(oracle.varWad(key), json, string.concat(base, ".outputs.varWad"));
            }
            _assertUintOutput(sigmaOut, json, string.concat(base, ".outputs.sigmaWad"));
        }
    }

    function test_staticNoMutation() public {
        oracle.seedState(KEY, 1e17, 2e17, 1000, 1e18, true);
        vm.record();
        oracle.observe(KEY, 2e18, 1001, true);
        (, bytes32[] memory writes) = vm.accesses(address(oracle));
        assertEq(writes.length, 0, "static observe must not write storage");
    }

    /// @dev Negative control: observeAlwaysMutate writes storage even when static semantics are expected.
    function test_staticNegativeControl() public {
        oracle.seedState(KEY, 1e17, 2e17, 1000, 1e18, true);
        vm.record();
        oracle.observeAlwaysMutate(KEY, 2e18, 1001);
        (, bytes32[] memory writes) = vm.accesses(address(oracle));
        assertGt(writes.length, 0, "without isStatic guard storage would mutate");
    }

    function test_staleFreeze() public {
        RiptideTypes.FeePolicy memory fee = RiptideTypes.FeePolicy({
            feeMin: 1,
            feeMax: 2,
            lambda: 940_000_000_000_000_000,
            kp: 0,
            ki: 0,
            iMax: 0,
            sigmaMin: 10_000_000_000_000_000,
            sigmaMax: 1_000_000_000_000_000_000
        });
        RiptideTypes.OracleConfig memory oracleCfg =
            RiptideTypes.OracleConfig({ feed: address(1), decimals: 8, maxStaleness: 60 });
        oracle.configureStrategy(KEY, fee, oracleCfg);

        uint128 sigmaPrev = 200_000_000_000_000_000;
        oracle.seedState(KEY, 1e17, sigmaPrev, 1000, 1e18, true);

        uint40 staleTs = uint40(block.timestamp - 120);
        uint128 sigma = oracle.observeWithLogReturn(KEY, int256(1e18), 2e18, staleTs, 0, false);
        assertEq(sigma, sigmaPrev);

        uint128 varNext = VolatilityMath.ewmaVar(1e17, int256(1e18), fee.lambda, 0, false);
        uint64 dtWad = uint64(120 * WadMulDiv.WAD);
        uint128 candidate = VolatilityMath.sigmaFromVar(varNext, dtWad, fee.sigmaMin, fee.sigmaMax);
        assertTrue(candidate != sigmaPrev, "stale negative control: candidate would differ without freeze");
    }

    function test_unauthorizedObserver() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnauthorizedObserver.selector, address(0xDEAD)));
        vm.prank(address(0xDEAD));
        oracle.observe(KEY, 1e18, 1000, false);
    }

    function test_volIndexerCanObserveSwapRouterCannot() public {
        address swap = address(0xBEEF);
        address indexer = address(0xCAFE);
        RiptideVolatilityOracleHarness isolated =
            new RiptideVolatilityOracleHarness(address(this), swap, indexer);

        RiptideTypes.FeePolicy memory fee = RiptideTypes.FeePolicy({
            feeMin: 1,
            feeMax: 2,
            lambda: 940_000_000_000_000_000,
            kp: 0,
            ki: 0,
            iMax: 0,
            sigmaMin: 10_000_000_000_000_000,
            sigmaMax: 1_000_000_000_000_000_000
        });
        RiptideTypes.OracleConfig memory oracleCfg =
            RiptideTypes.OracleConfig({ feed: address(1), decimals: 8, maxStaleness: 0 });
        isolated.configureStrategy(KEY, fee, oracleCfg);

        vm.prank(swap);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnauthorizedObserver.selector, swap));
        isolated.observe(KEY, 1e18, 1000, false);

        vm.prank(indexer);
        uint128 sigma = isolated.observe(KEY, 1e18, 1000, false);
        assertEq(sigma, 10_000_000_000_000_000);
    }

    function test_assertFeedFreshRevertsOnStaleRound() public {
        MockChainlinkAggregator feed = new MockChainlinkAggregator();
        feed.setRound(100_00000000, block.timestamp - 1000);
        vm.expectRevert(
            abi.encodeWithSelector(RiptideErrors.RiptideStaleOracleRound.selector, block.timestamp - 1000, uint16(60))
        );
        oracle.assertFeedFresh(address(feed), 60);
    }

    function test_assertFeedFreshSkipsWhenZero() public {
        MockChainlinkAggregator feed = new MockChainlinkAggregator();
        feed.setRound(100_00000000, 0);
        oracle.assertFeedFresh(address(feed), 0);
    }
}
