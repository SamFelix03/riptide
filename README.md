# RIPTIDE

LVR-internalizing market-making engine on 1inch Aqua + SwapVM.

A maker ships a single-maker CPMM into Aqua and wraps it with two control layers:

1. **Mechanism 1** — a volatility-indexed fee so expected fee revenue tracks expected LVR.
2. **Mechanism 2** — a resolver rebalancing auction with Diamond β-retention.

This commit is the Phase 0 workspace bootstrap: empty-but-buildable monorepo, CI, and the core specification set. Product logic lands in later phases.

## Specs

Start at [`docs/INDEX.md`](docs/INDEX.md).

## Toolchain

| Tool | Version |
| --- | --- |
| Solidity | `0.8.30` |
| Node.js | `>=20` (CI uses 22) |
| pnpm | `9.15.0` |
| Python | `3.11+` |

## Layout

```text
contracts/    Foundry (types → libraries → codec → oracle → fees → kernel → router → periphery)
packages/     riptide-math, strategy-sdk, contracts, solver-core, resolver-core, frontend-api
services/     solver-api, resolver-bot, vol-indexer, liquidity-mcp
subgraph/     The Graph schema + mappings
apps/web/     Next.js demo
deployments/  chain manifests
tools/reference/  Python differential oracle
docs/         specification set
```
