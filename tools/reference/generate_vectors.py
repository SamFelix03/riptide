"""Generate or verify committed JSON test vectors (Phase 0 stub)."""

from __future__ import annotations

import argparse
import sys


def write_vectors() -> None:
    """Write all vector files to test/vectors/. Implemented in Phase 3."""
    raise NotImplementedError("Vector generation is implemented in Phase 3.")


def check_vectors() -> int:
    """Verify committed vectors match deterministic regeneration. Implemented in Phase 3."""
    # Phase 0: no vectors committed yet — exit 0
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="RIPTIDE reference vector generator")
    parser.add_argument("--check", action="store_true", help="Verify committed vectors")
    args = parser.parse_args(argv)

    if args.check:
        return check_vectors()
    write_vectors()
    return 0


if __name__ == "__main__":
    sys.exit(main())
