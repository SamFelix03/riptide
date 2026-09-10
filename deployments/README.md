# Deployment manifests

Each `deployments/<chainId>.json` file is the single source of truth for contract
addresses on a given network. All consumers (web app, SDK, solver, resolver, scripts,
subgraph) read from this manifest — no hardcoded addresses elsewhere in runtime code.

## Network profiles

| Profile | File | Chain | Status |
| --- | --- | --- | --- |
| Integration (Anvil) | [`profiles/integration-anvil.json`](profiles/integration-anvil.json) | 31337 | Active — local demo |
| Public testnet (Base Sepolia) | [`profiles/integration-base-sepolia.json`](profiles/integration-base-sepolia.json) | 84532 | Active — same call semantics as Anvil |

## Local Anvil

1. Start Anvil: `anvil --host 0.0.0.0 --chain-id 31337 --code-size-limit 100000`
2. Reset demo: `pnpm demo:reset` (deploy + seed + sync subgraph + deploy subgraph)
3. Validate: `pnpm --filter @riptide/contracts validate-manifest deployments/31337.json`
4. Audit addresses: `pnpm audit:addresses`

`--code-size-limit 100000` is required for stock Aqua test contracts that still exceed EIP-170.
The RIPTIDE routers themselves fit the 24,576-byte limit and do not need it on public chains.

## Base Sepolia

Routers fit EIP-170, so public RPC enforces the real 24,576-byte cap. External function
selectors and opcode indices match Anvil. Seeded S1–S3 pools are an **Anvil script**
concern (`pnpm demo:reset`); `pnpm deploy:testnet` deploys contracts + demo tokens + the
mock feed only. The frontend connects wallets through Reown AppKit on Base Sepolia.

```bash
export DEPLOYER_PRIVATE_KEY=0x…   # never commit
pnpm deploy:testnet
pnpm --filter @riptide/contracts validate-manifest deployments/84532.json
```

The web app always loads `deployments/84532.json`. Services default to Base Sepolia
unless `CHAIN_ID=31337` (Anvil scripts/tests). `GOVERNED_INDEXER_KEY` must be the
deployer key (oracle `volIndexer`).

If `GRAPH_DEPLOY_KEY` and `GRAPH_STUDIO_SLUG` are unset, quotes, swaps, auctions,
and analytics use RPC `getLogs` from `manifest.blockNumber` — no subgraph required.

Subgraph address sync: `node tools/subgraph/sync-from-manifest.mjs`. Studio deploys
patch yaml/helpers, then restore the Anvil sources so matchstick tests are unchanged.

## Schema (`deployments/<chainId>.json`)

```json
{
  "chainId": 31337,
  "name": "anvil",
  "blockNumber": 0,
  "commit": "git-sha",
  "aqua": "0x…",
  "swapRouter": "0x…",
  "rebalanceRouter": "0x…",
  "kernel": "0x…",
  "oracle": "0x…",
  "feeProvider": "0x…",
  "settler": "0x…",
  "quoter": "0x…",
  "lens": "0x…",
  "batchExecutor": "0x…",
  "demoTokens": {
    "base": "0x…",
    "quote": "0x…"
  },
  "seededStrategies": [
    {
      "id": "S1",
      "maker": "0x…",
      "salt": "0x…0000000000000000000000000000000000000000000000000000000000000001",
      "strategyKey": "0x…",
      "orderHash": "0x…"
    }
  ],
  "subgraphUrl": "",
  "rpcUrl": "http://127.0.0.1:8545",
  "explorerUrl": ""
}
```

Populated by `forge script deploy.s.sol` (testnet) or `pnpm demo:reset` (Anvil deploy + seed).
