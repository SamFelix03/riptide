# RIPTIDE UI Contract

Status: normative UI contract. Lists **every page**, the **component list** for
each page, and the **per-persona user stories** the frontend must satisfy. This is
the framework-neutral product boundary every UI component consumes, plus the
states, errors, and freshness rules the UI must render honestly.

It does **not** define contract APIs ([`CONTRACTS.md`](CONTRACTS.md)), economics
([`PROTOCOL.md`](PROTOCOL.md)), math ([`LVR_MATH.md`](LVR_MATH.md)), or wire
format ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md)). Transport rule: a stable
`frontend-api` gateway with a deterministic mock; only the composition root
selects mock vs live; components never import transports directly.

---

## 1. Personas

RIPTIDE has **four** frontend personas. Each maps to a role defined in
[`PROTOCOL.md`](PROTOCOL.md) §3.

| Persona | Who | Primary goal | Primary page |
| --- | --- | --- | --- |
| **Maker / LP** | Liquidity provider who ships a CPMM strategy | Earn fees, retain LVR via β | Maker Studio, Strategy Manager |
| **Taker** | Trader who swaps against a strategy | Best execution, transparent fee | Swap Terminal |
| **Resolver** | Searcher who wins the rebalancing auction | Profit on `(1−β)` surplus | Resolver Console |
| **Analyst** | Anyone auditing recapture performance | Verify LVR is being internalized | Analytics / Recapture Dashboard |

Maker and taker are the two Aqua/SwapVM trading roles. The **resolver** and
**analyst** exist because Mechanism 2 (the rebalancing auction) and the
self-reinforcing loop are what this product adds. No persona has admin power — there is
no privileged price/parameter administrator ([`PROTOCOL.md`](PROTOCOL.md) §12).

---

## 2. Shared infrastructure (all pages)

### 2.1 Wallet & network layer

Connects the wallet, enforces the supported chain, resolves the deployment manifest
(`deployments/<chainId>.json`), reads token balances/allowances, and presents every
transaction step explicitly. RPC URLs and sponsor API secrets never ship in the browser
bundle. Components:

- `WalletConnectButton`, `NetworkGuard`, `ChainBanner` (wrong-network state)
- `TokenBalanceReadout`, `AllowanceManager` (approve Aqua, not a RIPTIDE vault)
- `TransactionStepper` (ordered, explicit steps; no hidden signing)

### 2.2 `frontend-api` gateway

The single framework-neutral boundary consumed by every component. It exposes: tokens
and raw amounts, displayed prices, markets, strategies, swap quotes (with the **applied
dynamic fee**), rebalance previews (with the **β-split**), fills, controller/vol
telemetry, freshness metadata, stable typed errors, and ordered transaction plans. Its
deterministic mock marks every plan `sendable: false` so UI work can proceed before
contracts exist. Only the web composition root selects mock or live mode. Full boundary
schema in §9.

### 2.3 Design system

