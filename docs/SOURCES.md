# RIPTIDE Source & Research Audit

## Purpose

This document is the honesty ledger for RIPTIDE. It answers three questions the
rest of the specification depends on:

1. **What is actually present in the 1inch sources we pulled?** (Aqua and SwapVM.)
   Everything RIPTIDE builds on is a file we opened and quote by path.
2. **Which research did we keep, and which did we scrap — and why?** Complexity is
   not the filter; *usefulness to this product* is. Every scrapped item has a
   written reason.
3. **What did we verify ourselves, and what remains flagged?** Equations we
   re-derived from primary full text are marked verified; anything we could not
   confirm is marked `[UNVERIFIED]` or `[STANDARD-REFERENCE, OUTSIDE SURVEY]`.

Rule for the whole project: **no feature may depend on an unverified claim without
that claim appearing in this document with its status.**

## Method

- **1inch code** was verified by reading the files directly under
  [`refs/`](../../refs). Opcode numbers were read from
  [`refs/swap-vm/src/libs/OpcodeList.sol`](../../refs/swap-vm/src/libs/OpcodeList.sol)
  and the dispatch tables under
  [`refs/swap-vm/src/opcodes/`](../../refs/swap-vm/src/opcodes). Behavior was read
  from each instruction's `exec` function.
- **Papers** were verified from the **downloaded PDF full text** — decompressing the
  content streams of [`LVR_PAPER.pdf`](LVR_PAPER.pdf),
  [`DIAMOND_LVR.pdf`](DIAMOND_LVR.pdf), and [`FEESvLVR.pdf`](FEESvLVR.pdf), which carry
  the equations the arXiv abstract page omits. The equations quoted below are the ones
  we reproduced from that text; the PDFs are the retained copies of record (see §6).
- **Bibliographic metadata** (arXiv IDs, exact titles, author lists) was verified
  directly from the downloaded PDFs — title pages and page self-stamps (see §6). The
  *mathematics* was reproduced independently of that metadata.

---

## 1. The single most important source finding

The SwapVM whitepaper (§5.4,
[`refs/whitepaper-swap-vm-1.0.pdf`](../../refs/whitepaper-swap-vm-1.0.pdf)) names a
`dynamicProtocolFeeAmountInXD` / `aquaDynamicProtocolFeeAmountInXD` instruction that
"queries an external fee provider contract via `staticcall` for the fee rate and
recipient." Our first-pass grep for that literal name in `refs/swap-vm/src` found
nothing, which earlier made us assume RIPTIDE would need a **new** fee opcode.

**That assumption was wrong, and the correction strengthens RIPTIDE.** The dynamic
protocol fee is real and implemented — it lives inside `FeeProtocol` (opcode `0x80`):

- [`refs/swap-vm/src/instructions/FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol)
  line 181 calls
  `IProtocolFeeProvider(target).getRecipientAndFees(orderHash, maker, taker, tokenIn, tokenOut, isExactIn)`
  when a receiver entry is flagged `isProvider`.
- The interface is
  [`refs/swap-vm/src/instructions/interfaces/IProtocolFeeProvider.sol`](../../refs/swap-vm/src/instructions/interfaces/IProtocolFeeProvider.sol):
  `getRecipientAndFees(...) returns (address receiver, uint24 feeBps, uint24 surplusBps)`,
  documented as "percentages 1e7".

**Consequence for RIPTIDE.** Mechanism 1 (the volatility-indexed LVR fee) requires
**no new opcode and no fork of SwapVM**. It is a `RiptideLvrFeeProvider` contract
that implements `IProtocolFeeProvider`, plugged into an ordinary `FeeProtocol`
instruction inside the maker's program. This is the difference between "we modified
1inch's VM" and "we used 1inch's VM exactly as intended." RIPTIDE is the latter.

`FeeProtocol` additionally exposes a **surplus fee** paid by the *maker* on
execution better than an estimate (see the `@dev` block and `surplusBps` in the
same file). RIPTIDE reuses that channel for recapture accounting (see
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) and
[`LVR_MATH.md`](LVR_MATH.md) §Recapture).

---

## 2. 1inch source inventory (verified present)

### 2.1 Aqua (shared liquidity)

Source: [`refs/aqua/src/Aqua.sol`](../../refs/aqua/src/Aqua.sol),
[`refs/aqua/src/interfaces/IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol).

Verified primitive signatures (RIPTIDE uses all five):

```text
safeBalances(address maker, address app, bytes32 strategyHash,
             address token0, address token1) -> (uint256, uint256)
ship(address app, bytes strategy, address[] tokens, uint256[] amounts) -> bytes32 strategyHash
dock(address app, bytes32 strategyHash, address[] tokens)
pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to)
push(address maker, address app, bytes32 strategyHash, address token, uint256 amount)
```

