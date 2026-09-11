# Secrets and operator overrides

Copy templates: `node scripts/copy-env.mjs`

Contract addresses, public RPC, explorer URL, Chainlink feed, and subgraph URL
come from **`deployments/<chainId>.json`** (see `packages/contracts`). Public
network defaults (Base Sepolia RPC/explorer, service ports) live in
`packages/contracts/src/networks.ts`.

Env is only for **secrets** and **operator overrides**.

The web app is pinned to Base Sepolia (`84532`). It does not read Anvil.

## Anvil demo keys (local scripts only)

| Role | Address | Private key |
|------|---------|-------------|
| Deployer / volIndexer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Maker S1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Maker S2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| Maker S3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| Resolver / taker | `0x15d34AAf5426771fec7fd7761b077058557d4a4f` | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |

These are Foundry Anvil well-known keys. Code already falls back to them for
`pnpm demo:reset`. Do not put them in `.env` files.

## Secrets (USER-FILL)

| Variable | Where | Purpose |
|----------|-------|---------|
| `DEPLOYER_PRIVATE_KEY` | contracts, shell | Deploy/seed on testnet. Anvil scripts fall back to Anvil #0. |
| `GOVERNED_INDEXER_KEY` | vol-indexer | Oracle observer. On testnet this **must** be the deployer key. |
| `RESOLVER_PRIVATE_KEY` | resolver-bot | Resolver signer on testnet. Anvil falls back to Anvil #4. |
| `ETHERSCAN_API_KEY` | contracts | Explorer verification. |
| `GRAPH_DEPLOY_KEY` | subgraph | Graph Studio deploy. |
| `GRAPH_STUDIO_SLUG` | subgraph | Studio subgraph slug. |
| `GRAPH_API_KEY` | liquidity-mcp | The Graph gateway (Uniswap V3 comparison). |

## Optional overrides

| Variable | Default source | When to set |
|----------|----------------|-------------|
| `CHAIN_ID` | `networks.ts` → `84532` | `31337` for Anvil **services/scripts** only. Ignored by the web app. |
| `RPC_URL` / `RPC_URL_FALLBACK` | manifest `rpcUrl`, else public RPC | Private RPC. |
| `RPC_URL_TARGET` | provenance fork tests | Mainnet fork for official Aqua provenance. |
| `SUBGRAPH_URL` | manifest `subgraphUrl` | Only if you need to override the manifest. |
| `SOLVER_API_URL` | `http://127.0.0.1:8081` | Remote solver. |
| `PORT` / `HEALTH_PORT` | 8081–8084 in `networks.ts` | Collision. |
| `POLL_INTERVAL_MS`, `MAX_SHORTLIST`, `MIN_PROFIT_WAD`, `PRICE_GAP_BPS` | `SERVICE_DEFAULTS` | Tuning. |
| `PRICE_SOURCE_URL` | Chainlink via RPC | HTTP JSON price for vol-indexer. |
| `DEX_SUBGRAPH_ID` / `DEX_POOL_ID` | liquidity-mcp code defaults | Uniswap V3 comparison. |
| `CI` | unset | `true` in CI to run live integration tests. |
| `NEXT_PUBLIC_PROJECT_ID` | apps/web | Reown AppKit project id from dashboard.reown.com. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is also accepted. |

## Base Sepolia

```bash
export CHAIN_ID=84532
export RPC_URL=https://sepolia.base.org   # optional; manifest already has this
export DEPLOYER_PRIVATE_KEY=0x…           # never commit
pnpm deploy:testnet
```

The frontend loads `deployments/84532.json` via `/api/config` and generated ABIs
from `@riptide/contracts`. Connect via Reown AppKit on Base Sepolia.

## Post-deploy manifest fields

| Field | Source | Used as |
|-------|--------|---------|
| Contract addresses | `forge script deploy.s.sol` | `loadManifest` / `/api/config` |
| `chainlinkFeed` | `seed.s.sol` / testnet deploy | Feed resolution |
| `rpcUrl` / `explorerUrl` | deploy script | Public RPC / explorer |
| `subgraphUrl` | Studio or local Graph Node | Quotes/analytics; empty → RPC `getLogs` |
