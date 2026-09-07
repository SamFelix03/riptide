# RIPTIDE System Map

Status: normative implementation map. Lists every required brick and its boundary;
it does not claim those bricks are implemented yet.
Equations and rounding remain normative in [`LVR_MATH.md`](LVR_MATH.md); contract
APIs in [`CONTRACTS.md`](CONTRACTS.md); wire format in
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md); economics in
[`PROTOCOL.md`](PROTOCOL.md); the UI in [`UI.md`](UI.md).

## 1. Product Boundary

RIPTIDE is an LVR-internalizing market-making engine on 1inch Aqua + SwapVM. A maker/LP
publishes one immutable strategy that is a **single-maker CPMM micro-pool** plus two
policies:

- a **volatility-indexed fee** (Mechanism 1) that rises with realized σ, charged through
  the existing `FeeProtocol` (0x80) via a `RiptideLvrFeeProvider`
  ([`SOURCES.md`](SOURCES.md) §1) — **no new fee opcode**;
- a **resolver rebalancing auction** (Mechanism 2) with Diamond β-retention: a Dutch
  schedule + anti-sandwich `Decay`, settled by **one** custom instruction that measures
  surplus `S`, rebates `(1−β)S` to the resolver via Aqua `pull`, and retains `≥βS` for
  the LP;
- a **self-reinforcing loop**: the auction's revealed price re-calibrates the fee
  controller ([`LVR_MATH.md`](LVR_MATH.md) §6).

A taker submits one exact-in/exact-out order; an off-chain solver splits it across
strategies; one on-chain transaction recomputes every fill and settles atomically. A
resolver settles rebalances through a periphery entrypoint. An analyst reads recapture
telemetry from the subgraph.

The MVP deliberately has: one CPMM curve family (not maker-provided code); one Chainlink
oracle per strategy for staleness only; **no** protocol custody vault; **no** LP shares;
**no** upgradeable proxy or privileged price/parameter administrator; **no** in-place
strategy editing; and it is **not** FM-AMM, a hedged vault, or a derivatives venue
([`PROTOCOL.md`](PROTOCOL.md) §18, [`FEATURES.md`](FEATURES.md) §14).

## 2. System Map

```text
 MAKER / LP PATH
 Maker wallet
   | configure CPMM + fee policy + auction policy
   v
 Web app -> RiptideStrategyCodec (TS mirror) -> SwapVM strategy bytes
   | approve Aqua + Aqua.ship(router, strategy, [base,quote], amounts)
   v
 Aqua virtual allocation + immutable strategyHash

 TAKER PATH
 Web app -> Solver API -> RIPTIDE Subgraph ------------+
              +-> RPC refresh + exact SDK quotes        |
              +-> route optimization + eth_call sim     |
                          v                             |
                signed taker tx -> RiptideBatchExecutor |
                          | selected fills              |
                          v                             |
                RiptideSwapVMRouter                     |
                  | FeeProtocol(provider) + CPMM        |
                  v                                     |
                SwapVM -> Aqua pull/push -> wallets      |
                          +-> SwapFilled/RouteExecuted --+

 RESOLVER PATH
 Resolver bot -> RIPTIDE Subgraph (open auctions)
   | previewRebalance (surplus S, (1-b)S take)
   v
 RiptideAuctionSettler -> RiptideSwapVMRouter (custom instr)
   | DutchAuction + Decay + surplus check + b-split
   v
 Aqua pull(maker,..,to=resolver)  ->  RebalanceSettled
   |
   +-> revealed price -> RiptideVolatilityOracle.observe -> next feeTarget  (LOOP)

 DATA & TOOLING
 Aqua + router + settler events -> The Graph Subgraph
                                     |-> Web history / Recapture dashboard
                                     |-> Solver + Resolver discovery
                                     +-> Executable-Liquidity MCP
```

## 3. Sources of Truth

