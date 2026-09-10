"""Validate a RIPTIDE deployment manifest against the documented schema.

Phase 13 will replace this with `@riptide/contracts validate-manifest`. Until then
CI uses this checker on the example fixture and on Anvil-written `31337.json`.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
HEX32_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")

REQUIRED_TOP = (
    "chainId",
    "name",
    "blockNumber",
    "commit",
    "aqua",
    "swapRouter",
    "rebalanceRouter",
    "kernel",
    "oracle",
    "feeProvider",
    "settler",
    "quoter",
    "lens",
    "batchExecutor",
    "demoTokens",
    "subgraphUrl",
    "rpcUrl",
    "explorerUrl",
)

ADDRESS_FIELDS = (
    "aqua",
    "swapRouter",
    "rebalanceRouter",
    "kernel",
    "oracle",
    "feeProvider",
    "settler",
    "quoter",
    "lens",
    "batchExecutor",
)


def _is_address(value: Any) -> bool:
    return isinstance(value, str) and ADDRESS_RE.fullmatch(value) is not None


def _is_hex32(value: Any) -> bool:
    return isinstance(value, str) and HEX32_RE.fullmatch(value) is not None


def validate_manifest(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED_TOP:
        if key not in data:
            errors.append(f"missing required field: {key}")

    if errors:
        return errors

    if not isinstance(data["chainId"], int) or data["chainId"] <= 0:
        errors.append("chainId must be a positive integer")
    if not isinstance(data["name"], str) or not data["name"]:
        errors.append("name must be a non-empty string")
    if not isinstance(data["blockNumber"], int) or data["blockNumber"] < 0:
        errors.append("blockNumber must be a non-negative integer")
    if not isinstance(data["commit"], str):
        errors.append("commit must be a string")
    if not isinstance(data["subgraphUrl"], str):
        errors.append("subgraphUrl must be a string")
    if not isinstance(data["explorerUrl"], str):
        errors.append("explorerUrl must be a string")

    rpc = data.get("rpcUrl")
    if not isinstance(rpc, str) or urlparse(rpc).scheme not in {"http", "https"}:
        errors.append("rpcUrl must be an http(s) URL")

    for field in ADDRESS_FIELDS:
        if not _is_address(data.get(field)):
            errors.append(f"{field} must be a 20-byte hex address")

    tokens = data.get("demoTokens")
    if not isinstance(tokens, dict):
        errors.append("demoTokens must be an object")
    else:
        if not _is_address(tokens.get("base")):
            errors.append("demoTokens.base must be a 20-byte hex address")
        if not _is_address(tokens.get("quote")):
            errors.append("demoTokens.quote must be a 20-byte hex address")
        if tokens.get("base") == tokens.get("quote"):
            errors.append("demoTokens.base and demoTokens.quote must differ")

    for optional in ("chainlinkFeed", "demoResolver"):
        if optional in data and data[optional] is not None and not _is_address(data[optional]):
            errors.append(f"{optional} must be a 20-byte hex address")

    seeded = data.get("seededStrategies", [])
    if not isinstance(seeded, list):
        errors.append("seededStrategies must be an array")
    else:
        for i, entry in enumerate(seeded):
            prefix = f"seededStrategies[{i}]"
            if not isinstance(entry, dict):
                errors.append(f"{prefix} must be an object")
                continue
            if not isinstance(entry.get("id"), str) or not entry["id"]:
                errors.append(f"{prefix}.id must be a non-empty string")
            if not _is_address(entry.get("maker")):
                errors.append(f"{prefix}.maker must be a 20-byte hex address")
            if not _is_hex32(entry.get("salt")):
                errors.append(f"{prefix}.salt must be a 32-byte hex string")
            if not _is_hex32(entry.get("strategyKey")):
                errors.append(f"{prefix}.strategyKey must be a 32-byte hex string")
            if not _is_hex32(entry.get("orderHash")):
                errors.append(f"{prefix}.orderHash must be a 32-byte hex string")

    return errors


def validate_path(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        return [f"failed to read JSON: {exc}"]
    if not isinstance(data, dict):
        return ["manifest root must be an object"]
    return validate_manifest(data)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args:
        print("Usage: python -m tools.validate_manifest <path/to/chainId.json>", file=sys.stderr)
        return 1
    path = Path(args[0])
    errors = validate_path(path)
    if errors:
        print(f"Invalid manifest: {path}", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print(f"Valid manifest: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