- `RiptideThemeProvider` (light/dark; see the `dataviz` skill palette for charts)
- Primitives: `Card`, `StatTile`, `Meter`, `DataTable`, `Sparkline`, `Toast`, `Modal`
- `FreshnessBadge` (indexed block vs chain head), `HonestyBadge` (renders `[verified]` /
  `[confirm at build]` provenance where a value's source matters)

---

## 3. Pages

Seven pages. Each lists its component set. Prices are always **quote units per one base
unit**; token decimals normalized at the `frontend-api` boundary
([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §2).

### 3.1 Landing / Overview (`/`)

Explains the product in one screen and routes each persona to its page.

- `HeroExplainer` — "RIPTIDE internalizes LVR: a volatility-indexed fee (Mechanism 1)
  plus a resolver rebalancing auction that returns β of the surplus to LPs (Mechanism
  2), where the auction's revealed price re-calibrates the fee (the loop)."
- `MechanismDiagram` — two mechanisms + the self-reinforcing loop
  ([`PROTOCOL.md`](PROTOCOL.md) §2.3)
- `PersonaCards` (Maker / Taker / Resolver / Analyst → deep links)
- `LiveProtocolStats` (total strategies, 24h volume, cumulative β-recaptured — from
  subgraph)
- `SponsorFooter` (1inch Aqua + SwapVM, The Graph)

### 3.2 Maker Studio (`/make`) — persona: Maker/LP

Configure and ship one CPMM strategy with fee + auction policy.

- `TokenPairSelector` (base, quote; rejects identical/zero; standard ERC-20 only)
- `ReserveInput` (initial base & quote reserves → CPMM `x·y=k`)
- `FeePolicyPanel` — `feeMin`, `feeMax`, EWMA `lambda`, PI `Kp/Ki/Imax`,
  `sigmaMin/sigmaMax` ([`LVR_MATH.md`](LVR_MATH.md) §3–§4)
- `AuctionPolicyPanel` — `beta` (retention, shown as "you keep β·surplus"),
  `auctionDuration`, `decay`, `antiSandwichPeriod` ([`LVR_MATH.md`](LVR_MATH.md) §5)
- `OracleConfigPanel` — Chainlink feed address, decimals, `maxStaleness`
- `FeeCurvePreview` — `Sparkline`/chart of `feeBps` vs σ across `[sigmaMin,sigmaMax]`
  clamped to `[feeMin,feeMax]`
- `RecapturePreview` — for an illustrative surplus S, shows `retainToLP = S−Down((1−β)S)`
  vs `payToResolver`
- `StrategyBytesInspector` — compiled payload + `policyHash`/`strategyHash`, with the
  TS-vs-Solidity hash-parity check surfaced
- `ApproveAndShipStepper` — approve Aqua → `Aqua.ship(router, strategy, [base,quote],
  amounts)` → wait for tx + subgraph confirmation

### 3.3 Swap Terminal (`/swap`) — persona: Taker

Swap against one or more strategies with a transparent dynamic fee.

- `MarketSelector`, `DirectionToggle` (exact-in / exact-out), `AmountInput`
- `SlippageControl`, `RecipientField`, `DeadlineField`
- `QuotePanel` — amount in/out, **`feeBpsApplied` with the current σ that produced it**
  (Mechanism 1 transparency), effective price, price impact
- `RouteBreakdown` — per-strategy split, per-maker amount & effective price, worst
  marginal price (via `RiptideBatchExecutor`)
- `FreshnessBadge` — indexed block vs chain head; degraded/stale route labelled, never
  hidden
- `SimulationResult` — `eth_call` outcome before signing
- `ExecuteButton` — signs calldata targeting `RiptideBatchExecutor` only

### 3.4 Resolver Console (`/resolve`) — persona: Resolver

Monitor open rebalancing auctions and settle the winning one. This page exists because
Mechanism 2 is a live auction ([`PROTOCOL.md`](PROTOCOL.md) §10, §2.2).

- `AuctionBoard` — open auctions across strategies: current Dutch price (declining),
  time remaining in `auctionDuration`, drifted-vs-oracle gap
- `SurplusEstimator` — for a candidate fill: `S = executedIn − staleIn`,
  `payToResolver = Down((1−β)·S)` (the resolver's take), `retainToLP`
  ([`LVR_MATH.md`](LVR_MATH.md) §5.3)
- `RebalancePreview` — `frontend-api.previewRebalance` result + current auction price
- `AntiSandwichNotice` — surfaces the `Decay` reverse-swap penalty window so a resolver
  understands why an immediate reverse is penalized
- `SettleButton` — calls `RiptideAuctionSettler.settleRebalance(...)`; on `S<0` the UI
  shows the `RiptideNoSurplus` guard (no loss-making settlement is possible)
- `ResolverPnLLog` — historical wins, `payToResolver` earned, gas

### 3.5 Strategy Manager (`/positions`) — persona: Maker/LP

Manage shipped strategies.

- `StrategyList` — each strategy: market, live Aqua reserves, controller state
  (`feeReported`, σ), version, active/docked (via `RiptideLens`)
- `StrategyDetail` — immutable policy, logical vs Aqua balances, wallet backing &
  allowance, fill history, **cumulative β-recaptured for this strategy**
- `ControllerTelemetry` — σ over time, `feeTarget` vs `feeReported`, PI integral state
  ([`LVR_MATH.md`](LVR_MATH.md) §4)
- `DockButton` — `Aqua.dock(...)` to cancel completely
- `RepublishFlow` — dock + ship a new salted strategy (no in-place edit;
  in-place mutation of a shipped strategy is forbidden)

### 3.6 Analytics / Recapture Dashboard (`/analytics`) — persona: Analyst

The visible proof that LVR is being internalized — the product's thesis, on screen.

- `RecaptureHeadline` — cumulative LVR recaptured to LPs vs paid to resolvers, protocol
  wide and per market (β in action; K2)
- `FeeVsLvrChart` — realized fee revenue vs estimated LVR over time (the K1/K3 principle:
  fee tracks LVR)
- `LoopVisualizer` — auction revealed price → oracle σ update → next `feeTarget`
  (the self-reinforcing loop, [`PROTOCOL.md`](PROTOCOL.md) §2.3)
- `MarketTable` — per-market volume, active liquidity, avg fee, recapture ratio
- `EventFeed` — `SwapFilled` / `RebalanceSettled` / `FeeControllerUpdated`, each linked
  to its tx and stamped with the indexed block
- `HonestyPanel` — renders the SOURCES ledger status: which numbers are `[verified]` vs
  simulation-validated (the K2 β-retention bound is statistical, not an on-chain theorem —
  [`CONTRACTS.md`](CONTRACTS.md) §16)

### 3.7 Not-Found / Unsupported (`/*`)

- `UnsupportedChainState`, `StrategyNotFoundState`, `EmptyState` — deterministic,
  never a blank screen.

---

## 4. User stories — Maker / LP  *(important)*

1. As an LP, I connect my wallet and the app enforces the supported chain, so I never
   ship to the wrong network.
2. As an LP, I select a base/quote pair and enter initial reserves, and I see the CPMM
   curve and the implied start price before committing.
3. As an LP, I set a fee band `[feeMin, feeMax]` and see a live preview of how the fee
   rises with volatility σ, so I understand I am charging **more when adverse selection
   is worse** (Mechanism 1) — not a flat fee.
4. As an LP, I set my retention β and immediately see, for an example surplus, that I
   keep at least `β·S` and only `(1−β)·S` goes to the resolver — so I understand the
   auction works **for** me (Mechanism 2).
5. As an LP, I verify the compiled strategy bytes hash identically in TypeScript and
   Solidity before I sign, so I trust what I'm shipping.
6. As an LP, I approve Aqua (not a RIPTIDE vault) and call `ship`, and my tokens stay in
   my custody model until settlement.
7. As an LP, I later open Strategy Manager and see my live reserves, the current
   volatility-indexed fee my strategy is charging, and **how much LVR I've recaptured**
   cumulatively — the number that tells me RIPTIDE is doing its job.
8. As an LP, I cancel by docking, and to change parameters I republish a new salted
   strategy — there is no misleading "edit" button that would silently mutate my curve.

## 5. User stories — Taker

1. As a taker, I pick a market, direction, and amount, and I see the exact amount out
   with the **fee that will actually be applied and the volatility that produced it** —
   no hidden or retroactive fee.
2. As a taker, I see the route split across makers with per-maker effective price and the
   worst marginal price, so I know why this is best execution.
3. As a taker, I see whether the quote is fresh (indexed block vs chain head); if it's
   stale, the app tells me instead of pretending.
4. As a taker, the app simulates my route with `eth_call` before I sign, and I sign only
   calldata targeting `RiptideBatchExecutor`.
5. As a taker, if any fill would fail or slippage is exceeded, the whole route reverts
   atomically and I keep my funds.

## 6. User stories — Resolver

1. As a resolver, I see all open rebalancing auctions with the current declining Dutch
   price and time remaining, so I can decide when to act.
2. As a resolver, I preview the surplus `S` and my take `payToResolver = Down((1−β)·S)`
   before I commit, so I only settle profitable rebalances.
3. As a resolver, I cannot settle a loss-making rebalance: if `S < 0` the app shows the
   `RiptideNoSurplus` guard and the transaction would revert — I'm protected from
   footguns and the maker is protected from me.
4. As a resolver, I understand the anti-sandwich `Decay` penalty window so I don't get
   penalized by an immediate reverse swap.
5. As a resolver, I settle via `RiptideAuctionSettler`, receive my rebate through Aqua
   `pull`, and see my win logged with realized PnL.

## 7. User stories — Analyst

1. As an analyst, I open the dashboard and see, protocol-wide, how much LVR was
   recaptured to LPs vs paid to resolvers — the single number that proves the thesis.
2. As an analyst, I compare realized fee revenue against estimated LVR over time and see
   the fee **tracking** LVR (the K1/K3 principle), not sitting at an arbitrary constant.
3. As an analyst, I watch the loop: a rebalance's revealed price updates the volatility
   estimate, which moves the next fee target — visualized end to end.
4. As an analyst, every headline number links to its on-chain event and states the
   indexed block, and the honesty panel tells me which claims are on-chain `[verified]`
   vs validated by simulation — so I can trust the dashboard.

---

## 8. States, errors, and freshness (every data view)

- **Loading / empty / error** are always explicit; never a blank component.
- Typed errors from `frontend-api` map 1:1 to the custom errors in
  [`CONTRACTS.md`](CONTRACTS.md) §3 (e.g. `RiptideStaleVersion`,
  `RiptideSlippageExceeded`, `RiptideNoSurplus`, `RiptideStaleOracleRound`) and render a
  human message plus the machine code.
- **Freshness:** any subgraph-derived view shows the indexed block; if index lag exceeds
  threshold, the view is labelled stale and the app waits / offers a degraded path — it
  must never claim best execution at chain head from an old snapshot.
- **Honesty:** values whose provenance matters carry a `HonestyBadge`
  (`[verified]` / `[confirm at build]` / simulation-validated), consistent with
  [`SOURCES.md`](SOURCES.md).

---

## 9. `frontend-api` boundary (framework-neutral)

The contract every component imports; the composition root binds it to the mock or the
live implementation. Shapes are normative intent (types finalized with the SDK).

```ts
// discovery
listMarkets(): Market[]
listStrategies(market: MarketId, opts?): StrategyView[]        // via subgraph + Lens
getStrategy(maker, strategyHash): StrategyDetail

// taker
quoteSwap(market, kind, amount): SwapQuote                     // { amountIn, amountOut, feeBpsApplied, sigmaWad, effPrice, freshness }
buildSwapRoute(market, kind, amount, limits): TxPlan           // targets RiptideBatchExecutor; sendable flag

// resolver
listOpenAuctions(market?): Auction[]                           // { strategyHash, dutchPriceNow, endsAt, oracleGap }
previewRebalance(maker, strategy, outWad): RebalancePreview    // { surplusWad, payToResolver, retainToLP, auctionPriceNowWad }
buildSettleRebalance(maker, strategy, outWad, maxIn, deadline): TxPlan   // targets RiptideAuctionSettler

// maker
buildShipStrategy(strategy): TxPlan                            // approve Aqua + ship
buildDockStrategy(maker, strategyHash): TxPlan

// telemetry / analytics
getControllerState(maker, strategyHash): ControllerTelemetry   // sigma, feeTarget, feeReported, integral
getRecaptureStats(scope): RecaptureStats                       // recaptured vs paid, per market/protocol
streamEvents(filter): EventFeedItem[]                          // SwapFilled, RebalanceSettled, FeeControllerUpdated

// meta
getFreshness(): { indexedBlock, chainHead, laggingSeconds }
```

Every returned plan carries `sendable: boolean`; the mock always sets it `false`. No
component constructs calldata itself — it renders a `TxPlan` through the
`TransactionStepper`.

---

## 10. Routing map

```text
/            Landing / Overview          (all personas)
/make        Maker Studio                (Maker/LP)
/positions   Strategy Manager            (Maker/LP)
/swap        Swap Terminal               (Taker)
/resolve     Resolver Console            (Resolver)
/analytics   Recapture Dashboard         (Analyst)
/*           Not-Found / Unsupported
```

Deep links carry `?market=<base>-<quote>` and, where relevant,
`?strategy=<strategyHash>` so any view is shareable and reproducible.
