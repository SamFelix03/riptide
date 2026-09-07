# RIPTIDE Protocol

Authoritative description of the product and the on-chain protocol, end to end.
Equations live in [`LVR_MATH.md`](LVR_MATH.md). Solidity signatures live in
[`CONTRACTS.md`](CONTRACTS.md). Each mechanism traces to [`SOURCES.md`](SOURCES.md);
the completeness matrix is [`FEATURES.md`](FEATURES.md).

---

## 1. Product

RIPTIDE is a **market-making engine** for the 1inch Aqua shared-liquidity layer,
executed as SwapVM programs. A maker does not merely post a curve and hope fees
exceed losses. A maker deploys a strategy that **prices, charges for, and recaptures
its own structural cost** — Loss-Versus-Rebalancing (LVR), the value an informed
arbitrageur extracts from a passive LP every time the external price moves before the
pool re-prices ([`SOURCES.md`](SOURCES.md) K1).

One RIPTIDE strategy is an Aqua-backed constant-product market maker wrapped in two
managed control layers:

- **Mechanism 1 — a volatility-indexed swap fee.** The fee charged to flow rises and
  falls with realized volatility so that expected fee revenue tracks expected LVR.
- **Mechanism 2 — a resolver rebalancing auction.** When the price gaps, the right to
  re-price the pool is auctioned to competing resolvers, and a retained fraction `β`
  of the arbitrage value is returned to the LP instead of leaking to the mempool.

RIPTIDE deploys **no custody vault**. Maker inventory stays in Aqua and is drawn
per-swap exactly like any other Aqua-backed AMM (verified Aqua model,
[`refs/aqua/src/Aqua.sol`](../../refs/aqua/src/Aqua.sol)). Tokens never sit in a
RIPTIDE contract; Aqua remains the sole custodian.

RIPTIDE is **1inch-native by construction**: it adds no new fee opcode (Mechanism 1
runs inside the existing `FeeProtocol` instruction via its external-provider mode,
[`refs/swap-vm/src/instructions/FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol))
and composes existing SwapVM primitives plus **one** custom settlement instruction for
Mechanism 2, extending
[`AquaSwapVMRouter.sol`](../../refs/swap-vm/src/routers/AquaSwapVMRouter.sol)
through `_dispatch` → `_runOpcode` as SwapVM documents for app-specific handlers.

---

## 2. The two mechanisms as product

### 2.1 Mechanism 1 — volatility-indexed LVR fee

The fee is not a constant a maker guesses. It is produced by a controller that reads
an on-chain volatility estimate and targets the break-even fee — the fee at which
expected fee revenue covers expected LVR ([`LVR_MATH.md`](LVR_MATH.md) §4):

- When volatility is high, adverse selection is expensive, so the fee rises.
- When volatility is low, the pool competes for flow, so the fee falls.

Product-wise this means a RIPTIDE pool **does not systematically lose to arbitrage in
volatile regimes and does not overcharge in calm ones**. The fee is delivered through
the standard `FeeProtocol` instruction; from the taker's perspective it is an ordinary
protocol fee whose rate happens to be current.

Delivered by: `RiptideLvrFeeProvider` (implements the verified
[`IProtocolFeeProvider`](../../refs/swap-vm/src/instructions/interfaces/IProtocolFeeProvider.sol))
reading `RiptideVolatilityOracle`. See [`CONTRACTS.md`](CONTRACTS.md).

### 2.2 Mechanism 2 — resolver rebalancing auction with β-retention

When the external price jumps, the pool is stale and there is arbitrage value to be
taken. On an ordinary AMM the whole of that value leaks to whichever searcher wins the
priority-gas auction in the mempool. RIPTIDE instead **sells the rebalancing right on
its own terms**:

- The strategy opens a declining-price rebalancing quote (a Dutch auction realized
  with the existing `DutchAuctionBalanceIn/Out` primitives,
  [`refs/swap-vm/src/instructions/DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol)).
- Resolvers compete to fill it; competition forces the fill near the point where the
  resolver's margin is thin, so most of the arbitrage value stays with the pool.
