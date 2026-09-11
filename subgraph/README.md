# RIPTIDE Subgraph (Phase 17)

Indexes Aqua lifecycle, swap fills, fee controller updates, batch routes, and rebalances for the Anvil deployment.

## Path A — Local Graph Node (recommended for Anvil)

### Prerequisites

- Docker Desktop
- Anvil running with host binding (so Docker can reach it):

```powershell
& "$env:USERPROFILE\.foundry\bin\anvil.exe" --host 0.0.0.0 --chain-id 31337 --code-size-limit 100000 --port 8545
```

- Contracts deployed + seeded (`forge script deploy.s.sol` + `seed.s.sol`)

### Commands

From repo root:

```bash
pnpm subgraph:up            # start postgres + ipfs + graph-node (Docker)
pnpm subgraph:deploy-local  # codegen, build, deploy, patch SUBGRAPH_URL in .env files
pnpm subgraph:down          # stop Docker stack
```

Or from `subgraph/`:

```bash
pnpm run deploy:local
```

### Query URL (auto-set after deploy)

```
http://localhost:8000/subgraphs/name/riptide/riptide-anvil
```

Test:

```bash
curl -X POST http://localhost:8000/subgraphs/name/riptide/riptide-anvil \
  -H "content-type: application/json" \
  -d '{"query":"{ _meta { block { number } } strategies { id strategyKey docked } }"}'
```

## Path B — Graph Studio (public testnet only)

Requires deploying contracts to a [supported network](https://thegraph.com/docs/en/supported-networks/) (e.g. Sepolia), updating `subgraph.yaml` network + addresses, and setting `GRAPH_DEPLOY_KEY` in `subgraph/.env`.

```bash
pnpm subgraph:deploy
```

## Environment

See `subgraph/.env` (created from `.env.example`):

| Variable | Path A default |
|----------|----------------|
| `GRAPH_NODE_URL` | `http://localhost:8020` |
| `GRAPH_IPFS_URL` | `http://localhost:5001` |
| `GRAPH_SUBGRAPH_NAME` | `riptide/riptide-anvil` |
| `GRAPH_QUERY_URL` / `SUBGRAPH_URL` | `http://localhost:8000/subgraphs/name/riptide/riptide-anvil` |

After deploy, `SUBGRAPH_URL` is also written to:

- `services/solver-api/.env`
- `services/resolver-bot/.env`
- `deployments/31337.json` → `subgraphUrl`

## Matchstick tests

```bash
cd subgraph && pnpm run test   # requires Docker
```

## Consumers

- `packages/solver-core` — `SubgraphDiscoveryProvider`
- `services/solver-api` — `/readyz` subgraph health when `SUBGRAPH_URL` set
- `services/resolver-bot` — active-strategy filter from subgraph

See also [ENV.md](../ENV.md).
