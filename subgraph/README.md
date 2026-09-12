# RIPTIDE Subgraph

What RIPTIDE indexes with The Graph, why it cannot work well without it, and how the pieces fit.

- Live endpoint: [`riptide` on Graph Studio](https://api.studio.thegraph.com/query/1758400/riptide/version/latest)
- Schema: [`schema.graphql`](schema.graphql) · Manifest: [`subgraph.yaml`](subgraph.yaml) · Mappings: [`src/mappings/`](src/mappings)
- Local setup: [`../docs/TEST_GUIDE.md` §5](../docs/TEST_GUIDE.md)

---

## 1. Why RIPTIDE needs an indexer at all

RIPTIDE is a **single-maker micro-pool** design. There is no shared pool contract holding everyone's liquidity — each maker ships their own strategy into Aqua, with their own curve, fee band and β. That is what makes the economics work, and it is also what creates the discovery problem:

> To quote a swap, you must first know **which strategies exist, which are still active, and what inventory each currently has.**

There is no on-chain registry to enumerate. Aqua is keyed by `strategyHash` and exposes balance getters only — you cannot ask it "list every strategy shipped to this app". And an EVM transaction cannot scan every maker within gas.

So the taker path is: **discover off-chain, verify on-chain.** The subgraph answers "what exists", the contracts re-derive every number that matters. A block-lag or a mapping bug can cause a stale route to revert; it can never authorise a bad fill. That boundary is deliberate and is why an untrusted indexer is safe to depend on.

The second thing it provides is the **proof surface**. RIPTIDE's whole claim is that LVR is being internalised. That claim is a time series — fees charged versus volatility, surplus recaptured versus surplus paid out — and a time series is exactly what an archival indexer gives you and an RPC node does not.

---

## 2. What is indexed

`specVersion 1.0.0`, mapping `apiVersion 0.0.9`, AssemblyScript. Six datasources, ten handlers.

| Datasource | Events → handlers |
|---|---|
| **Aqua** (1inch) | `Shipped` → `handleShipped` · `Docked` → `handleDocked` · `Pushed` → `handlePushed` · `Pulled` → `handlePulled` |
| **RiptideSwapVMRouter** | `StrategyRuntimeInitialized` · `SwapFilled` |
| **RiptideLvrFeeProvider** | `FeeControllerUpdated` |
| **RiptideBatchExecutor** | `RouteExecuted` |
| **RiptideRebalanceRouter** | `RebalanceSettled` |
| **RiptideAuctionSettler** | `AuctionSettled` |

Indexing 1inch's own Aqua contract alongside RIPTIDE's is the point: strategy **lifecycle** (shipped / docked) and **inventory** (pushed / pulled) are Aqua's events, not ours. All four Aqua handlers filter on the app address so only strategies shipped to the RIPTIDE router are indexed ([`src/mappings/aqua.ts`](src/mappings/aqua.ts)).

### Entities

Thirteen entities, split by whether they are a running total or a historical record.

| Entity | Kind | Holds |
|---|---|---|
| `Protocol` | mutable | Singleton: chain id, every contract address, cumulative fill volume, **cumulative β-recaptured**, fill/rebalance counts |
| `Market` | mutable | Ordered base/quote pair, fill volume, recapture volume |
| `Maker` | mutable | Per-maker volume and recapture |
| `Strategy` | mutable | Reserves, live Aqua balances, docked flag, version, and **`orderBytes`** |
| `StrategyKeyIndex` | mutable | Secondary index — see §4 |
| `Token` | mutable | Symbol, decimals |
| `Fill` | **immutable** | One swap: amounts, `feeBpsApplied`, the σ that produced it, post-trade reserves, version |
| `Rebalance` | mutable | One settlement: `executedIn`, `staleIn`, `surplus`, `retainToLP`, `payToResolver`, revealed price, plus both `resolver` (VM taker) and `settledBy` (the wallet) — see §4 |
| `ControllerState` | **immutable** | One controller step: σ, `feeTarget`, `feeReported` |
| `Route` | **immutable** | One atomic multi-fill batch: payer, kind, totals, limit, fill count |
| `MarketSnapshot` | mutable | Hourly buckets of volume and recapture |
| `Resolver` | mutable | Per-wallet settlement attribution: count, earned `(1−β)·S`, LP retention it produced, quote paid, base bought |
| `RebalanceTxIndex` | mutable | Internal join, `txHash-strategyKey` → rebalance id — see §4 |

The immutable/mutable split is not cosmetic. `@entity(immutable: true)` lets Graph Node skip write-ahead bookkeeping for entities that are only ever appended — and every historical record here (fills, controller steps, routes) genuinely is append-only. Aggregates that must be read-modify-written stay mutable. `Rebalance` is the one history row that is not immutable: a second event in the same transaction corrects its attribution, which is the subject of §4.

---

## 3. Graph features actually used

| Feature | Where, and why |
|---|---|
| **Multi-datasource indexing** | Six contracts in one subgraph, including 1inch's Aqua. Cross-contract joins (a `Fill` on our router resolving to a `Strategy` created by an Aqua `Shipped`) are the whole reason this is one subgraph and not five. |
| **`@entity(immutable: true)`** | `Fill`, `Rebalance`, `ControllerState`, `Route` — append-only history, cheaper to index. |
| **`@derivedFrom`** | Reverse lookups without maintaining arrays by hand: `Market.strategies`, `Maker.strategies`, `Strategy.fills` / `.rebalances` / `.controllerStates`, `Route.fills`. |
| **`_meta { block }`** | Freshness. Every UI view that reads indexed data shows the indexed block and labels itself stale if it lags — [§5](#5-freshness-is-a-first-class-value). |
| **`where` filtering** | `strategies(where: { docked: false, market: $market })` — active-strategy discovery in one query. |
| **`orderBy` / `orderDirection` / `first` / `skip`** | Recent-history feeds, and cursor-free pagination for the recapture sums ([`client.ts:249-283`](../packages/solver-core/src/subgraph/client.ts#L249-L283) pages at 1000 rows). |
| **`Bytes` for raw calldata** | `Strategy.orderBytes` stores the full `abi.encode(ISwapVM.Order)` — see §4. |
| **Matchstick unit tests** | [`tests/`](tests) — creation and replay-idempotency per datasource, a negative case (a `FeeControllerUpdated` with no index must create nothing), and the two-event settlement join in [`settler.test.ts`](tests/settler.test.ts). |
| **Graph Studio** | Versioned deploys labelled `v0.0.1-<deploy block>`, with `version/latest` consumed by the app. |

---

## 4. Three design details worth understanding

### `Strategy.orderBytes` — the field that makes maker-shipped strategies tradeable

A strategy's fee policy, auction policy and salt live **only** in the 226-byte RIPTIDE payload inside the Aqua order. Aqua exposes balance getters and nothing else; neither router stores the policy. So given just `maker + strategyHash` the policy is unrecoverable — and without the policy the Quoter cannot rebuild the SwapVM order, so the strategy cannot be priced.

The one place those bytes are ever visible is Aqua's `Shipped` event, which carries the whole encoded order. So the mapping keeps them:

```ts
// src/mappings/aqua.ts — handleShipped
strategy.orderBytes = event.params.strategy;
```

The solver decodes them off-chain ([`packages/solver-core/src/orderPayload.ts`](../packages/solver-core/src/orderPayload.ts)) and rebuilds a fully priceable strategy. Without this field, only the three strategies hardcoded in the deployment manifest are routable and **anything a real maker ships through the UI is invisible to takers**. This is the clearest example of The Graph doing something in RIPTIDE that no RPC call can.

### `StrategyKeyIndex` — bridging two identifiers

RIPTIDE has two identifiers that are deliberately not interchangeable:

```
strategyHash = keccak256(abi.encode(order))       Aqua's commitment
strategyKey  = keccak256(abi.encode(maker, salt)) the router's runtime key
```

Aqua events carry the **hash**; router and fee-provider events carry the **key**. `Strategy` is stored by hash, so `StrategyKeyIndex` is a manual secondary index mapping key → strategy id, letting `handleSwapFilled`, `handleFeeControllerUpdated` and `handleRebalanceSettled` attribute their rows to the right strategy. The fee-provider handler deliberately **returns early** when the index is missing rather than inventing a dangling row.

### `AuctionSettled` — recovering who actually settled

The router logs `RebalanceSettled` from inside the swap, and the `resolver` it names is the
VM taker. On the permissionless path — `RiptideAuctionSettler`, which is what the UI uses —
that taker is the settler *contract*, because the settler is what fronts the quote, runs the
order and sweeps both legs back to its caller. Taken at face value, every settlement in the
protocol's history would be attributed to one address.

So the settler emits its own receipt, [`AuctionSettled`](../contracts/src/interfaces/IRiptideEvents.sol),
naming `msg.sender` along with what that wallet paid and received. Both events land in the
same transaction, router first, settler second, and Graph Node delivers them in log order —
so by the time [`settler.ts`](src/mappings/settler.ts) runs, the `Rebalance` row already
exists. It is found through `RebalanceTxIndex`, a one-field join keyed by
`txHash-strategyKey` that `handleRebalanceSettled` writes as it creates the row. The handler
then rewrites `Rebalance.settledBy` and rolls the amounts into a per-wallet `Resolver`
aggregate, which is what the resolver standings table on `/analytics` reads.

Two consequences worth being explicit about. `Rebalance` cannot be `immutable`, because a
later event in the same transaction corrects it. And `resolver` is kept alongside
`settledBy` rather than overwritten — they are genuinely different facts, and a settlement
sent straight to the router (no settler in the path) has them equal.

---

## 5. Freshness is a first-class value

`getFreshness` ([`packages/frontend-api/src/live/index.ts`](../packages/frontend-api/src/live/index.ts)) compares the subgraph's `_meta.block` against the chain head and returns `laggingSeconds`. Every quote carries it, and the UI renders a badge that flips to "stale" past a threshold.

This exists because a router built on a stale snapshot can quote liquidity that has already moved. The honest behaviour is to tell the user the snapshot's age rather than silently claim best execution — so freshness is returned alongside the numbers it qualifies, not hidden.

---

## 6. Where the data is consumed

| Consumer | Uses it for |
|---|---|
| [`solver-core/src/subgraph/discovery.ts`](../packages/solver-core/src/subgraph/discovery.ts) | Active-strategy discovery, then decodes `orderBytes` and prices each candidate through the on-chain Quoter |
| [`solver-core/src/subgraph/client.ts`](../packages/solver-core/src/subgraph/client.ts) | All 11 typed queries |
| [`frontend-api/src/live/index.ts`](../packages/frontend-api/src/live/index.ts) | `getRecaptureStats`, `streamEvents`, `listRoutes`, `getControllerState`, `getFreshness`, per-strategy cumulative recapture |
| [`services/solver-api`](../services/solver-api) | Discovery behind `POST /v1/quote` and `/v1/route`; subgraph reachability in `/readyz` |
| [`services/resolver-bot`](../services/resolver-bot) | Active-strategy pre-filter before scanning for mispricing |
| [`services/liquidity-mcp`](../services/liquidity-mcp) | `get_riptide_recapture_stats`, and comparison against a standardised Uniswap V3 subgraph |

### The RPC fallback

If `subgraphUrl` is empty, every read falls back to `getLogs` from the deploy block ([`packages/solver-core/src/rpcEvents.ts`](../packages/solver-core/src/rpcEvents.ts)). The app still works — quotes, swaps, auctions and analytics all function.

What is lost is instructive: no `orderBytes`, so **maker-shipped strategies stop being routable**; no `_meta`, so freshness degrades to "unknown"; no server-side aggregation, so recapture totals are recomputed by scanning logs on every request; and no efficient history, so feeds get slower as the chain grows. The fallback is a correctness guarantee, not a substitute.

---

## 7. Running it

### Local Graph Node (for Anvil)

Needs Docker Desktop, plus Anvil bound to `0.0.0.0` so the container can reach it:

```bash
anvil --host 0.0.0.0 --chain-id 31337 --code-size-limit 100000 --port 8545
pnpm demo:reset          # deploy + seed first
```

Then, from the repo root:

```bash
pnpm subgraph:up            # postgres + ipfs + graph-node
pnpm subgraph:deploy-local  # codegen, build, deploy, patch SUBGRAPH_URL into .env files
pnpm subgraph:down          # stop the stack
```

Query URL, set automatically after deploy:

```
http://localhost:8000/subgraphs/name/riptide/riptide-anvil
```

Smoke-test it:

```bash
curl -X POST http://localhost:8000/subgraphs/name/riptide/riptide-anvil \
  -H "content-type: application/json" \
  -d '{"query":"{ _meta { block { number } } strategies { id strategyKey docked } }"}'
```

`deploy-local` also writes `SUBGRAPH_URL` into `services/solver-api/.env`, `services/resolver-bot/.env`, and `deployments/31337.json`.

### Graph Studio (public networks)

Needs `GRAPH_DEPLOY_KEY` and `GRAPH_STUDIO_SLUG` in `subgraph/.env`, and a [supported network](https://thegraph.com/docs/en/supported-networks/).

```bash
CHAIN_ID=84532 node tools/subgraph/sync-from-manifest.mjs
CHAIN_ID=84532 GRAPH_VERSION_LABEL=v0.0.5 node tools/subgraph/deploy-studio.mjs
```

`subgraph.yaml` and `src/helpers.ts` are committed in their **Anvil** form. `sync-from-manifest.mjs` patches network, start block and addresses from `deployments/<chainId>.json` at deploy time and restores the Anvil sources afterwards, so matchstick tests stay stable. Deploying to Studio without running the sync first would index the wrong chain.

### Unit tests

```bash
cd subgraph && pnpm run codegen && pnpm run test    # matchstick, needs Docker
```

### Environment

From `subgraph/.env` (copy `.env.example`):

| Variable | Local default |
|---|---|
| `GRAPH_NODE_URL` | `http://localhost:8020` |
| `GRAPH_IPFS_URL` | `http://localhost:5001` |
| `GRAPH_SUBGRAPH_NAME` | `riptide/riptide-anvil` |
| `GRAPH_QUERY_URL` / `SUBGRAPH_URL` | `http://localhost:8000/subgraphs/name/riptide/riptide-anvil` |
| `GRAPH_DEPLOY_KEY` / `GRAPH_STUDIO_SLUG` | *(Studio only)* |