- A settlement instruction retains a governed fraction `β` of the realized surplus in
  the maker's Aqua balance and rebates `(1−β)` to the winning resolver (via Aqua
  `pull`) as its execution incentive. With `β = 0.95`, at most ~5% of LVR leaks; ~95%
  is returned to the LP ([`SOURCES.md`](SOURCES.md) K2 recapture bound).
- The reverse-direction swap is penalized immediately afterward by the existing
  `Decay` instruction ([`refs/swap-vm/src/instructions/Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol))
  so an attacker cannot sandwich the rebalance.

Delivered by: `RiptideRebalanceInstruction` + `RiptideSwapVMRouter` +
`RiptideAuctionSettler` on-chain, `services/resolver-auction` off-chain. See
[`CONTRACTS.md`](CONTRACTS.md), [`SYSTEM.md`](SYSTEM.md).

### 2.3 The self-reinforcing loop

The auction reveals a fair price that a competitive resolver was actually willing to
pay for. That price is fed back into the volatility oracle as an
incentive-compatible observation, re-calibrating Mechanism 1's fee controller. This
lowers RIPTIDE's dependence on any single external oracle. It is a **design property,
not a theorem**, and is labelled as such ([`LVR_MATH.md`](LVR_MATH.md) §6).

---

## 3. Roles

| Role | Who they are | What they do with RIPTIDE |
| --- | --- | --- |
| **Maker / LP** | Liquidity provider | Ships inventory into an Aqua strategy, configures the CPMM + fee-controller + auction parameters, earns fees and retained β-surplus, withdraws. |
| **Taker** | Swapper / aggregator | Requests a swap; receives a quote priced by the current volatility-indexed fee; settles through the router. |
| **Resolver** | Searcher / rebalancer | Monitors mispriced RIPTIDE strategies, bids in the rebalancing auction, earns the `(1−β)` execution margin. |
| **Analyst** | LP or observer | Reads dashboards: realized LVR, fee revenue vs LVR, recapture rate, β retained, per-strategy P&L versus a rebalancing benchmark. |

The full per-persona user stories are normative in [`UI.md`](UI.md) §User
Stories.

---

## 4. What a maker configures

A RIPTIDE strategy is configured once and published as an Aqua-backed SwapVM order.
The maker chooses:

```text
Market:        (baseToken, quoteToken)
Inventory:     (reserveBase, reserveQuote)          shipped into Aqua
Fee policy:    (feeMin, feeMax, lambdaEWMA,         Mechanism 1 controller
                Kp, Ki, Imax, sigmaClamp)
Auction policy:(beta, auctionDuration, decay,       Mechanism 2 recapture
                decayPeriodAntiSandwich)
Oracle:        (oracleAddress, maxStaleness,        stale-price protection
                oracleDecimals)
```

- The CPMM leg is the standard `x*y=k` swap (verified `xycSwapXD`, whitepaper §5.3). Its
  reserves are the live Aqua balances the router seeds into `balanceIn/balanceOut` via
  `AQUA.safeBalances` when the order sets the Aqua trait — before `runLoop`
  ([`refs/swap-vm/src/SwapVM.sol`](../../refs/swap-vm/src/SwapVM.sol) L167–169/L221–222) —
  not loaded by a balance opcode.
- Every controller and auction parameter has a governed default and a validated
  range; a strategy that configures a parameter outside its range is rejected at build
  time (parameter table in §13; math in [`LVR_MATH.md`](LVR_MATH.md) §7).
- The fee provider and volatility oracle are **shared infrastructure** referenced by
  the strategy, not redeployed per maker. A maker opts a strategy into the provider by
  registering its `orderHash`/`maker` mapping (see [`CONTRACTS.md`](CONTRACTS.md)).

The exact wire encoding of the strategy payload is normative in
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md).

---

## 5. Encoded and runtime state

RIPTIDE splits committed policy from live bookkeeping:

- **Immutable program payload** (in the SwapVM order bytecode): market, CPMM
  parameters, auction/oracle policy, and the fee-provider binding. Immutable for one
  `nonce`; changing any of it cancels the old strategy and publishes a new one, so a
  quote cannot silently change shape between simulation and execution.
- **Router-owned runtime state** (in `RiptideSwapVMRouter` storage, keyed by strategy
  hash): the live controller state (`feeReported`, integral term `I`), the last-good
  volatility estimate, the last rebalance timestamp, and the `Decay` anti-sandwich
  offset. Keeping runtime state in the router **does not create a custody vault** —
  tokens remain in Aqua; only bookkeeping lives in the router.

Live token balances are always read from Aqua with `safeBalances` at execution time,
never cached as truth (verified in
[`SwapVM.sol`](../../refs/swap-vm/src/SwapVM.sol) when the Aqua maker-trait is set).

---

## 6. Strategy state

```text
Strategy {
    maker
    baseToken
    quoteToken
    cpmm            (reserveBase, reserveQuote via Aqua)
    feePolicy       (feeMin, feeMax, lambda, Kp, Ki, Imax, sigmaClamp)
    auctionPolicy   (beta, duration, decay, antiSandwichPeriod)
    oracle          (address, maxStaleness, decimals)
    nonce
    active
}
```

Static parameters are immutable for one `nonce`; only reserves, controller runtime,
and activity status evolve. A maker parameter update cancels the old nonce and
publishes a replacement. There are no LP shares — each
maker owns and controls one explicit strategy.

---

## 7. Execution paths

### 7.1 Swap path (ordinary taker flow, Mechanism 1 active)

1. The taker requests a swap (exact-in or exact-out) through the router.
2. The SwapVM program runs the canonical Aqua ordering
   (`aquaProtocolFee → [swap] → flatFee → swap → salt`, whitepaper §5.5). RIPTIDE's
   dynamic fee is the `aquaProtocolFee`/`FeeProtocol` stage.
3. `FeeProtocol` (0x80) resolves the fee by `staticcall` to `RiptideLvrFeeProvider`,
   which returns `(receiver, feeBps, surplusBps)` computed from the **committed**
   volatility/controller state (deterministic in static context —
   [`LVR_MATH.md`](LVR_MATH.md) §4.4).
4. The CPMM swap computes `amountOut`/`amountIn` from Aqua balances; rounding favors
   the maker (invariant 5).
5. On settlement (non-static), the controller advances its runtime state and the
   volatility oracle records the new price observation. On quote (static), no state
   changes — guaranteeing Quote/Swap consistency (invariant 3).

### 7.2 Rebalance path (Mechanism 2, resolver flow)

1. Off-chain, a resolver detects that a strategy's marginal price lags the external
   price beyond a threshold (`services/resolver-auction`,
   [`SYSTEM.md`](SYSTEM.md)).
2. The strategy exposes a declining-price rebalancing quote via the
   `DutchAuctionBalanceIn/Out` leg; the effective price improves for the filler over
   the auction window.
3. The winning resolver settles through `RiptideRebalanceInstruction`, which:
   - reads live Aqua balances (`safeBalances`),
   - computes the surplus `S` the resolver's fill captured over the stale-pool
     baseline and verifies `S ≥ 0`,
   - rebates `Down((1−β)·S)` to the resolver via Aqua `pull(maker,…,to=resolver)` and
     leaves the remaining `≥ β·S` in the maker's Aqua balance,
   - arms the `Decay` anti-sandwich offset against the reverse direction,
   - records the revealed price to the volatility oracle.
4. A rebalance that fails any check (negative surplus, expired window, stale
   benchmark, unauthorized caller) **reverts** — a losing or malicious bid cannot
   touch maker inventory ([`LVR_MATH.md`](LVR_MATH.md) §5.3, §7; trust model §12).

---

## 8. Strategy lifecycle

1. Choose a market and configure the CPMM, fee policy, and auction policy.
2. Preview the fee curve, the auction schedule, and a simulated fill/rebalance.
3. Approve tokens and publish the Aqua-backed strategy (`ship`).
4. Serve swaps (Mechanism 1) and rebalances (Mechanism 2) with automatic controller
   and surplus accounting.
5. Cancel immediately by invalidating the nonce and releasing balances (`dock`).
6. Replace parameters through a new nonce and strategy hash.
7. Withdraw remaining inventory when closing.

There are no LP shares; each maker owns one explicit strategy.

---

## 9. Solver and routing

Takers reach RIPTIDE liquidity through a solver, because an EVM transaction cannot
scan every strategy on-chain within gas. Discovery and optimization happen off-chain;
correctness stays on-chain (the solver proposes; the contracts recompute):

1. Query the RIPTIDE subgraph for active strategies in the requested market/direction
   at an indexed block.
2. Reproduce exact Solidity quotes (including the current dynamic fee and rounding) in
   the TypeScript SDK and optimize the split. Native `amountOut/amountIn` is
   non-increasing in size, so exact-output cost is convex and the solver water-fills
   against a common marginal cost.
3. Refresh only the shortlisted strategies' live reserves, controller state, and
   allowances via batched RPC.
4. Simulate the batch with `eth_call`; submit selected fills with aggregate slippage
   and deadline.

The solver is **untrusted**: it can propose a poor route but cannot bypass reserve,
price, version, deadline, β-split, or slippage checks (trust model §12).

---

## 10. Resolver rebalancing auction (off-chain component)

The auction has an on-chain price schedule (§7.2) and an off-chain coordination
service (`services/resolver-auction`). The service:

- watches external prices and RIPTIDE strategy marginal prices,
- signals resolvers when a strategy's mispricing crosses the profitability threshold,
- optionally ranks competing resolver intents and forwards the best,
- never holds custody or authority: the on-chain `RiptideRebalanceInstruction` is the
  sole arbiter of whether a rebalance is valid and how the β-split is computed.

Its ranking is advisory. A resolver may settle directly on-chain; the auction service
improves coordination and price discovery but is not a trust dependency
([`SYSTEM.md`](SYSTEM.md) §Resolver Auction).

---

## 11. Atomic settlement

`RiptideBatchExecutor` accepts a bounded list of selected fills (a maximum count keeps
gas predictable), and for each fill verifies: active strategy and runtime version,
token orientation, live Aqua allocation, the exact-in/out quote including the current
fee, and per-fill plus aggregate limits. All fills settle through the custom SwapVM
path; any failed fill reverts the whole route; checks-effects-interactions ordering
and reentrancy protection precede token movement.

Rebalances settle individually through `RiptideAuctionSettler` (they are not part of a
taker batch), with the same authorization and reentrancy discipline.

---

## 12. Trust model

RIPTIDE's off-chain components — solver, resolver-auction service, volatility indexer,
subgraph — are **untrusted for correctness**. They can propose a poor route, a losing
bid, or a stale estimate, but they cannot:

- move maker inventory except through an authorized on-chain path (`pull`/`push` under
  the router's Aqua app authority),
- cause a rebalance with negative surplus to settle (reverts),
- make the settled fee differ from the quoted fee within a block (Quote/Swap
  consistency, invariant 3),
- bypass reserve sufficiency, price monotonicity, deadline, β-split, or slippage
  checks.

On-chain trust assumptions are explicit and minimized:

- **External price oracle** (Chainlink via `OraclePriceAdjuster`, and the volatility
  oracle's feed): trusted for freshness only; a stale round freezes the estimate
  rather than trusting it (verified staleness check,
  [`refs/swap-vm/src/instructions/OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol)).
  The self-reinforcing loop (§2.3) reduces reliance on this feed over time.
