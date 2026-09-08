"""RIPTIDE payload v1 encoder mirroring RiptideStrategyCodec.sol."""

from __future__ import annotations

import subprocess
from typing import Any

WAD = 10**18
BPS = 10**7
MAGIC = b"RPT1"
VERSION = 1
PAYLOAD_LENGTH = 226


def keccak256(data: bytes) -> bytes:
    try:
        from Crypto.Hash import keccak as keccak_mod

        return keccak_mod.new(digest_bits=256, data=data).digest()
    except ImportError:
        hexin = "0x" + data.hex()
        out = subprocess.check_output(["cast", "keccak", hexin], text=True).strip()
        return bytes.fromhex(out.removeprefix("0x"))


MARKET_ID_DOMAIN = keccak256(b"RIPTIDE.marketId.v1")


def _hex_to_bytes(addr: str) -> bytes:
    h = addr.lower().removeprefix("0x")
    return bytes.fromhex(h.rjust(40, "0"))


def _hex_to_bytes32(val: str) -> bytes:
    h = val.lower().removeprefix("0x")
    return bytes.fromhex(h.rjust(64, "0"))


def _write_uint(bits: int, value: int) -> bytes:
    return value.to_bytes(bits // 8, byteorder="big")


def _abi_encode_address(addr: str) -> bytes:
    return b"\x00" * 12 + _hex_to_bytes(addr)


def encode_strategy(strategy: dict[str, Any]) -> bytes:
    buf = bytearray(PAYLOAD_LENGTH)
    buf[0:4] = MAGIC
    buf[4] = VERSION
    buf[5:25] = _hex_to_bytes(strategy["baseToken"])
    buf[25:45] = _hex_to_bytes(strategy["quoteToken"])
    buf[45:77] = _hex_to_bytes32(strategy["salt"])
    buf[77:93] = _write_uint(128, int(strategy["reserveBaseWad"]))
    buf[93:109] = _write_uint(128, int(strategy["reserveQuoteWad"]))
    fee = strategy["fee"]
    buf[109:112] = _write_uint(24, int(fee["feeMin"]))
    buf[112:115] = _write_uint(24, int(fee["feeMax"]))
    buf[115:123] = _write_uint(64, int(fee["lambda"]))
    buf[123:131] = _write_uint(64, int(fee["kp"]))
    buf[131:139] = _write_uint(64, int(fee["ki"]))
    buf[139:147] = _write_uint(64, int(fee["iMax"]))
    buf[147:155] = _write_uint(64, int(fee["sigmaMin"]))
    buf[155:163] = _write_uint(64, int(fee["sigmaMax"]))
    auction = strategy["auction"]
    buf[163:171] = _write_uint(64, int(auction["beta"]))
    buf[171:173] = _write_uint(16, int(auction["duration"]))
    buf[173:181] = _write_uint(64, int(auction["decay"]))
    buf[181:183] = _write_uint(16, int(auction["antiSandwichPeriod"]))
    oracle = strategy["oracle"]
    buf[183:203] = _hex_to_bytes(oracle["feed"])
    buf[203] = int(oracle["decimals"]) & 0xFF
    buf[204:206] = _write_uint(16, int(oracle["maxStaleness"]))
    buf[206:226] = _hex_to_bytes(strategy["feeProvider"])
    return bytes(buf)


def policy_hash(payload: bytes) -> str:
    return "0x" + keccak256(payload).hex()


def market_id(base: str, quote: str) -> str:
    encoded = MARKET_ID_DOMAIN + _abi_encode_address(base) + _abi_encode_address(quote)
    return "0x" + keccak256(encoded).hex()


def strategy_key(maker: str, strategy_hash_hex: str) -> str:
    encoded = _abi_encode_address(maker) + _hex_to_bytes32(strategy_hash_hex)
    return "0x" + keccak256(encoded).hex()