| Concern | Authoritative source | Consequence |
| --- | --- | --- |
| Actual tokens | Maker/taker/resolver ERC-20 balances | A transfer failure reverts the route. |
| Maker allocation | Aqua virtual balances | Aqua is the only allocation/transfer layer; no vault. |
| Immutable policy | Aqua `strategyHash = keccak256(abi.encode(order))` | Execution rehashes exact strategy bytes. |
| Fee **rate** | `RiptideVolatilityOracle` σ + committed `FeePolicy` → `FeeController` | Deterministic in-block; provider returns committed `feeReported`. |
| Logical runtime | Router `ControllerState` keyed by `strategyHash` | PI + vol state; advances only when `!isStaticContext`. |
| Rebalance surplus/payout | On-chain `RiptideRebalanceKernel` math | Off-chain auction is advisory; math decides the split. |
| Active/docked lifecycle | Aqua strategy state | A docked strategy cannot execute even if runtime is stale. |
| Micro-pool universe | RIPTIDE Subgraph | One indexed query, not one RPC read per maker. |
| Candidate route / bid | Untrusted solver / resolver | Contracts recompute; no signature grants correctness. |
| User protection | On-chain deadline + aggregate limit + `RiptideNoSurplus` | A stale/degraded/loss-making action reverts atomically. |

## 4. Canonical Identifiers

- `marketId` — domain-separated hash of ordered `(base, quote)`; price is quote per one
  base; decimals normalized at SDK/math boundaries ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §2).
- `strategyKey` — router runtime key `keccak256(maker, strategyHash)`.
- `policyHash = keccak256(riptidePayload)` (SDK/audit identity) vs
  `strategyHash = keccak256(abi.encode(order))` (Aqua commitment + runtime key) — never
  interchangeable ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §1).
- Exact type hashes and payload offsets frozen as a deterministic vector
  ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §7, §11) **[confirm at build]**.

## 5. On-chain Bricks

Logical modules; gas review may inline libraries into the router but responsibilities and
tests stay separate. Full APIs/events/errors/invariants are in
[`CONTRACTS.md`](CONTRACTS.md); this is the boundary summary.

| Brick | Responsibility | Dependency |
| --- | --- | --- |
| `RiptideTypes` / `RiptideErrors` / `IRiptideEvents` | Shared structs, named errors, subgraph events | none |
| `WadMulDiv` / `LnExpMath` | 512-bit mulDiv/WAD; checked ln/exp/pow/sqrt | in-repo 512-bit product / Solady (pinned) |
| `VolatilityMath` / `LvrMath` / `FeeController` / `DiamondSplit` | EWMA+GK σ; `σ²/8` LVR; clamped PI; β-split | none |
| `RiptideStrategyCodec` | Encode/decode/validate payload; `marketId`/`strategyKey` | SwapVM program format |
| `RiptideVolatilityOracle` | Realized-σ estimator; no-mutation in static ctx; stale freeze | Chainlink (staleness pattern) |
| `RiptideLvrFeeProvider` | `IProtocolFeeProvider` — returns committed dynamic fee | 1inch `FeeProtocol` |
| `RiptideRebalanceKernel` | Stateless surplus/baseline/β math + auction math | none (below EIP-170) |
| `RiptideRebalanceInstruction` | The one custom SwapVM opcode — surplus + rebate + oracle write | 1inch SwapVM |
| `RiptideSwapVMRouter` | Aqua app + SwapVM router; `_runOpcode` override dispatches the custom opcode | 1inch SwapVM + Aqua |
| `RiptideAuctionSettler` | Resolver settlement entrypoint; deadline-first (no permission gate) | router |
| `RiptideQuoter` / `RiptideLens` | Exact static quotes / live-state snapshots | Aqua + router |
| `RiptideBatchExecutor` | Atomic multi-strategy taker route | router + Aqua |
| `RiptideDemoToken` | Standard ERC-20 + faucet (demo only) | none |