- **Governance** of controller/auction parameters: trusted to set sane ranges;
  production ownership is a multisig/timelock, demo uses labelled keys (§17).

Settlement authorization relies on the **deadline-first** discipline, not a caller
allow-list: the settlement program's first instruction is `Deadline(0x20)`, so an
expired auction window reverts before any balance is touched
([`CONTRACTS.md`](CONTRACTS.md) §16, invariant V5). RIPTIDE is a permissionless AMM —
anyone may submit a settlement; what protects the maker is the on-chain surplus math
(the no-surplus guard and the β-split), not the identity of the caller.

---

## 13. Governance and parameters

All tunable quantities, their meaning, default, and validated range:

| Parameter | Mechanism | Meaning | Governed range (indicative) |
| --- | --- | --- | --- |
| `feeMin` | 1 | Floor fee (always price some adverse selection) | a few bps, `> 0` |
| `feeMax` | 1 | Ceiling fee (safety) | well inside `uint24` (< 1.678·BPS) |
| `lambda` | 1 | EWMA decay for volatility | `(0,1)` |
| `Kp, Ki, Imax` | 1 | PI controller gains + anti-windup | `> 0`, tuned |
| `sigmaMin/Max` | 1 | Volatility clamp | `0 < min < max` |
| `beta` | 2 | Retained LVR fraction to LP | `(0,1)`, sims use `0.95` |
| `auctionDuration` | 2 | Dutch auction window | `uint16` seconds |
| `decay` | 2 | Dutch auction price decay per second | `0 < decay < 1` |
| `antiSandwichPeriod` | 2 | `Decay` reverse-swap penalty period | `uint16` seconds |
| `maxStaleness` | oracle | Oracle round freshness bound | `uint16` seconds |