Meaning for RIPTIDE: maker inventory is **shipped** into an Aqua strategy (no
vault), the router reads live balances with **safeBalances**, per-swap outflow is
**pull**ed, recaptured β-surplus is **push**ed back, and cancellation is **dock**.

### 2.2 SwapVM (execution engine)

Sources under [`refs/swap-vm/src`](../../refs/swap-vm/src). Verified this pass:

| Opcode | Enum (OpcodeList.sol) | File | What it actually does (from `exec`) | RIPTIDE use |
| ---: | --- | --- | --- | --- |
| `0x04` | `Extruction` | [`Extruction.sol`](../../refs/swap-vm/src/instructions/Extruction.sol) | Delegates swap registers to an external `IExtruction` target that may modify registers, set PC, consume taker args. | No-fork alternative for Mechanism-2 settlement. |
| `0x70/0x71` | `FeeFlatIn/Out` | [`FeeFlat.sol`](../../refs/swap-vm/src/instructions/FeeFlat.sol) | Wrapping flat fee, `BPS=1e7`, `ceilDiv`, adjust→`runLoop()`→finalize. | Fallback static fee; the fee-instruction template. |
| `0x72/0x73` | `FeeProgressiveIn/Out` | [`FeeProgressive.sol`](../../refs/swap-vm/src/instructions/FeeProgressive.sol) | Progressive fee schedule. | Alternative fee shape (not required by MVP). |
| `0x80` | `FeeProtocol` | [`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol) | Flat fee (taker-paid) + surplus fee (maker-paid); receiver entries can be **providers** resolved by `staticcall` to `IProtocolFeeProvider`. | **Mechanism 1 host.** |
| `0x91` | `DynamicBalances` | [`Balances.sol`](../../refs/swap-vm/src/instructions/Balances.sol) | Sets `balanceIn/Out` from the router's **own** persistent per-`orderHash` storage (virtual reserves initialized from literal `[balanceA, balanceB]` args, written back when `!isStaticContext`) — **not** an Aqua reader (L101–125). | **Not used.** RIPTIDE's reserves are live Aqua balances the router seeds via `safeBalances` (SwapVM.sol:222); a `0x91` would overwrite them. |
| `0x94/0x95` | `DutchAuctionBalanceIn/Out` | [`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol) | Exponential decay/growth of `balanceIn`/`balanceOut` over time; reverts after `duration`. Encoding `[uint40 start, uint16 duration, uint64 decay]`. | **Mechanism 2**: declining-price rebalancing auction. |
| `0x9c` | `Decay` | [`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) | Per-`orderHash` time-decaying virtual reserve offset that penalizes immediate reverse swaps. Encoding `[uint16 period]`. | **Mechanism 2**: anti-sandwich / backrun protection. |
| `0xb2` | `OraclePriceAdjuster` | [`OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol) | Reads Chainlink `latestRoundData`, staleness-checks, scales to 1e18, adjusts price **only if favorable to taker**. Encoding `[uint64 maxPriceDecay, uint16 maxStaleness, uint8 oracleDecimals, address oracleAddress]`. | Quote-side stale-price protection. |
| `0xb4` | `BaseFeeAdjuster` | [`BaseFeeAdjuster.sol`](../../refs/swap-vm/src/instructions/BaseFeeAdjuster.sol) | `block.basefee`-indexed discount. | Optional gas-aware adjustment. |

Engine contracts verified: `Order{maker, traits, data}` + `hash/quote/swap` in
[`ISwapVM.sol`](../../refs/swap-vm/src/interfaces/ISwapVM.sol); router base
`AquaSwapVMRouter is Simulator, SwapVM, AquaOpcodes` with
`_dispatch → _runOpcode` in
[`AquaSwapVMRouter.sol`](../../refs/swap-vm/src/routers/AquaSwapVMRouter.sol).

Verified execution facts RIPTIDE depends on (from the whitepaper text and the
instruction sources):

- Four swap registers (`SwapRegisters`, VM.sol:50): `balanceIn, balanceOut, amountIn, amountOut`.
- Four-member `Context` (VM.sol:71): `vm` (VM state), read-only `query` (`SwapQuery`, `isExactIn` etc.), mutable `swap` (`SwapRegisters`), and `fee` (`ProtocolFee`).
- Fees are **wrapping**: adjust the amount, call `runLoop()`, then finalize (verified in both `FeeFlat.exec` and `FeeProtocol.exec`).
- Seven core invariants (whitepaper §4): ExactIn/Out Symmetry, Swap Additivity, Quote/Swap Consistency, Price Monotonicity, Rounding-Favors-Maker, Balance Sufficiency, Strategy Liveness.
- Canonical Aqua ordering (whitepaper §5.5): `aquaProtocolFee → [swap] → flatFee → swap → salt`.

