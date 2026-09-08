// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";
import { VectorLoader } from "../differential/VectorLoader.sol";

import { CodecHarness } from "../helpers/CodecHarness.sol";

contract RiptideStrategyCodecTest is VectorLoader {
    using stdJson for string;

    CodecHarness internal harness;

    bytes4 internal constant MAGIC = 0x52505431;
    uint256 internal constant BPS = 1e7;

    function setUp() public {
        harness = new CodecHarness();
    }

    function test_payloadVectors() public view {
        string memory json = _loadVector("payload_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            bytes memory payload = vm.parseBytes(string.concat("0x", json.readString(string.concat(base, ".payloadHex"))));
            RiptideTypes.Strategy memory decoded = RiptideStrategyCodec.decode(payload);
            assertEq(keccak256(payload), json.readBytes32(string.concat(base, ".policyHash")));
            assertEq(RiptideStrategyCodec.marketId(decoded.baseToken, decoded.quoteToken), json.readBytes32(string.concat(base, ".marketId")));
            if (json.keyExists(string.concat(base, ".strategyKey"))) {
                address maker = json.readAddress(string.concat(base, ".strategy.maker"));
                bytes32 strategyHash = json.readBytes32(string.concat(base, ".strategyHash"));
                assertEq(RiptideStrategyCodec.strategyKey(maker, strategyHash), json.readBytes32(string.concat(base, ".strategyKey")));
            }
        }
    }

    function test_roundTripFuzz(uint256 seed) public {
        RiptideTypes.Strategy memory s = _strategyFromSeed(seed);
        bytes memory payload = harness.encode(s);
        RiptideTypes.Strategy memory roundTrip = harness.decode(payload);
        assertEq(roundTrip.maker, address(0));
        assertEq(roundTrip.baseToken, s.baseToken);
        assertEq(roundTrip.quoteToken, s.quoteToken);
        assertEq(roundTrip.reserveBaseWad, s.reserveBaseWad);
        assertEq(roundTrip.reserveQuoteWad, s.reserveQuoteWad);
        assertEq(roundTrip.fee.feeMin, s.fee.feeMin);
        assertEq(roundTrip.fee.feeMax, s.fee.feeMax);
        assertEq(roundTrip.fee.lambda, s.fee.lambda);
        assertEq(roundTrip.salt, s.salt);
        assertEq(roundTrip.feeProvider, s.feeProvider);
    }

    function _strategyFromSeed(uint256 seed) private view returns (RiptideTypes.Strategy memory s) {
        uint256 a = uint256(keccak256(abi.encode(seed, "a")));
        uint256 b = uint256(keccak256(abi.encode(seed, "b")));
        address baseToken = address(uint160(a | 1));
        address quoteToken = address(uint160(b | 1));
        if (baseToken == quoteToken) quoteToken = address(uint160(uint256(uint160(quoteToken)) + 1));
        uint24 feeMin = uint24(bound(a, 1, BPS - 2));
        uint24 feeMax = uint24(bound(b, feeMin + 1, BPS - 1));
        uint64 lambda = uint64(bound(a >> 32, 1, WadMulDiv.WAD - 1));
        uint64 sigmaMin = uint64(bound(b >> 40, 1, type(uint64).max / 2));
        uint64 sigmaMax = uint64(bound(a >> 48, sigmaMin + 1, type(uint64).max));
        uint64 beta = uint64(bound(b >> 56, 1, WadMulDiv.WAD - 1));
        uint64 decay = uint64(bound(a >> 64, 1, WadMulDiv.WAD - 1));
        s = RiptideTypes.Strategy({
            maker: address(0xBEEF),
            baseToken: baseToken,
            quoteToken: quoteToken,
            reserveBaseWad: uint128(a),
            reserveQuoteWad: uint128(b),
            fee: RiptideTypes.FeePolicy({
                feeMin: feeMin,
                feeMax: feeMax,
                lambda: lambda,
                kp: uint64(a >> 72),
                ki: uint64(b >> 80),
                iMax: uint64(a >> 88),
                sigmaMin: sigmaMin,
                sigmaMax: sigmaMax
            }),
            auction: RiptideTypes.AuctionPolicy({
                beta: beta,
                duration: uint16(a >> 96),
                decay: decay,
                antiSandwichPeriod: uint16(b >> 104)
            }),
            oracle: RiptideTypes.OracleConfig({
                feed: address(uint160(a >> 112) | 1),
                decimals: uint8(a >> 128),
                maxStaleness: uint16(b >> 136)
            }),
            feeProvider: address(uint160(b >> 144) | 1),
            salt: keccak256(abi.encode(seed))
        });
    }

    function _validStrategy() internal pure returns (RiptideTypes.Strategy memory s) {
        s = RiptideTypes.Strategy({
            maker: address(0),
            baseToken: address(0x2222),
            quoteToken: address(0x3333),
            reserveBaseWad: 5e21,
            reserveQuoteWad: 5e21,
            fee: RiptideTypes.FeePolicy({
                feeMin: 30_000,
                feeMax: 500_000,
                lambda: 940_000_000_000_000_000,
                kp: 500_000_000_000_000_000,
                ki: 100_000_000_000_000_000,
                iMax: 1e18,
                sigmaMin: 1e16,
                sigmaMax: 1e18
            }),
            auction: RiptideTypes.AuctionPolicy({
                beta: 950_000_000_000_000_000,
                duration: 3600,
                decay: 990_000_000_000_000_000,
                antiSandwichPeriod: 300
            }),
            oracle: RiptideTypes.OracleConfig({ feed: address(0x4444), decimals: 8, maxStaleness: 3600 }),
            feeProvider: address(0x5555),
            salt: bytes32(uint256(1))
        });
    }

    function test_rejectInvalidEncodingLength() public {
        bytes memory shortPayload = hex"52505431";
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidEncodingLength.selector, 4, 226));
        harness.decode(shortPayload);
    }

    function test_rejectInvalidMagic() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        bytes memory payload = harness.encode(s);
        payload[0] = 0xff;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidEncodingMagic.selector, bytes4(0xff505431), MAGIC));
        harness.decode(payload);
    }

    function test_rejectUnsupportedVersion() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        bytes memory payload = harness.encode(s);
        payload[4] = 0x02;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideUnsupportedEncodingVersion.selector, uint8(2), uint8(1)));
        harness.decode(payload);
    }

    function test_rejectZeroBaseToken() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.baseToken = address(0);
        vm.expectRevert(RiptideErrors.RiptideZeroAddress.selector);
        harness.encode(s);
    }

    function test_rejectZeroQuoteToken() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.quoteToken = address(0);
        vm.expectRevert(RiptideErrors.RiptideZeroAddress.selector);
        harness.encode(s);
    }

    function test_rejectZeroOracleFeed() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.oracle.feed = address(0);
        vm.expectRevert(RiptideErrors.RiptideZeroAddress.selector);
        harness.encode(s);
    }

    function test_rejectZeroFeeProvider() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.feeProvider = address(0);
        vm.expectRevert(RiptideErrors.RiptideZeroAddress.selector);
        harness.encode(s);
    }

    function test_rejectIdenticalTokens() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.quoteToken = s.baseToken;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideIdenticalTokens.selector, s.baseToken));
        harness.encode(s);
    }

    function test_rejectInvalidFeeBoundsZeroMin() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.fee.feeMin = 0;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidFeeBounds.selector, uint24(0), s.fee.feeMax));
        harness.encode(s);
    }

    function test_rejectInvalidFeeBoundsMinGteMax() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.fee.feeMin = s.fee.feeMax;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidFeeBounds.selector, s.fee.feeMin, s.fee.feeMax));
        harness.encode(s);
    }

    function test_rejectInvalidFeeBoundsMaxGteBps() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.fee.feeMax = uint24(BPS);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidFeeBounds.selector, s.fee.feeMin, uint24(BPS)));
        harness.encode(s);
    }

    function test_rejectInvalidLambdaZero() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.fee.lambda = 0;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidLambda.selector, uint64(0)));
        harness.encode(s);
    }

    function test_rejectInvalidLambdaGteWad() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.fee.lambda = uint64(WadMulDiv.WAD);
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidLambda.selector, uint64(WadMulDiv.WAD)));
        harness.encode(s);
    }

    function test_rejectInvalidSigmaBounds() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.fee.sigmaMin = s.fee.sigmaMax;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidSigmaBounds.selector, s.fee.sigmaMin, s.fee.sigmaMax));
        harness.encode(s);
    }

    function test_rejectInvalidBeta() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.auction.beta = 0;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidBeta.selector, uint64(0)));
        harness.encode(s);
    }

    function test_rejectInvalidDecay() public {
        RiptideTypes.Strategy memory s = _validStrategy();
        s.auction.decay = 0;
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideInvalidDecay.selector, uint64(0)));
        harness.encode(s);
    }
}