Governance owns these ranges and the shared provider/oracle contracts. The exact fee
constant is a **tuned controller parameter, not a claimed universal formula** — its
calibration is in [`LVR_MATH.md`](LVR_MATH.md) §4 and tracked as a project open item
in [`INDEX.md`](INDEX.md).

---

## 14. Onchain modules

| Module | Responsibility |
| --- | --- |
| `RiptideTypes` | Strategy/policy structs, quote results, custom errors |
| `WadMulDiv` | Full-precision fixed-point arithmetic + directional rounding |
| `LnExpMath` | Checked `pow`, `exp`, `ln`, `sqrt` over explicit domains |
| `VolatilityMath` | EWMA + Garman–Klass realized-volatility math |
| `LvrMath` | LVR rate and CPMM `σ²/8` specialization |
| `FeeController` | Break-even target + clamped PI controller |
| `DiamondSplit` | β-retention surplus split |
| `RiptideStrategyCodec` | Canonical strategy payload encode/decode |
| `RiptideVolatilityOracle` | On-chain realized-volatility estimate + price observations |
| `RiptideLvrFeeProvider` | Implements `IProtocolFeeProvider`; returns the dynamic fee |
| `RiptideRebalanceKernel` | Stateless surplus/baseline quote below EIP-170 |
| `RiptideRebalanceInstruction` | Custom SwapVM rebalance-settlement opcode + β-split |
| `RiptideSwapVMRouter` | Aqua app; SwapVM validation; swap + rebalance settlement |
| `RiptideAuctionSettler` | Single-rebalance settlement + authorization gate |
| `RiptideQuoter` | Static single-strategy quote/preview (incl. current fee) |
| `RiptideLens` | Strategy, runtime, Aqua, wallet, allowance reconciliation |
| `RiptideBatchExecutor` | Atomic multi-strategy taker settlement + aggregate limits |
| `RiptideDemoToken` | Faucet ERC-20 for the demo |