**EIP-170:** the router overrides `_runOpcode(ctx, opcode, args)` to dispatch RIPTIDE's
custom opcode, falling back to `super._runOpcode` for the stock AquaOpcodes set
([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §3.1); if the deployed bytecode exceeds
24 KB, split into `RiptideSwapVMRouter` (swaps) + `RiptideRebalanceRouter` (rebalances)
sharing Aqua app authority **[confirm at build]**.

## 6. 1inch Integration (load-bearing)

- **Aqua** — `ship`/`safeBalances`/`pull`/`push`/`dock`
  ([`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol)); maker inventory never leaves
  the custody model into a RIPTIDE vault; the β rebate is a `pull` to the resolver
  ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §8). Web uses the official Aqua SDK
  for ship/dock once the version is pinned.
- **SwapVM** — RIPTIDE is a native SwapVM program: the dynamic fee is a `FeeProtocol`
  provider (Mechanism 1), the rebalance composes `DutchAuction`/`Decay`/CPMM +
  `OraclePriceAdjuster` + one custom instruction (Mechanism 2). Instruction ordering is
  a security boundary; the seven core invariants are preserved and tested
  ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §9).

Authoritative upstream is the **official published packages** — `@1inch/swap-vm` and
`@1inch/aqua` (latest published versions, sourced from `github.com/1inch/swap-vm` and
`github.com/1inch/aqua`) plus the Aqua TS SDK — consumed through the package manager,
never a moving branch. The copies under [`refs/`](../../refs) are a **read-only
reference mirror**, not a build input. Exact published versions/licenses are pinned
before implementation ([`SOURCES.md`](SOURCES.md) §6).

## 7. TypeScript Bricks

| Package | Responsibility |
| --- | --- |
| `packages/riptide-math` | Dependency-free mirror of CPMM, LVR `σ²/8`, EWMA/GK σ, PI controller, β-split; shares committed vectors with Solidity ([`DIFF_ORACLE.md`](DIFF_ORACLE.md)). |
| `packages/strategy-sdk` | Typed payload builders/decoders, decimal normalization, `policyHash`/`strategyHash`, Aqua ship/dock builders, Quoter/Lens clients, event decoding. |
| `packages/contracts` | Generated ABIs/typed clients/manifest schema; no secrets. |
| `packages/solver-core` | Pure taker route optimizer (bounded separable allocation; exact rounding; route certificate with expected versions). |
| `packages/resolver-core` | Pure rebalance evaluator: given open auctions, computes `S`, `(1−β)S` take, and best-time-to-settle; no I/O. |
| `packages/frontend-api` | Framework-neutral UI gateway + deterministic mock ([`UI.md`](UI.md) §9); only the web composition root picks mock vs live. |

## 8. Services

- `services/solver-api` — stateless taker orchestration: query subgraph at block `B`,
  reproduce quotes, solve globally, refresh a bounded shortlist via RPC, `eth_call`
  against `RiptideBatchExecutor`, return calldata + freshness. Endpoints `POST /v1/quote`,
  `POST /v1/route`, `/livez` `/readyz` `/metrics`. Replaceable and untrusted.
- `services/resolver-bot` — watches open auctions, evaluates via `resolver-core`,
  submits to `RiptideAuctionSettler` when profitable. Advisory only; the on-chain
  `RiptideNoSurplus` guard is the real protection ([`PROTOCOL.md`](PROTOCOL.md) §10).
- `services/vol-indexer` — feeds price observations to `RiptideVolatilityOracle.observe*`
  under a governed key; the on-chain clamp/stale-freeze bounds any bad input
  ([`CONTRACTS.md`](CONTRACTS.md) §7).
- `services/liquidity-mcp` — reusable The Graph artifact exposing curve-aware executable
  liquidity + recapture tools, composed with a standardized DEX subgraph.

## 9. The Graph Brick

`subgraph/` indexes Aqua `Shipped/Docked/Pushed/Pulled` (filtered to the router app),
router `SwapFilled`/`FeeControllerUpdated`, and settler `RebalanceSettled`/`RouteExecuted`
([`CONTRACTS.md`](CONTRACTS.md) §4). Core entities:

| Entity | Purpose |
| --- | --- |
| `Protocol` | Deployment metadata + aggregate counters (incl. cumulative β-recaptured). |
| `Market` | Ordered base/quote + token metadata. |
| `Maker` | Published strategies + executed volume + recapture. |
| `Strategy` | Maker, strategyHash, decoded policy, lifecycle, last version. |
| `ControllerState` | σ series, `feeTarget`/`feeReported`, PI integral. |
| `Fill` | Per-swap deltas, `feeBpsApplied`, σ, pre/post version. |
| `Rebalance` | `executedIn`, `staleIn`, `surplus`, `retainToLP`, `payToResolver`, resolver, revealed price. |
| `Route` | Aggregate taker execution + ordered fills. |
| `Token` / `MarketSnapshot` | Metadata / time-bucketed volume + recapture ratio. |

The solver/resolver treat subgraph results as **candidate discovery only** — a block-lag
or mapping bug can cause a stale route to revert but cannot authorize a bad fill or a
loss-making rebalance. The query records the indexed block via `_meta`; lag beyond
threshold surfaces as a stale/degraded label ([`UI.md`](UI.md) §8). A second
standardized-DEX subgraph powers the MCP comparison only.

Authoritative references: The Graph subgraph development, standardized subgraphs, Subgraph
MCP, and the ETHGlobal The Graph prize page.

## 10. Web Application Bricks

The full page/component inventory and per-persona user stories are normative in
[`UI.md`](UI.md). Architecture-level summary of the seven pages:

- **Landing** (`/`) — mechanism diagram + persona routing + live protocol stats.
- **Maker Studio** (`/make`) — CPMM/fee/auction/oracle config, fee-vs-σ preview, β
  recapture preview, hash-parity check, approve + `ship`.
- **Swap Terminal** (`/swap`) — dynamic-fee-transparent quotes, route split, freshness,
  `eth_call` sim; signs calldata only to `RiptideBatchExecutor`.
- **Resolver Console** (`/resolve`) — auction board, surplus/`(1−β)S` preview,
  anti-sandwich notice, settle via `RiptideAuctionSettler`.
- **Strategy Manager** (`/positions`) — live Aqua vs logical state, controller telemetry,
  per-strategy recapture, dock/republish (no in-place edit).
- **Recapture Dashboard** (`/analytics`) — recaptured-vs-paid, fee-vs-LVR, loop
  visualizer, event feed with indexed block + honesty panel.
- **Not-Found/Unsupported** (`/*`) — deterministic empty states.

RPC URLs and sponsor secrets never ship in the browser bundle; only the composition root
selects mock vs live via `frontend-api`.

## 11. End-to-End Flows

### 11.1 Publish a strategy
1. Maker enters CPMM reserves + fee/auction/oracle policy.
2. TS validates, encodes the payload, computes `policyHash`/`strategyHash`.
3. UI confirms the Solidity codec returns the same `strategyHash`.
4. Maker approves Aqua for base+quote.
5. Maker calls `Aqua.ship(router, strategy, [base,quote], amounts)`.
6. Aqua records virtual allocations and emits strategy bytes.
7. Subgraph creates `Market`/`Strategy`/initial `ControllerState`. No factory/admin.

### 11.2 Taker swap (Mechanism 1)
1. Taker requests an exact-in/out quote.
2. Solver queries indexed strategies at block `B`; `solver-core` splits globally; keeps a
   reserve shortlist.
3. Solver refreshes selected+reserve via Lens/Aqua/RPC; recomputes if stale/docked/exhausted.
4. Each fill carries maker, strategy bytes/hash, expected version, amount, limit.
5. `FeeProtocol` staticcalls `RiptideLvrFeeProvider` → committed dynamic fee; CPMM computes
   output; SwapVM checks registers; Aqua pull/push settle.
6. Executor requires aggregate slippage/deadline; emits `SwapFilled`/`RouteExecuted`.
7. Any failure reverts every transfer and runtime mutation.

### 11.3 Resolver rebalance (Mechanism 2)
1. Price drifts vs oracle; a rebalance auction opens (Dutch schedule).
2. Resolver previews `S = executedIn − staleIn` and `(1−β)S` via `resolver-core`.
3. Resolver calls `RiptideAuctionSettler.settleRebalance(...)`; the `Deadline(0x20)` guard is the program's first instruction (permissionless — no caller allow-list).
4. `DutchAuction` + `Decay` + CPMM compute amounts; `RiptideRebalanceInstruction` checks
   `S ≥ 0` (else `RiptideNoSurplus`), rebates `Down((1−β)S)` via Aqua `pull(...,to=resolver)`,
   retains `≥βS` for the maker.
5. Non-static path records the revealed price to `RiptideVolatilityOracle` and emits
   `RebalanceSettled`.

### 11.4 The loop
The revealed price from 11.3 updates σ, which moves the next `feeTarget` for 11.2
([`LVR_MATH.md`](LVR_MATH.md) §6). Visualized on the Recapture Dashboard.

### 11.5 Cancel or replace
Maker `dock`s; Aqua marks the strategy inactive (future reads/execution fail); subgraph
marks it docked. To change parameters, the maker ships a new salted strategy. Stale
runtime is harmless because Aqua lifecycle validation gates every execution.

## 12. Security Bricks

- **Numerical:** explicit bounds for σ, prices, β, reserves, ln/exp domains; exact
  branches; full-precision arithmetic with named rounding; no swap-time root search;
  differential tests vs the differential oracle ([`DIFF_ORACLE.md`](DIFF_ORACLE.md)).
- **Settlement:** official Aqua transfer path only; official SwapVM validation retained;
  authenticated callback; per-strategy + route reentrancy guards; one strategy per batch;
  expected versions, deadline, aggregate slippage; hard max-fills; standard-ERC-20 only;
  `RiptideNoSurplus` blocks loss-making rebalances; full rollback on any failure.
- **Trust minimization:** solver/resolver replaceable and untrusted; subgraph is not
  settlement truth; policy is hash-committed and immutable; no admin can change a
  curve/fee/β; the oracle affects only the *rate* within a committed band and cannot
  settle a different result; no backend signs for maker/taker/resolver; addresses and
  upstream commits published in manifests.

## 13. Verification Bricks

| Layer | Required verification |
| --- | --- |
| Math | Vectors for CPMM in/out, LVR `σ²/8` identity, EWMA/GK σ, PI clamp/anti-windup, β-split. |
| Differential | Solidity + TS vs the 120-digit Python model, bit-for-bit under declared rounding. |
| Fuzz/invariants | Monotonicity, quote/swap parity, conservation, fee band, `S≥0`, `payToResolver+retainToLP=S`. |
| SwapVM | Seven core invariants + custom-instruction static/execution parity. |
| Stateful invariants | V1 β-split conservation, V2 no-surplus, V3 fee determinism, V4 fee-band containment, V5 deadline-first revert — Foundry invariant/fuzz, each with a negative control ([`CONTRACTS.md`](CONTRACTS.md) §16). |
| Aqua | Fork tests using real `ship/pull/push/dock`, approvals, ERC-20 transfers, and the β rebate `pull`. |
| Runtime | First-fill init, version races, unsolicited Aqua credit, docked state, rollback after failed transfer. |
| Batch | Multi-maker route, slippage, deadline, duplicate strategy, max-fills, callback spoofing, atomic revert. |
| Economic (L2) | β-recapture / K2 recapture bound validated by **simulation**, stated as not on-chain-proved ([`SOURCES.md`](SOURCES.md) §3). |
| Subgraph | Event→entity mapping, payload decoding, reorg/idempotency, indexed/on-chain reconciliation. |
| Web | Maker publish, taker route/execute, resolver settle, dock/replace, wrong network, stale route E2E. |

## 14. Deployment & Operations

- **14.1 Dependency pinning gate.** The build depends on the **official published**
  `@1inch/swap-vm` and `@1inch/aqua` packages (+ Aqua SDK, OZ, Solady, The Graph
  tooling) — never a moving branch and never the `refs/` mirror. Record exact published
  versions + licenses in `DEPENDENCY_LOCK.md`; lock; preserve notices
  ([`SOURCES.md`](SOURCES.md) §6).
- **14.2 Network profiles.** Integration profile on a local fork of a network with an
  official Aqua deployment (official-contract + fallback demo); public demo profile on a
  Graph-supported chain. A deployment spike must prove Aqua/SwapVM/RPC/explorer/wallet/
  faucet/The Graph before the profile is fixed.
- **14.3 Deployment manifest.** `deployments/<chainId>.json` records chain, block, commit,
  Aqua address, router(s), settler, kernel, oracle, fee provider, quoter, lens, executor,
  demo tokens, subgraph URL, RPC/explorer/verification links. Web/SDK/solver/resolver/
  scripts/subgraph consume one validated schema.
- **14.4 Runtime ops.** Solver/resolver/MCP health endpoints; RPC fallback/timeouts;
  subgraph lag surfaced in UI; seeded wallets + repeatable demo-reset; deterministic tx
  links + local-fork fallback recording; no key/secret in Git.

## 15. Sponsor Mapping

| Sponsor | Actual brick | Why meaningful |
| --- | --- | --- |
| 1inch Aqua | Strategy publication, virtual allocation, maker-wallet settlement, β rebate `pull`, cancellation, lifecycle events | RIPTIDE cannot publish/settle/recapture without Aqua. |
| 1inch SwapVM | CPMM program, dynamic fee via `FeeProtocol` provider, custom rebalance instruction, DutchAuction/Decay/OraclePriceAdjuster reuse, invariants | Both mechanisms are native SwapVM, using the VM as intended — not a fork. |
| The Graph | Micro-pool + controller + rebalance state, solver/resolver discovery, market history, **recapture analytics** | One indexed dataset replaces one RPC read per maker and is the proof surface for LVR internalization. |
| The Graph MCP | Reusable curve-aware executable-liquidity + recapture tools composed with a standardized DEX source | Exposes a new liquidity model beyond the app UI. |

Other sponsor protocols are not architecture bricks for this MVP; adding them would weaken
the product ([`FEATURES.md`](FEATURES.md) §14).

## 16. Workspace Target

```text
contracts/
  src/types/        RiptideTypes, RiptideErrors, IRiptideEvents
  src/libraries/    WadMulDiv, LnExpMath, VolatilityMath, LvrMath,
                    FeeController, DiamondSplit
  src/oracle/       RiptideVolatilityOracle (+ interface)
  src/fees/         RiptideLvrFeeProvider
  src/core/         RiptideStrategyCodec, RiptideRebalanceKernel,
                    RiptideRebalanceInstruction, RiptideSwapVMRouter
  src/periphery/    RiptideAuctionSettler, RiptideQuoter, RiptideLens, RiptideBatchExecutor
  src/demo/         RiptideDemoToken
  script/           deploy, seed, ship, dock, rebalance, demo
  test/             unit, fuzz, invariant, integration, fork
packages/
  riptide-math/     exact TS math mirror
  strategy-sdk/     payload + Aqua lifecycle SDK
  contracts/        generated ABIs + clients
  solver-core/      pure taker optimizer
  resolver-core/    pure rebalance evaluator
  frontend-api/     stable UI gateway + mock
services/
  solver-api/       taker discovery/refresh/optimize/simulate/calldata
  resolver-bot/     auction watch + settle
  vol-indexer/      price observations -> oracle
  liquidity-mcp/    reusable The Graph tools
subgraph/           schema, mappings, tests
apps/web/           landing, make, positions, swap, resolve, analytics
deployments/        chain manifests
tools/reference/    Python differential oracle + vectors
docs/               this doc set
```

## 17. Implementation Order & Gates

1. **Pin & prove dependencies** — licenses, commits, target network, Aqua fork, SwapVM
   compile, one real transfer, and **confirm the `FeeProtocol` provider path + CPMM opcode
   value** ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §11).
2. **Freeze math** — Solidity + TS pass the differential-oracle vectors (CPMM, σ, controller,
   β-split).
3. **Freeze encoding** — payload bytes + `strategyHash` parity across Solidity/TS.
4. **Prove Mechanism 1** — ship a strategy; a taker swap charges the committed dynamic fee
   through `FeeProtocol` provider; quote/swap parity holds.
5. **Prove Mechanism 2** — a rebalance settles via the custom instruction with the β-split
   rebate through Aqua `pull`; `RiptideNoSurplus` blocks a loss case.
6. **Prove the loop** — a settled rebalance's revealed price moves the next `feeTarget`.
7. **Prove atomic routing** — exact-in/out batches across ≥2 makers with stale-route +
   rollback tests.
8. **Ship SDK + solver + resolver** — match Solidity bit-for-bit; simulate calldata.
9. **Ship live data** — subgraph reconciles with Lens; solver/resolver discovery depends
   on it.
10. **Ship the UI** — all seven pages without console intervention.
11. **Ship the reusable Graph tool** — MCP composing RIPTIDE + standardized DEX data.
12. **Harden & rehearse** — CI, Foundry invariant/fuzz + differential suite, manifests,
    verification, demo resets, fallbacks; complete submission obligations.

No later brick compensates for a failed earlier gate; UI/subgraph/tooling cannot make an
unverified fee, an unsafe rebalance, or non-atomic settlement safe.

## 18. MVP Definition Of Done

A judge can observe, with real contract calls:

1. ≥3 makers publish distinct CPMM strategies with fee + auction policies through official
   Aqua/SwapVM;
2. The Graph discovers all live strategies;
3. a taker swaps and sees the **volatility-indexed fee actually applied** and the σ that
   produced it, split across makers, settled atomically;
4. price drifts, a resolver wins the rebalancing auction, and the settlement **rebates
   `(1−β)S` and retains `≥βS` for the LP** via Aqua;
5. the **next** taker fee visibly changes because the revealed price re-calibrated the
   controller (the loop);
6. the Recapture Dashboard + MCP show cumulative LVR recaptured vs paid, each linked to
   on-chain evidence with the indexed block;
7. exact-in/out, dynamic-fee, rebalance-split, no-surplus-revert, loop, stale-route, and
   atomic-revert tests pass; Foundry invariants V1–V5 pass with negative controls.

Anything less is a useful prototype, not the complete RIPTIDE product described here.
