# RIPTIDE Subgraph (Phase 17)

Indexes Aqua lifecycle, swap fills, fee controller updates, batch routes, and rebalances.

## Path A — Local Graph Node (Anvil)

Prerequisites: Docker Desktop, Anvil on `--host 0.0.0.0 --chain-id 31337 --port 8545`, contracts deployed + seeded.

```bash
pnpm subgraph:up
pnpm subgraph:deploy-local
pnpm subgraph:down
```

Query URL: `http://localhost:8000/subgraphs/name/riptide/riptide-anvil`

```bash
curl -X POST http://localhost:8000/subgraphs/name/riptide/riptide-anvil \
  -H "content-type: application/json" \
  -d '{"query":"{ _meta { block { number } } strategies { id strategyKey docked } }"}'
```

## Path B — Graph Studio

Requires a supported public network, `GRAPH_DEPLOY_KEY`, and `GRAPH_STUDIO_SLUG`:

```bash
pnpm subgraph:deploy
```

## Matchstick

```bash
cd subgraph && pnpm run codegen && pnpm run test
```

Consumers: `packages/solver-core` (`SubgraphDiscoveryProvider`), `services/solver-api` `/readyz`, `services/resolver-bot` active-strategy filter. The standardized DEX subgraph URL in `config/dex-subgraph.ts` is for the MCP comparison tool only.
