# RIPTIDE Test Guide

How to run RIPTIDE locally and exercise every feature it ships. Written so a reviewer can go from a clean clone to having personally seen both mechanisms settle on-chain.

Everything below runs against a local Anvil chain — no testnet funds, no API keys. The one exception is the web UI, which targets Base Sepolia; that is called out in [§6](#6-the-web-ui).

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Foundry | `1.2.3-stable` | `forge --version` |
| Node.js | ≥ 20 | `node --version` |
| pnpm | 9.15.0 | `pnpm --version` |
| Python | ≥ 3.11 | `python3 --version` |

```bash
git clone --recurse-submodules https://github.com/SamFelix03/riptide.git
cd riptide
pnpm install
```

The 1inch sources are git submodules pinned to the releases actually deployed on mainnet — `1inch/swap-vm@v1.0.2` and `1inch/aqua@v1.0.0`. If you cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

---

## 2. Quick start

Three terminals.

```bash
# ── terminal 1 — the chain ────────────────────────────────────────────────
anvil --host 127.0.0.1 --chain-id 31337 --code-size-limit 100000 --port 8545
```

`--code-size-limit` is needed because stock Aqua **test** contracts exceed EIP-170. RIPTIDE's own routers fit the real 24,576-byte limit and are asserted to.

```bash
# ── terminal 2 — deploy + seed ────────────────────────────────────────────
pnpm demo:reset
```

That single command deploys Aqua, the full RIPTIDE stack, two demo ERC-20s and a mock Chainlink feed; seeds three strategies with different fee/auction policies; validates the manifest; skews the oracle so a rebalance auction is open; and funds the demo taker. It finishes with a summary of addresses and service URLs.

```bash
# ── terminal 3 — verify ───────────────────────────────────────────────────
cd contracts && forge test
```

At this point you have a live local deployment and a green test suite. Everything below is exercising it.

---

## 3. The contract test suite

```bash
cd contracts
forge test                                     # everything hermetic
forge test --match-path 'test/invariant/**' -vv # the five named invariants
forge test --match-contract Differential -vv    # vs the Python oracle
forge test --match-contract Fuzz -vv            # 10,000 runs each
```

Two suites need an RPC and are skipped otherwise:

```bash
# Proves RIPTIDE works against the REAL 1inch Aqua registry on Ethereum mainnet
RPC_URL_TARGET=https://ethereum.publicnode.com forge test --match-contract Provenance -vv

# Proves the auction args encoding has not drifted vs the live Base Sepolia router
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org forge test --match-contract AuctionScheduleByteParity -vv
```

**What to look for.** Every one of the five protocol invariants (V1–V5) ships a *negative control* — a deliberately broken variant that must make the test fail. A green suite therefore means the tests can actually fail, not merely that they are silent.

### The differential oracle

The expected values for all the maths come from an independent Python program that imports no Solidity artifact, ABI or SDK:

```bash
python3 -m unittest discover tools/reference -v
python3 -m tools.reference.generate_vectors --check          # must be byte-identical
python3 -m tools.reference.generate_payload_vectors --check
```

`--check` never writes; it exits non-zero if a committed vector differs from deterministic regeneration. Solidity and TypeScript both consume those same committed JSON files.

---

## 4. Exercising the mechanisms on Anvil

These run against the chain `demo:reset` set up. Run them from `contracts/`:

```bash
cd contracts
export RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337
FLAGS="--broadcast --rpc-url $RPC_URL --code-size-limit 100000 --legacy"
```

### 4.1 Mechanism 1 — a swap with a volatility-indexed fee

```bash
forge script script/batchExecute.s.sol $FLAGS
```

Routes a 1 WAD exact-in swap through `RiptideBatchExecutor`. The taker pays one amount, three makers each fill a slice, and the fee applied is whatever the controller currently reports — not a constant.

Inspect it:

```bash
FP=$(python3 -c "import json;print(json.load(open('../deployments/31337.json'))['feeProvider'])")
K=$(python3 -c "import json;print(json.load(open('../deployments/31337.json'))['seededStrategies'][0]['strategyKey'])")
cast call $FP "controllerState(bytes32)(uint24,int192)" $K --rpc-url $RPC_URL   # feeReported
cast call $FP "feeTarget(bytes32)(uint24)"              $K --rpc-url $RPC_URL   # where it is heading
```

Fee units are `1e7 = 100%`, so `30000` is 0.30%.

### 4.2 Mechanism 2 — auction the stale price, split the surplus

```bash
forge script script/rebalance.s.sol $FLAGS
```

Ships a rebalance order, opens the declining-price auction, and settles it from the resolver account. It prints `payToResolver`. The β split is exact: with `β = 0.95`, the resolver receives `⌊0.05·S⌋` and **at least** `0.95·S` stays with the maker.

Verify the conservation yourself from the emitted `RebalanceSettled` event — `payToResolver + retainToLP == surplusWad`, always.

To re-open an auction later, skew the feed again:

```bash
cd .. && node tools/demo/skew-oracle.mjs && cd contracts
```

### 4.3 The loop — a settled auction moves the next fee

A single observation cannot move σ off its floor: the EWMA needs a series. Run the volatility indexer for a few cycles while the price moves:

```bash
# terminal 4
export RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 POLL_INTERVAL_MS=12000
pnpm --filter @riptide/vol-indexer start
```

Then move the mock feed between polls and watch σ and `feeTarget` respond:

```bash
for P in 300000000000 180000000000 420000000000; do
  cast send $FEED "setRound(int256,uint256)" $P $(cast block latest --rpc-url $RPC_URL --field timestamp) \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url $RPC_URL
  sleep 14
done
```

σ rising pushes `feeTarget` up; the controller then steps `feeReported` toward it on the next swap or rebalance. That is the self-reinforcing loop.

### 4.4 Maker lifecycle — ship and dock

```bash
MAKER_INDEX=2 forge script script/ship.s.sol $FLAGS      # publish a strategy

# dock takes the strategyKEY despite the env var name
STRATEGY_HASH=$(python3 -c "import json;print(json.load(open('../deployments/31337.json'))['seededStrategies'][2]['strategyKey'])") \
  forge script script/dock.s.sol $FLAGS
```

After docking, that strategy can no longer execute — Aqua rejects it at `safeBalances`, which you can confirm by re-running the batch script and seeing the route exclude it.

### 4.5 Everything at once

```bash
forge script script/demo.s.sol --rpc-url http://127.0.0.1:8545 -vv
```

`demo.s.sol` deploys a fresh system, seeds it and runs a swap in a single deterministic script — useful as a self-contained reference of the whole flow.

---

## 5. Off-chain services

All four are optional — the protocol is complete without them — but they are what makes the system usable.

```bash
export RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337
export GOVERNED_INDEXER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

pnpm --filter @riptide/solver-api start     # :8081  quotes + routes
pnpm --filter @riptide/resolver-bot start   # :8082  settles profitable rebalances
pnpm --filter @riptide/vol-indexer start    # :8083  publishes price observations
pnpm liquidity-mcp:start                    # :8084  MCP tools over The Graph
```

Each exposes `/livez` and `/readyz`. Their integration tests run against the Anvil deployment:

```bash
export CI=true
pnpm --filter @riptide/solver-core test     # includes on-chain quote parity
pnpm --filter @riptide/resolver-core test
pnpm --filter @riptide/vol-indexer test     # EWMA, clamps, stale freeze, auth
```

`solver-api` and `resolver-bot` integration tests additionally need a local Graph Node (Docker):

```bash
pnpm subgraph:up && pnpm subgraph:deploy-local    # then re-run their tests
pnpm subgraph:down
```

Without it they fail on `ECONNREFUSED :8000`, which is expected — every read falls back to RPC `getLogs`, so the app itself works without The Graph.

---

## 6. The web UI

**The UI targets Base Sepolia, not Anvil.** `apps/web` resolves its chain from `packages/contracts/src/networks.ts`, which is pinned to 84532 — it does not read `CHAIN_ID`. So local Anvil is for contracts, scripts and services; the UI is reviewed against the live deployment.

Use the deployed app: **https://riptide-web-production-77f7.up.railway.app**

Or run the same code locally against the same live chain:

```bash
pnpm --filter @riptide/web dev     # http://localhost:3000
```

Connect a wallet on Base Sepolia, then mint demo tokens from the faucet in the Swap page's "Demo tools" section. The five surfaces map to the four personas:

| Page | What to try |
|---|---|
| `/make` | Configure a strategy, watch the fee-vs-σ curve and β split update, inspect the raw 226-byte payload and its hash parity, then ship |
| `/swap` | Quote exact-in and exact-out, see the applied fee **and the σ that produced it**, check the route split across makers, simulate, execute |
| `/resolve` | See open auctions with their live declining price, preview `S` and your `(1−β)` take, settle. **Settle from any wallet** — mint RQUOTE from the faucet there and the plan walks you through approve → settle; the rebate and the bought base both land in the wallet that sends it |
| `/positions` | Live Aqua reserves, controller telemetry, fill history, dock |
| `/analytics` | Recaptured vs paid, fee vs estimated LVR, the loop, atomic routes, **resolver standings** (per-wallet, from the settler's own event), honesty panel |

UI tests:

```bash
pnpm --filter @riptide/web test        # component tests (mocked API)
pnpm --filter @riptide/web test:e2e    # Playwright
```

### 6.1 Driving the whole app from a script

If you would rather see every persona exercised without clicking through it,
[`tools/demo/e2e-live.mjs`](../tools/demo/e2e-live.mjs) does exactly what the UI does — it
calls the same `/api/riptide` endpoints the browser calls — from two wallets it generates at
the start of the run:

```bash
APP=https://riptide-web-production-77f7.up.railway.app node tools/demo/e2e-live.mjs
```

It ships a strategy, swaps exact-in and exact-out, skews the demo feed, previews and settles
an auction, docks, then reads back the analytics — asserting each result against on-chain
state or the indexed data, and writing a transaction ledger to
[`E2E_RUN.md`](E2E_RUN.md). It needs `DEPLOYER_PRIVATE_KEY` (or `DEPLOYER_KEY_FILE`) for
about 0.01 ETH of gas to fund those wallets and for the one owner-only call, moving the mock
Chainlink feed. Everything else in the run is permissionless.

---

## 7. Verifying the 1inch integration specifically

If what you want to check is *"is this really built on Aqua and SwapVM"*, these four are the direct evidence:

```bash
cd contracts

# 1. It works against the REAL deployed Aqua registry on Ethereum mainnet.
RPC_URL_TARGET=https://ethereum.publicnode.com forge test --match-contract Provenance -vv

# 2. The Mechanism-1 program runs on a STOCK, unmodified AquaSwapVMRouter
#    and prices identically to RIPTIDE's own router, to the wei.
forge test --match-contract StockAquaRouterCompat -vv

# 3. Opcode indices are resolved from the real AquaOpcodes dispatch table
#    at runtime, not hardcoded and hoped for.
forge test --match-contract OpcodeIndexProbe -vv

# 4. All seven SwapVM core invariants hold.
forge test --match-contract SwapVMInvariants -vv
```

And to see the actual bytes:

```bash
forge test --match-contract MakerTraitsFreeze -vv   # order envelope + payload slice
```

The contract-by-contract walkthrough, including both program byte layouts, is in [`../contracts/README.md`](../contracts/README.md).

---

## 8. Full CI-equivalent sweep

What CI runs, in one block:

```bash
cd contracts && forge test && cd ..
pnpm -w build
pnpm contracts:codegen:check                                  # generated ABIs match artifacts
pnpm --filter @riptide/contracts validate-manifest deployments/31337.json
pnpm --filter @riptide/contracts validate-manifest deployments/84532.json
for p in riptide-math strategy-sdk solver-core resolver-core frontend-api contracts web; do
  pnpm --filter @riptide/$p test
done
python3 -m unittest discover tools/reference
python3 -m tools.reference.generate_vectors --check
node tools/audit/hardcoded-addresses.mjs                      # no hardcoded addresses
```

---

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| `EvmError: ContractSizeLimit` on deploy | Anvil started without `--code-size-limit 100000`. Stock Aqua test contracts need it. |
| `ChainNotSeededError` from a service | Run `pnpm demo:reset` first. |
| `SafeBalancesForTokenNotInActiveStrategy` | The rebuilt order hash does not match what was shipped. Usually a changed deadline or `auctionStart` — both are baked into the order bytes. (The resolver is *not*: the rebate follows the VM taker, so anyone can settle.) |
| `RiptideStrategyNotActive` on `previewRebalance` | Same cause: the strategy tuple you passed does not rebuild the shipped order — check `salt`, the reserves and the `feeProvider` address. |
| `RiptideNoSurplus` | Working as intended — the auction has no surplus yet. Skew the feed, or wait for the Dutch price to decay. |
| `ECONNREFUSED :8000` in service tests | No local Graph Node. Either `pnpm subgraph:up`, or ignore — RPC fallback covers the app. |
| `over rate limit` against Base Sepolia | The public RPC throttles the read-heavy route path. Retry, or set `RPC_URL` to a dedicated endpoint. |
| Stale addresses after redeploy | Everything reads `deployments/<chainId>.json`. Re-run `validate-manifest`, and `node tools/subgraph/sync-from-manifest.mjs` if using The Graph. |

### Demo accounts (Anvil)

Standard Foundry test keys — public, never used anywhere else.

| Role | Account |
|---|---|
| Deployer / oracle indexer | `#0` `0xf39Fd6e5…92266` |
| Makers S1 / S2 / S3 | `#1` / `#2` / `#3` |
| Taker | `#4` `0x15d34AAf…C6A65` |
| Resolver | `#5` `0x9965507D…0A4dc` |

---

## 10. Where to read next

| Doc | Owns |
|---|---|
| [`../contracts/README.md`](../contracts/README.md) | Every contract, both program byte layouts, access control, invariants |
| [`PROTOCOL.md`](PROTOCOL.md) | The product and protocol end to end |
| [`LVR_MATH.md`](LVR_MATH.md) | Every normative equation, unit and rounding rule |
| [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) | How the maths becomes SwapVM bytecode over Aqua |
| [`DIFF_ORACLE.md`](DIFF_ORACLE.md) | The Python oracle and the committed vectors |
| [`../subgraph/README.md`](../subgraph/README.md) | The indexer: every entity, the Graph features used, the two-identifier bridge and the settlement join |
| [`E2E_RUN.md`](E2E_RUN.md) | The transaction ledger from the most recent full run against the live app |
| [`../RESOLUTIONS.md`](../RESOLUTIONS.md) | What was decided at build time — authoritative where specs disagree |
