// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { IProtocolFeeProvider } from "@1inch/swap-vm/instructions/interfaces/IProtocolFeeProvider.sol";

import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { RiptideLvrFeeProviderHarness } from "../mocks/RiptideLvrFeeProviderHarness.sol";
import { RiptideVolatilityOracleHarness } from "../mocks/RiptideVolatilityOracleHarness.sol";
import { VectorLoader } from "../differential/VectorLoader.sol";

contract RiptideLvrFeeProviderTest is VectorLoader {
    using stdJson for string;

    RiptideVolatilityOracleHarness internal oracle;
    RiptideLvrFeeProviderHarness internal provider;

    bytes32 internal constant ORDER_HASH = keccak256("order");
    bytes32 internal constant STRATEGY_KEY = keccak256("strategy");
    address internal constant RECEIVER = address(0xBEEF);

    RiptideTypes.FeePolicy internal defaultFee;

    function setUp() public {
        oracle = new RiptideVolatilityOracleHarness(address(this), address(this), address(this));
        provider = new RiptideLvrFeeProviderHarness(oracle, address(this), address(this), address(this));
        defaultFee = RiptideTypes.FeePolicy({
            feeMin: 30_000,
            feeMax: 500_000,
            lambda: 100_000_000_000_000_000,
            kp: 500_000_000_000_000_000,
            ki: 100_000_000_000_000_000,
            iMax: 1_000_000_000_000_000_000,
            sigmaMin: 10_000_000_000_000_000,
            sigmaMax: 1_000_000_000_000_000_000
        });
        provider.registerStrategy(STRATEGY_KEY, ORDER_HASH, defaultFee, RECEIVER);
    }

    function _defaultArgs() internal pure returns (bytes32, address, address, address, address, bool) {
        return (ORDER_HASH, address(0x1), address(0x2), address(0x3), address(0x4), true);
    }

    function test_v3DeterminismNoStorageWrites() public {
        provider.setControllerState(STRATEGY_KEY, 100_000, 0);
        oracle.seedState(STRATEGY_KEY, 0, 300_000_000_000_000_000, 0, 1e18, true);

        (bytes32 orderHash, address maker, address taker, address tokenIn, address tokenOut, bool isExactIn) =
            _defaultArgs();

        vm.record();
        (uint32 fee1, address to1) = provider.getFeeBpsAndRecipient(orderHash, maker, taker, tokenIn, tokenOut, isExactIn);
        (, bytes32[] memory writes) = vm.accesses(address(provider));
        assertEq(writes.length, 0, "provider must not write storage");

        (bool ok, bytes memory data) = address(provider).staticcall(
            abi.encodeWithSelector(
                IProtocolFeeProvider.getFeeBpsAndRecipient.selector,
                orderHash,
                maker,
                taker,
                tokenIn,
                tokenOut,
                isExactIn
            )
        );
        assertTrue(ok);
        (uint32 fee2, address to2) = abi.decode(data, (uint32, address));
        assertEq(fee1, fee2);
        assertEq(to1, to2);
        assertEq(to1, RECEIVER);
    }

    function test_v4FeeBandFuzz(uint24 feeReported, uint128 sigmaWad) public {
        feeReported = uint24(bound(feeReported, defaultFee.feeMin, defaultFee.feeMax));
        sigmaWad = uint128(bound(sigmaWad, defaultFee.sigmaMin, defaultFee.sigmaMax));

        provider.setControllerState(STRATEGY_KEY, feeReported, 0);
        oracle.seedState(STRATEGY_KEY, 0, sigmaWad, 0, 1e18, true);

        (uint32 feeBps,) = provider.getFeeBpsAndRecipient(ORDER_HASH, address(0), address(0), address(0), address(0), true);
        assertGe(feeBps, defaultFee.feeMin);
        assertLe(feeBps, defaultFee.feeMax);
        assertLt(feeBps, 1e7);
    }

    function test_v4NegativeControlUnclampedFeeFails() public {
        provider.setControllerState(STRATEGY_KEY, defaultFee.feeMax + 1, 0);
        vm.expectRevert(
            abi.encodeWithSelector(RiptideErrors.RiptideFeeOutOfRange.selector, defaultFee.feeMax + 1, uint256(0))
        );
        provider.getFeeBpsAndRecipient(ORDER_HASH, address(0), address(0), address(0), address(0), true);
        assertGt(provider.getFeeBpsUnclamped(ORDER_HASH), defaultFee.feeMax);
    }

    function test_feeControllerVectors() public {
        string memory json = _loadVector("fee_controller_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory id = json.readString(string.concat(base, ".id"));

            RiptideTypes.FeePolicy memory fee;
            if (keccak256(bytes(id)) == keccak256("fee_target_mid")) {
                fee = RiptideTypes.FeePolicy({
                    feeMin: uint24(json.readUint(string.concat(base, ".inputs.feeMin"))),
                    feeMax: uint24(json.readUint(string.concat(base, ".inputs.feeMax"))),
                    lambda: uint64(json.readUint(string.concat(base, ".inputs.lambdaQ"))),
                    kp: 500_000_000_000_000_000,
                    ki: 100_000_000_000_000_000,
                    iMax: 1_000_000_000_000_000_000,
                    sigmaMin: 10_000_000_000_000_000,
                    sigmaMax: 1_000_000_000_000_000_000
                });
            } else {
                fee = RiptideTypes.FeePolicy({
                    feeMin: uint24(json.readUint(string.concat(base, ".inputs.feeMin"))),
                    feeMax: uint24(json.readUint(string.concat(base, ".inputs.feeMax"))),
                    lambda: defaultFee.lambda,
                    kp: uint64(json.readUint(string.concat(base, ".inputs.kp"))),
                    ki: uint64(json.readUint(string.concat(base, ".inputs.ki"))),
                    iMax: uint64(json.readUint(string.concat(base, ".inputs.iMax"))),
                    sigmaMin: 10_000_000_000_000_000,
                    sigmaMax: 1_000_000_000_000_000_000
                });
            }

            bytes32 key = keccak256(bytes(id));
            bytes32 order = keccak256(abi.encodePacked("order-", id));
            provider.registerStrategy(key, order, fee, RECEIVER);

            if (keccak256(bytes(id)) == keccak256("fee_target_mid")) {
                uint128 sigma = uint128(json.readUint(string.concat(base, ".inputs.sigmaWad")));
                oracle.seedState(key, 0, sigma, 0, 1e18, true);
                uint24 target = provider.feeTarget(key);
                _assertUintOutput(target, json, string.concat(base, ".outputs.feeTarget"));
                continue;
            }

            uint24 feeReported = uint24(json.readUint(string.concat(base, ".outputs.feeReported.floor")));
            provider.setControllerState(
                key, feeReported, int192(int256(json.readUint(string.concat(base, ".outputs.integral.floor"))))
            );
            oracle.seedState(key, 0, 100_000_000_000_000_000, 0, 1e18, true);

            (uint32 feeBps,) = provider.getFeeBpsAndRecipient(order, address(0), address(0), address(0), address(0), true);
            _assertUintOutput(feeBps, json, string.concat(base, ".outputs.feeReported"));
        }
    }

    function test_unregisteredOrderReverts() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideStrategyNotActive.selector, bytes32(uint256(999))));
        provider.getFeeBpsAndRecipient(bytes32(uint256(999)), address(0), address(0), address(0), address(0), true);
    }

    function test_registerStrategyOnlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnauthorizedResolver.selector, address(0xDEAD)));
        provider.registerStrategy(STRATEGY_KEY, keccak256("other"), defaultFee, RECEIVER);
    }
}