Per-contract interfaces, events, errors, and invariants are normative in
[`CONTRACTS.md`](CONTRACTS.md).

---

## 15. Offchain modules

| Module | Responsibility |
| --- | --- |
| `packages/riptide-math` | Exact TypeScript mirror of the on-chain math + rounding |
| `packages/strategy-sdk` | Compile/decode strategies, normalize decimals, Aqua lifecycle, calldata |
| `packages/solver-core` | Pure deterministic route optimization |
| `services/solver-api` | Discover, refresh, optimize, simulate, return unsigned routes |
| `services/resolver-auction` | Detect mispricing, coordinate/rank resolver bids (advisory) |
| `services/vol-indexer` | Feed price observations to the volatility oracle |
| `services/liquidity-mcp` | Reusable discovery/comparison MCP tools |
| `subgraph/` | Index strategies, fills, rebalances, fee/vol/recapture events |
| `apps/web` | Maker builder, taker execution, resolver console, analyst dashboard |

Precise boundaries, protocol calls, flows, and deployment order are normative in
[`SYSTEM.md`](SYSTEM.md).

---

## 16. Interface

The interface has four surfaces, one per role (full spec in
[`UI.md`](UI.md)):

- **Maker builder** — configure the CPMM, fee controller, and auction; preview the
  fee-vs-volatility curve and a simulated fill/rebalance; publish/cancel/withdraw.
