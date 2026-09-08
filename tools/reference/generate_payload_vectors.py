"""Generate or verify committed payload JSON test vectors."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .payload_cases import all_payload_vector_files

REPO_ROOT = Path(__file__).resolve().parents[2]
VECTORS_DIR = REPO_ROOT / "test" / "vectors"


def _serialize_payload(files: dict[str, list[dict]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for name, cases in files.items():
        payload = {"version": 1, "cases": cases}
        out[name] = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    return out


def write_vectors() -> None:
    VECTORS_DIR.mkdir(parents=True, exist_ok=True)
    for name, content in _serialize_payload(all_payload_vector_files()).items():
        (VECTORS_DIR / name).write_text(content, encoding="utf-8", newline="\n")


def check_vectors() -> int:
    files = _serialize_payload(all_payload_vector_files())
    exit_code = 0
    for name, expected in files.items():
        path = VECTORS_DIR / name
        if not path.exists():
            print(f"missing vector file: {path}", file=sys.stderr)
            exit_code = 1
            continue
        actual = path.read_text(encoding="utf-8")
        if actual != expected:
            print(f"vector mismatch: {path}", file=sys.stderr)
            exit_code = 1
    return exit_code


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="RIPTIDE payload vector generator")
    parser.add_argument("--check", action="store_true", help="Verify committed vectors")
    args = parser.parse_args(argv)
    if args.check:
        return check_vectors()
    write_vectors()
    return 0


if __name__ == "__main__":
    sys.exit(main())
