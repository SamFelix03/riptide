// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { WadMulDiv } from "../libraries/WadMulDiv.sol";

/// @title RiptideStrategyCodec
/// @notice Stateless encode/decode/validate of the RIPTIDE payload v1 (SWAPVM_INTEGRATION.md §7).
library RiptideStrategyCodec {
    bytes4 internal constant MAGIC = 0x52505431;
    uint8 internal constant VERSION = 1;
    uint256 public constant PAYLOAD_LENGTH = 226;
    uint256 internal constant BPS = 1e7;
    bytes32 internal constant MARKET_ID_DOMAIN = keccak256("RIPTIDE.marketId.v1");

    function encode(RiptideTypes.Strategy memory s) internal pure returns (bytes memory payload) {
        validateStructure(s);
        payload = new bytes(PAYLOAD_LENGTH);
        _writeBytes4(payload, 0, MAGIC);
        payload[4] = bytes1(VERSION);
        _writeAddress(payload, 5, s.baseToken);
        _writeAddress(payload, 25, s.quoteToken);
        _writeBytes32(payload, 45, s.salt);
        _writeUint128(payload, 77, s.reserveBaseWad);
        _writeUint128(payload, 93, s.reserveQuoteWad);
        _writeUint24(payload, 109, s.fee.feeMin);
        _writeUint24(payload, 112, s.fee.feeMax);
        _writeUint64(payload, 115, s.fee.lambda);
        _writeUint64(payload, 123, s.fee.kp);
        _writeUint64(payload, 131, s.fee.ki);
        _writeUint64(payload, 139, s.fee.iMax);
        _writeUint64(payload, 147, s.fee.sigmaMin);
        _writeUint64(payload, 155, s.fee.sigmaMax);
        _writeUint64(payload, 163, s.auction.beta);
        _writeUint16(payload, 171, s.auction.duration);
        _writeUint64(payload, 173, s.auction.decay);
        _writeUint16(payload, 181, s.auction.antiSandwichPeriod);
        _writeAddress(payload, 183, s.oracle.feed);
        payload[203] = bytes1(s.oracle.decimals);
        _writeUint16(payload, 204, s.oracle.maxStaleness);
        _writeAddress(payload, 206, s.feeProvider);
    }

    function decode(bytes memory payload) internal pure returns (RiptideTypes.Strategy memory s) {
        _requireEnvelope(payload);
        s.maker = address(0);
        s.baseToken = _readAddress(payload, 5);
        s.quoteToken = _readAddress(payload, 25);
        s.salt = _readBytes32(payload, 45);
        s.reserveBaseWad = _readUint128(payload, 77);
        s.reserveQuoteWad = _readUint128(payload, 93);
        s.fee.feeMin = _readUint24(payload, 109);
        s.fee.feeMax = _readUint24(payload, 112);
        s.fee.lambda = _readUint64(payload, 115);
        s.fee.kp = _readUint64(payload, 123);
        s.fee.ki = _readUint64(payload, 131);
        s.fee.iMax = _readUint64(payload, 139);
        s.fee.sigmaMin = _readUint64(payload, 147);
        s.fee.sigmaMax = _readUint64(payload, 155);
        s.auction.beta = _readUint64(payload, 163);
        s.auction.duration = _readUint16(payload, 171);
        s.auction.decay = _readUint64(payload, 173);
        s.auction.antiSandwichPeriod = _readUint16(payload, 181);
        s.oracle.feed = _readAddress(payload, 183);
        s.oracle.decimals = uint8(payload[203]);
        s.oracle.maxStaleness = _readUint16(payload, 204);
        s.feeProvider = _readAddress(payload, 206);
        validateStructure(s);
    }

    function validateStructure(RiptideTypes.Strategy memory s) internal pure {
        if (s.baseToken == address(0) || s.quoteToken == address(0) || s.oracle.feed == address(0) || s.feeProvider == address(0)) {
            revert RiptideErrors.RiptideZeroAddress();
        }
        if (s.baseToken == s.quoteToken) revert RiptideErrors.RiptideIdenticalTokens(s.baseToken);
        if (s.fee.feeMin == 0 || s.fee.feeMin >= s.fee.feeMax || s.fee.feeMax >= BPS) {
            revert RiptideErrors.RiptideInvalidFeeBounds(s.fee.feeMin, s.fee.feeMax);
        }
        if (s.fee.lambda == 0 || s.fee.lambda >= WadMulDiv.WAD) {
            revert RiptideErrors.RiptideInvalidLambda(s.fee.lambda);
        }
        if (s.fee.sigmaMin >= s.fee.sigmaMax) {
            revert RiptideErrors.RiptideInvalidSigmaBounds(s.fee.sigmaMin, s.fee.sigmaMax);
        }
        if (s.auction.beta == 0 || s.auction.beta >= WadMulDiv.WAD) {
            revert RiptideErrors.RiptideInvalidBeta(s.auction.beta);
        }
        if (s.auction.decay == 0 || s.auction.decay >= WadMulDiv.WAD) {
            revert RiptideErrors.RiptideInvalidDecay(s.auction.decay);
        }
    }

    function marketId(address base, address quote) internal pure returns (bytes32) {
        return keccak256(abi.encode(MARKET_ID_DOMAIN, base, quote));
    }

    function strategyKey(address maker, bytes32 strategyHash) internal pure returns (bytes32) {
        return keccak256(abi.encode(maker, strategyHash));
    }

    function _requireEnvelope(bytes memory payload) private pure {
        if (payload.length != PAYLOAD_LENGTH) {
            revert RiptideErrors.RiptideInvalidEncodingLength(payload.length, PAYLOAD_LENGTH);
        }
        bytes4 magic = bytes4(
            (uint32(uint8(payload[0])) << 24) | (uint32(uint8(payload[1])) << 16) | (uint32(uint8(payload[2])) << 8)
                | uint32(uint8(payload[3]))
        );
        if (magic != MAGIC) revert RiptideErrors.RiptideInvalidEncodingMagic(magic, MAGIC);
        uint8 version = uint8(payload[4]);
        if (version != VERSION) revert RiptideErrors.RiptideUnsupportedEncodingVersion(version, VERSION);
    }

    function _writeBytes4(bytes memory buf, uint256 offset, bytes4 value) private pure {
        buf[offset] = bytes1(value[0]);
        buf[offset + 1] = bytes1(value[1]);
        buf[offset + 2] = bytes1(value[2]);
        buf[offset + 3] = bytes1(value[3]);
    }

    function _writeAddress(bytes memory buf, uint256 offset, address a) private pure {
        uint256 v = uint256(uint160(a));
        for (uint256 i = 0; i < 20; i++) {
            buf[offset + i] = bytes1(uint8(v >> (8 * (19 - i))));
        }
    }

    function _readAddress(bytes memory buf, uint256 offset) private pure returns (address a) {
        uint256 v;
        for (uint256 i = 0; i < 20; i++) {
            v = (v << 8) | uint8(buf[offset + i]);
        }
        a = address(uint160(v));
    }

    function _writeBytes32(bytes memory buf, uint256 offset, bytes32 value) private pure {
        for (uint256 i = 0; i < 32; i++) {
            buf[offset + i] = value[i];
        }
    }

    function _readBytes32(bytes memory buf, uint256 offset) private pure returns (bytes32 value) {
        uint256 v;
        for (uint256 i = 0; i < 32; i++) {
            v = (v << 8) | uint8(buf[offset + i]);
        }
        value = bytes32(v);
    }

    function _writeUint128(bytes memory buf, uint256 offset, uint128 value) private pure {
        uint256 v = value;
        for (uint256 i = 0; i < 16; i++) {
            buf[offset + i] = bytes1(uint8(v >> (8 * (15 - i))));
        }
    }

    function _readUint128(bytes memory buf, uint256 offset) private pure returns (uint128 value) {
        uint256 v;
        for (uint256 i = 0; i < 16; i++) {
            v = (v << 8) | uint8(buf[offset + i]);
        }
        value = uint128(v);
    }

    function _writeUint64(bytes memory buf, uint256 offset, uint64 value) private pure {
        uint256 v = value;
        for (uint256 i = 0; i < 8; i++) {
            buf[offset + i] = bytes1(uint8(v >> (8 * (7 - i))));
        }
    }

    function _readUint64(bytes memory buf, uint256 offset) private pure returns (uint64 value) {
        uint256 v;
        for (uint256 i = 0; i < 8; i++) {
            v = (v << 8) | uint8(buf[offset + i]);
        }
        value = uint64(v);
    }

    function _writeUint24(bytes memory buf, uint256 offset, uint24 value) private pure {
        uint256 v = value;
        for (uint256 i = 0; i < 3; i++) {
            buf[offset + i] = bytes1(uint8(v >> (8 * (2 - i))));
        }
    }

    function _readUint24(bytes memory buf, uint256 offset) private pure returns (uint24 value) {
        uint256 v;
        for (uint256 i = 0; i < 3; i++) {
            v = (v << 8) | uint8(buf[offset + i]);
        }
        value = uint24(v);
    }

    function _writeUint16(bytes memory buf, uint256 offset, uint16 value) private pure {
        uint256 v = value;
        buf[offset] = bytes1(uint8(v >> 8));
        buf[offset + 1] = bytes1(uint8(v));
    }

    function _readUint16(bytes memory buf, uint256 offset) private pure returns (uint16 value) {
        value = (uint16(uint8(buf[offset])) << 8) | uint16(uint8(buf[offset + 1]));
    }
}