- **Taker swap** — request an amount; see the optimized split, the current dynamic
  fee, blended price, price impact, and min-out/max-in.
- **Resolver console** — see mispriced strategies, the live auction price, and
  expected `(1−β)` margin; submit a rebalance.
- **Analyst dashboard** — realized LVR, fee revenue vs LVR, recapture rate, β
  retained, and per-strategy P&L versus a rebalancing benchmark.

---

## 17. Correctness, security, and operations

The required test matrix (detail in [`LVR_MATH.md`](LVR_MATH.md) §8 and
[`DIFF_ORACLE.md`](DIFF_ORACLE.md)) covers: LVR/CPMM identities, volatility
estimator equality, fee-controller convergence and determinism, β-split conservation,
Dutch-auction price schedule, negative-surplus and expired-window reverts, rounding
favoring the maker, Quote/Swap consistency, reentrancy/malicious-token/malformed-
program handling, and differential vectors against the Python differential oracle. Real
token transfers run through the official Aqua/SwapVM contracts.

The hackathon deployment supports standard ERC-20s only; rebasing, fee-on-transfer,
and callback-bearing tokens are rejected or unsupported. Deployment is
assembled in dependency order (libraries → oracle/provider → kernel/instruction →
router → periphery → subgraph → services → web), production ownership is a
multisig/timelock, the demo uses labelled keys, and the deployment is explicitly **not
represented as audited**. The full order is in
[`SYSTEM.md`](SYSTEM.md) §Deployment.

---

## 18. Scope and non-goals

**In scope:** a single-market RIPTIDE strategy with the volatility-indexed fee and the
β-retention rebalancing auction, self-custody via Aqua, a solver + subgraph for taker
discovery, a resolver auction service, a differential math oracle, and a four-surface web app.

**Explicit non-goals** (each is a deliberate boundary, not an omission):

- **Not a new market design.** RIPTIDE keeps the standard CPMM and internalizes LVR
  around it. It does not implement batch/uniform-price auctions or function-maximizing
  AMMs — scrapped with justification in [`SOURCES.md`](SOURCES.md) §4.
- **Not an actively-managed or hedged vault.** RIPTIDE charges and recaptures; it does
  not hedge the LP position or synthesize exotic payoffs (scrapped: Fukasawa,
  replicating MMs — [`SOURCES.md`](SOURCES.md) §4). This also preserves the no-vault
  Aqua model.
- **Not a derivatives venue.** No power perpetuals, no options on LP positions
  (scrapped: Panoptic — [`SOURCES.md`](SOURCES.md) §4).
- **Not a claim of an optimal fee constant.** The fee is a tuned controller; K3
  supplies the principle (an interior optimum exists), not a universal number.

---

## 19. Sponsor mapping

- **1inch is the settlement architecture.** Maker balances use official Aqua; the fee
  is the official `FeeProtocol` provider path; the rebalance and anti-sandwich legs
  are official `DutchAuction`/`Decay`; only one custom settlement instruction is
  added, via the official router-extension pattern. RIPTIDE uses 1inch's VM **as
  intended**, not a fork ([`SOURCES.md`](SOURCES.md) §1).
- **The Graph is the discovery architecture.** The solver finds live strategies
  through the RIPTIDE subgraph; a reusable MCP exposes cross-source liquidity
  comparison.

---

## 20. Demo definition of done

The seeded market contains three RIPTIDE strategies configured with different
volatility/auction policies. The demo shows, from a documented seeded state and
repeatably:

1. **Mechanism 1:** a taker swaps; the quoted fee visibly reflects the current
   volatility estimate; a volatility spike raises the fee on the next quote.
2. **Mechanism 2:** an injected price gap makes a strategy mispriced; a resolver wins
   the declining-price auction; the analyst dashboard shows β·surplus credited back to
   the maker's Aqua balance and `(1−β)` paid to the resolver; a reverse swap is
   penalized by `Decay`.
3. **Loop:** the auction's revealed price updates the volatility oracle and the next
   fee quote.
4. The subgraph shows indexed fills, rebalances, and fee/recapture events; the whole
   flow runs twice without console intervention.
