"""Deterministic payload vector scenarios for RiptideStrategyCodec parity."""

from __future__ import annotations

from .payload_codec import (
    WAD,
    BPS,
    encode_strategy,
    market_id,
    policy_hash,
    strategy_key,
)


def _base_strategy() -> dict:
    return {
        "maker": "0x1111111111111111111111111111111111111111",
        "baseToken": "0x2222222222222222222222222222222222222222",
        "quoteToken": "0x3333333333333333333333333333333333333333",
        "reserveBaseWad": "5000000000000000000000",
        "reserveQuoteWad": "5000000000000000000000",
        "fee": {
            "feeMin": "30000",
            "feeMax": "500000",
            "lambda": "940000000000000000",
            "kp": "500000000000000000",
            "ki": "100000000000000000",
            "iMax": "1000000000000000000",
            "sigmaMin": "10000000000000000",
            "sigmaMax": "1000000000000000000",
        },
        "auction": {
            "beta": "950000000000000000",
            "duration": "3600",
            "decay": "990000000000000000",
            "antiSandwichPeriod": "300",
        },
        "oracle": {
            "feed": "0x4444444444444444444444444444444444444444",
            "decimals": "8",
            "maxStaleness": "3600",
        },
        "feeProvider": "0x5555555555555555555555555555555555555555",
        "salt": "0x6666666666666666666666666666666666666666666666666666666666666667",
    }


def payload_cases() -> list[dict]:
    cases = []

    mid = _base_strategy()
    payload = encode_strategy(mid)
    cases.append(
        {
            "id": "payload_canonical_mid",
            "strategy": mid,
            "payloadHex": payload.hex(),
            "policyHash": policy_hash(payload),
            "marketId": market_id(mid["baseToken"], mid["quoteToken"]),
            "strategyKey": strategy_key(mid["maker"], "0x" + "ab" * 32),
            "strategyHash": "0x" + "ab" * 32,
        }
    )

    fee_edge = _base_strategy()
    fee_edge["fee"]["feeMin"] = "1"
    fee_edge["fee"]["feeMax"] = str(BPS - 1)
    fee_edge["salt"] = "0x" + "01" * 32
    payload = encode_strategy(fee_edge)
    cases.append(
        {
            "id": "payload_fee_bounds_edge",
            "strategy": fee_edge,
            "payloadHex": payload.hex(),
            "policyHash": policy_hash(payload),
            "marketId": market_id(fee_edge["baseToken"], fee_edge["quoteToken"]),
        }
    )

    auction_edge = _base_strategy()
    auction_edge["auction"]["beta"] = "100000000000000000"
    auction_edge["auction"]["decay"] = str(WAD - 1)
    auction_edge["salt"] = "0x" + "02" * 32
    payload = encode_strategy(auction_edge)
    cases.append(
        {
            "id": "payload_auction_edge",
            "strategy": auction_edge,
            "payloadHex": payload.hex(),
            "policyHash": policy_hash(payload),
            "marketId": market_id(auction_edge["baseToken"], auction_edge["quoteToken"]),
        }
    )

    return cases


def all_payload_vector_files() -> dict[str, list[dict]]:
    return {"payload_v1.json": payload_cases()}