### 2.3 Custom instruction and router extension

RIPTIDE extends `AquaSwapVMRouter` with one purpose-built rebalance handler. The
shape comes from SwapVM itself:

- Custom instruction as an `abstract contract` with one `_xxx(Context, bytes)`
  entry, a `mapping(bytes32 => Runtime)` state store, program-payload decoding, and
  event emission gated on `!ctx.vm.isStaticContext` — the same storage and static-
  context discipline as
  [`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) and
  [`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol).
- Router `is AquaSwapVMRouter` that overrides dispatch to expose the rebalance
  handler (keeps deploy under EIP-170), plus order-building helpers and
  `AQUA.safeBalances` reads —
  [`AquaSwapVMRouter.sol`](../../refs/swap-vm/src/routers/AquaSwapVMRouter.sol)
  `_dispatch` → `_runOpcode`; live Aqua seeding in
  [`SwapVM.sol`](../../refs/swap-vm/src/SwapVM.sol). Pinned SwapVM v1.0.2 uses the
  `_opcodes()` / `_runOpcode` model documented in
  [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §3.1.
- Off-chain: The Graph for discovery, an untrusted solver whose fills are
  recomputed on-chain, and a high-precision Python oracle for differential tests
  ([`PROTOCOL.md`](PROTOCOL.md), [`LVR_MATH.md`](LVR_MATH.md),
  [`DIFF_ORACLE.md`](DIFF_ORACLE.md)).

---

## 3. Research kept (the load-bearing mathematics)

Exactly three papers survive the usefulness filter. Each earns its place by
supplying a specific number RIPTIDE cannot make up.

### K1 — Loss-Versus-Rebalancing (LVR). arXiv:2208.06046.

**Why kept:** it *defines the cost RIPTIDE exists to internalize*, and gives it a
closed form. Without it, "charge for adverse selection" is hand-waving; with it, the
fee has a target.

**Verified from the full text ([`LVR_PAPER.pdf`](LVR_PAPER.pdf)):**

```text
Instantaneous LVR rate:   ell(sigma, P) = (sigma^2 * P^2 / 2) * |x*'(P)|
Marginal holdings:        x*(P) = V'(P),   with V''(P) = x*'(P) <= 0
CPMM specialization:      ell / V = sigma^2 / 8      (LVR as a fraction of pool value per unit time)
LP decomposition:         LP_value - rebalancing_value  =  fees  -  accumulated_LVR
```

Used in [`LVR_MATH.md`](LVR_MATH.md) §LVR and §CPMM.

### K2 — Diamond (LVR rebalancing/auction recapture). arXiv:2210.10601.

**Why kept:** it provides the *recapture bound* — the theorem that auctioning the
rebalancing right and retaining a fraction β returns β of the LVR to LPs. Mechanism
2's economics is this paper.

**Verified from the full text ([`DIAMOND_LVR.pdf`](DIAMOND_LVR.pdf)):**

```text
beta in (0,1)                 retention parameter
winner receives (1 - beta)    fraction of arbitrage value
beta * Upsilon                retained to the pool/LP vault
Recapture bound:  E[LVR to arbitrageurs]  <=  (1 - beta) * L
Simulations use beta = 0.95
```

Used in [`LVR_MATH.md`](LVR_MATH.md) §Recapture and
[`PROTOCOL.md`](PROTOCOL.md) §Mechanism 2.

### K3 — Fees vs LVR (companion). arXiv:2305.14604.

**Why kept:** it ties the two mechanisms together — it treats the fee as the
instrument that offsets LVR and characterizes the trade-off (too low ⇒ LP bleeds to
arbitrage; too high ⇒ flow leaves). This is the justification for making the fee a
*controller* rather than a constant, and for the self-reinforcing loop where the
auction's revealed price re-calibrates the fee.

**Status:** kept for its *principle* (fees must track LVR, and there is an interior
optimum). We do **not** claim a specific closed-form optimal-fee constant from it;
the concrete curve is a tuned controller (see §5 and [`LVR_MATH.md`](LVR_MATH.md)).

---

## 4. Research scrapped (with justification)

Each of these is real and respectable; each is *not useful enough* for RIPTIDE to
carry. Keeping them would add mathematics without adding product.

| Scrapped | arXiv | Why it does not earn its place in RIPTIDE |
| --- | --- | --- |
| FM-AMM / function-maximizing AMM | 2307.02074 | Proposes a *different market design* (batch/uniform-price) to reduce LVR. RIPTIDE deliberately keeps the standard continuous CPMM and internalizes LVR around it via fee + auction. Adopting FM-AMM would replace, not use, the 1inch AMM primitives — the opposite of the "fits 1inch exactly" goal. |
| Optimal routing / convex CFMM analysis (Angeris–Boyd) | 2204.05238 | Elegant general theory of routing across CFMMs. RIPTIDE's solver is a **bounded separable convex allocation** over single-maker micro-pools, which a bounded water-filling split over single-maker pools already covers; the general machinery is far heavier than needed and adds no product capability. |
| Replicating market makers / payoff replication | 2103.14769, 2111.13740 | Concerns synthesizing arbitrary payoffs from CFMM curves. RIPTIDE does not construct exotic payoffs; the marginal-cost curve is a plain CPMM. Pure surplus math. |
| Fukasawa et al. GMMM / hedging | 2303.11118 | Continuous-time hedging of the LP position. RIPTIDE does not hedge on the LP's behalf; it *charges and recaptures*. Interesting but a different product (an actively managed vault), which also contradicts the no-vault, self-custody Aqua model. |
| Power perpetuals | (various) | A derivatives instrument, not an AMM cost model. No path to a SwapVM program over Aqua. |
| Panoptic (perpetual options on AMM LP) | 2204.14232 | Builds an options market *on top of* LP positions. Orthogonal to internalizing LVR at the AMM layer; would be a separate product. |

Net: the kept set (K1–K3) is the minimal chain **cost → recapture bound → controller
principle**. Everything scrapped either changes the market design (contradicting the
1inch-native constraint) or adds generality with no product payoff.

---

## 5. Standard references used but outside the pulled survey `[FLAGGED]`

RIPTIDE needs two engineering ingredients that the three kept papers do **not**
provide. We use well-established standard techniques and label them honestly; they
must be cited properly and their parameters tuned/reviewed at build time. We are
**not** inventing these, and we are **not** claiming they come from the LVR
literature.

- **Realized-volatility estimation** — `[STANDARD-REFERENCE, OUTSIDE SURVEY]`.
  EWMA / RiskMetrics-style exponential weighting (RiskMetrics Technical Document,
  J.P. Morgan, 1996) and the Garman–Klass range estimator (Garman & Klass, 1980)
  for estimating σ from price history. Feeds `RiptideVolatilityOracle`. See
  [`LVR_MATH.md`](LVR_MATH.md) §Volatility Estimation.
- **Feedback control** — `[STANDARD-REFERENCE, OUTSIDE SURVEY]`. A clamped
  proportional–integral (PI) controller (e.g. Åström & Murray, *Feedback Systems*)
  to drive `feeBps` toward the LVR target without oscillation. See
  [`LVR_MATH.md`](LVR_MATH.md) §Fee Controller.

These are the only two places RIPTIDE reaches outside the kept papers, and both are
implementation mechanics (estimation and control), not economic claims.

---

## 6. Bibliographic metadata (verified from the downloaded PDFs)

The equations in §3 were reproduced from full text. The **arXiv IDs, titles, and
author lists** below were verified directly from the downloaded PDFs — each paper's
title page and its page self-stamp:

- **arXiv:2208.06046** — *Automated Market Making and Loss-Versus-Rebalancing*; Jason
  Milionis, Ciamac C. Moallemi, Tim Roughgarden, Anthony Lee Zhang. **[verified: title
  page + page self-stamp, [`LVR_PAPER.pdf`](LVR_PAPER.pdf)]**
- **arXiv:2210.10601v2** — *An Automated Market Maker Minimizing Loss-Versus-Rebalancing*
  (the "Diamond" protocol); Conor McMenamin, Vanesa Daza, Bruno Mazorra. **[verified:
  title page + page self-stamp, [`DIAMOND_LVR.pdf`](DIAMOND_LVR.pdf)]**
- **arXiv:2305.14604** — *Automated Market Making and Arbitrage Profits in the Presence
  of Fees*; Jason Milionis, Ciamac C. Moallemi, Tim Roughgarden. **[verified: title page,
  embedded `/Title` metadata + page self-stamp, [`FEESvLVR.pdf`](FEESvLVR.pdf)]**

Also to confirm at build time (tracked in [`INDEX.md`](INDEX.md) Open Items):

- Official Aqua and SwapVM **addresses and commit hashes** — captured during
  research; re-verify against the official 1inch deployment manifest.
- Toolchain **versions** (Node/pnpm/Foundry/Solidity/Python) — reconcile against
  pinned SwapVM `foundry.toml` and the current environment ([`RESOLUTIONS.md`](../RESOLUTIONS.md) §10).

---

## 7. Completeness statement

Every RIPTIDE feature has a reference of one of these kinds, enumerated in
[`FEATURES.md`](FEATURES.md):

- a 1inch source file under `refs/` (§2 above), or
- a kept paper K1–K3 (§3), or
- a flagged standard reference (§5, and only for estimation/control), or
- a RIPTIDE design decision that composes the above (marked as such, with the
  primitives it composes).

If a feature cannot be placed in one of those buckets, it is out of scope until it
can be. That is the gate.
