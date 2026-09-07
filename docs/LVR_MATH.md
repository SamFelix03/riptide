# RIPTIDE LVR Mathematics

Normative identities, units, rounding, and the tests those identities must pass.
Contract wiring is in [`CONTRACTS.md`](CONTRACTS.md); opcode encoding is in
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md); product framing is in
[`PROTOCOL.md`](PROTOCOL.md).

Every equation is either **verified** from a primary source (marked with its key
from [`SOURCES.md`](SOURCES.md), e.g. `[K1]`) or a **design/standard** construction
we label honestly (`[DESIGN]`, `[STD]`). Nothing here is asserted as coming from the
LVR literature unless it does.

---

## 1. Units and Orientation

Every market has a canonical **base** token and **quote** token. The interface
displays price as **quote per base**. The SwapVM kernel instead uses the native
**output-per-input** orientation, matching the four swap registers (`SwapRegisters`,
VM.sol:50) verified in the sources under
[`refs/swap-vm/src/instructions`](../../refs/swap-vm/src/instructions):

```text
amountIn   = input token amount        (register)
amountOut  = output token amount       (register)
balanceIn  = maker balance of input    (register, Aqua-backed)
balanceOut = maker balance of output   (register, Aqua-backed)
P_native   = amountOut / amountIn      (output per input; marginal or effective)
P_display  = quote per base            (UI only; converted at the market boundary)
```

Conversion between native and displayed price happens **only** at the market
boundary (SDK / UI), never inside the kernel. SwapVM registers stay output-per-input
for the whole program.

Fee units follow SwapVM exactly: **`BPS = 1e7` represents 100%** (verified in
[`FeeFlat.sol`](../../refs/swap-vm/src/instructions/FeeFlat.sol) `BPS = 1e7` and
[`IProtocolFeeProvider.sol`](../../refs/swap-vm/src/instructions/interfaces/IProtocolFeeProvider.sol)
"percentages 1e7"). Therefore:

```text
1 bps (0.01%) = 1_000 fee-units
1%            = 100_000 fee-units
100%          = 10_000_000 fee-units = BPS
feeBps is uint24, so max representable = 16_777_215 (< 1.678 * BPS)
```

`feeBps` and `surplusBps` returned by a provider are `uint24`. RIPTIDE clamps its
fee well inside `uint24` (see §6).

### 1.1 Integer Arithmetic Contract `[DESIGN]`

RIPTIDE's `WadMulDiv` computes `x * y / d` from the full 512-bit product with an
explicit floor or ceiling:

```text
Down(x*y/d) = floor(x*y/d)      using the full 512-bit product
Up(x*y/d)   = ceil (x*y/d)      using the full 512-bit product
```

A zero denominator, an over-`uint256` result, or a ceiling above `uint256.max`
reverts. Every WAD multiply/divide/reciprocal helper takes an explicit rounding
argument. Raw ERC-20 amounts normalize to WAD only for `0 <= decimals <= 18`:

```text
amountWad = rawAmount * 10^(18 - decimals)      (exact; must fit the amount domain)
```

**Directional rounding — "favors the maker" (SwapVM invariant 5, verified in
whitepaper §4):** `amountIn` rounds **up** (ceil), `amountOut` rounds **down**
(floor). RIPTIDE's fee and recapture math must never round in a direction that
extracts value from the maker's Aqua balance.

### 1.2 Transcendental Arithmetic Contract `[DESIGN]`

RIPTIDE needs `ln`, `exp`, and `pow` for volatility (log-returns), the fee curve,
and the auction decay. It wraps pinned Solady `FixedPointMathLib` (`lnWad`/`expWad`)
behind explicit domains:

```text
lnWad:   1     <= input <= uint256.max        (log-returns of positive prices)
expWad:  -42e18 < input <  135e18             (Solady expWad safe domain; RIPTIDE
                                                narrows further per call site)
powWad:  0 < base;  exponent * ln(base) must stay in the expWad domain
```

Identities `x^0 = 1`, `1^a = 1`, `x^1 = x` bypass generic evaluation. Each
transcendental result carries an explicit error envelope (a few WAD units), and
downstream code consumes the maker-favorable endpoint of that envelope before
applying `WadMulDiv` floor/ceiling. Exact conditioning bounds are recorded
in [`LN_EXP_BOUNDS.md`](../LN_EXP_BOUNDS.md) at implementation time.

> Note: exact Solady domain constants must be read from the pinned version at build
> time; the interval above is the working envelope, not a claim about a specific
> commit. Tracked in [`SOURCES.md`](SOURCES.md) §6.

---

## 2. The cost RIPTIDE internalizes: LVR `[K1]`

Let `P_t` be the external (efficient) price of the risky asset in quote units,
following a diffusion with instantaneous volatility `sigma_t`. An AMM holds a
reserve position; write its **value function** `V(P)` — the mark-to-market value of
the pool's reserves at price `P`. The passive LP's marginal risky holdings equal the
derivative of the value function (envelope relation, verified from full text):

```text
x*(P) = V'(P)                          risky-asset holdings as a function of price
V''(P) = x*'(P) <= 0                   value function is concave in P
```

The instantaneous **Loss-Versus-Rebalancing** rate — the drift by which the pool
underperforms a self-financing "rebalancing portfolio" that holds the same exposure
but trades frictionlessly on a reference venue — is (verified `[K1]`):

```text
ell(sigma, P) = (sigma^2 * P^2 / 2) * |x*'(P)|
              = (sigma^2 * P^2 / 2) * (-V''(P))
```

`ell >= 0` always. It is a pure function of volatility, price, and curve curvature.
It is **not** impermanent loss (a price-level comparison) — it is a *rate* that
accrues continuously whenever the price moves, and it is exactly the value a
continuously-arbitraging informed trader extracts from the LP.

### 2.1 CPMM specialization `[K1]`

For a constant-product market maker (`x*y = k`, equal-weight geometric-mean maker),
the value function and its curvature give the celebrated closed fraction (verified
from full text):

```text
V(P)          proportional to  sqrt(P)              (up to the invariant constant)
ell(sigma,P)  =  (sigma^2 / 8) * V(P)
so            ell / V  =  sigma^2 / 8
```

**Reading:** a CPMM leaks value at an instantaneous rate of `sigma^2 / 8` of the
pool's value per unit time. At 100% annualized vol (`sigma = 1`), that is `1/8`
per year of pool value flowing to arbitrageurs before any fees — the number RIPTIDE
must charge for and recapture.

### 2.2 LP profit-and-loss decomposition `[K1]`

Over horizon `[0, T]`, the LP's performance relative to the rebalancing portfolio is
exactly fees minus accumulated LVR (verified from full text):

```text
LP_value(T) - rebalancing_value(T)  =  accumulated_fees(T) - accumulated_LVR(T)

accumulated_LVR(T) = integral_0^T ell(sigma_t, P_t) dt
                   = integral_0^T (sigma_t^2 / 8) * V(P_t) dt      (CPMM)
```

This single identity is the RIPTIDE thesis in one line: **an LP is profitable versus
rebalancing iff fees exceed LVR.** Mechanism 1 raises the left term to track the
right; Mechanism 2 lowers the right term by recapturing part of it.

---

## 3. Volatility estimation `[STD, FLAGGED]`

`ell` needs `sigma_t`. RIPTIDE estimates realized volatility online in
`RiptideVolatilityOracle` (see [`CONTRACTS.md`](CONTRACTS.md)). These are standard
estimators, **outside** the kept LVR survey and labelled as such in
[`SOURCES.md`](SOURCES.md) §5; they are estimation mechanics, not economic claims.

### 3.1 EWMA of log-returns (RiskMetrics-style)

For a price series `P_1, P_2, ...` sampled per block or per fill, with decay
`lambda in (0,1)`:

```text
r_k        = ln(P_k / P_{k-1})                        (log-return; uses lnWad)
var_k      = lambda * var_{k-1} + (1 - lambda) * r_k^2
sigmaHat_k = sqrt(var_k / dt_k)                        (per-unit-time volatility)
```

`var_k` is stored in WAD; `lambda` is a governed parameter (RiskMetrics daily uses
`0.94`, but RIPTIDE tunes it for block cadence — value fixed at deployment, not
invented per-trade).

### 3.2 Garman–Klass range estimator (optional, higher efficiency)

When per-interval high/low/open/close are available (e.g. from the subgraph), the
range estimator reduces variance of the estimate:

```text
gk_k = 0.5 * (ln(H_k / L_k))^2  -  (2*ln(2) - 1) * (ln(C_k / O_k))^2
```

blended into `var_k` with the same EWMA weight. This is an efficiency improvement
only; the fee math is identical.

### 3.3 Estimator safety

`sigmaHat` is clamped to `[sigmaMin, sigmaMax]` (governed) so a manipulated or stale
price cannot drive the fee to either extreme. A stale oracle round (detected exactly
as `OraclePriceAdjuster` does — `block.timestamp > updatedAt + maxStaleness`,
verified in
[`OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol))
freezes `sigmaHat` at its last good value rather than trusting the stale input.

---

## 4. Mechanism 1: the volatility-indexed LVR fee `[DESIGN over K1, K3]`

The fee's job is to make expected fee revenue cover expected LVR (the break-even
principle of `[K3]`). This is a **controller**, not a magic constant.

### 4.1 Break-even target

Over a short interval `dt` with traded value `Q` (notional routed through the
strategy), the break-even per-notional fee `phi*` satisfies:

```text
phi* * Q  >=  ell * dt  =  (sigmaHat^2 / 8) * V * dt          (CPMM, [K1])
```

Define the **trading intensity** `lambda_Q = Q / (V * dt)` (turnover of pool value
per unit time, estimated online from fills). Then the break-even fraction is:

```text
phi*  =  (sigmaHat^2 / 8) / lambda_Q
```

**Interpretation and the [K3] trade-off:** if flow is thin (`lambda_Q` small), each
trade must pay more to cover LVR, so the fee rises; if flow is deep, the fee falls.
`[K3]` establishes that an interior optimum exists (fee too low ⇒ LP bleeds to
arbitrage; fee too high ⇒ flow leaves, `lambda_Q` collapses, LVR is uncovered).
RIPTIDE does **not** claim `phi*` is that optimum in closed form; it is the
break-even set-point the controller targets, bounded by governed limits.

### 4.2 Target in SwapVM units

```text
feeTarget = clamp( phi* * BPS ,  feeMin , feeMax )       BPS = 1e7
```

`feeMin`/`feeMax` are governed (e.g. `feeMin` a few bps to always price adverse
selection; `feeMax` a safety ceiling well inside `uint24`).

### 4.3 Clamped PI controller `[STD, FLAGGED]`

To avoid the fee chattering block-to-block (which would break Quote/Swap consistency
expectations and annoy takers), the provider drives the *reported* fee toward
`feeTarget` with a clamped proportional–integral controller (standard control, see
[`SOURCES.md`](SOURCES.md) §5):

```text
e_k    = feeTarget_k - feeReported_{k-1}
I_k    = clamp( I_{k-1} + Ki * e_k ,  -Imax , Imax )      (anti-windup)
feeReported_k = clamp( feeReported_{k-1} + Kp * e_k + I_k ,  feeMin , feeMax )
```

`Kp`, `Ki`, `Imax` are governed. `feeReported_k` is what
`RiptideLvrFeeProvider.getRecipientAndFees` returns as `feeBps`.

### 4.4 Determinism requirement (SwapVM invariant 3)

`getRecipientAndFees` is called via `staticcall` inside both `quote()` and `swap()`
(verified: `FeeProtocol.exec` calls it the same way in both, and the router's
`quote` runs the identical program in static context). Therefore the fee **must be a
pure function of on-chain state at the current block** — it must not read a value
that changes between the quote `eth_call` and the settling transaction within the
same block. RIPTIDE satisfies this by advancing the controller state **only in
non-static context** (the same discipline `Decay.exec` uses: it writes storage only
`if (!ctx.vm.isStaticContext)`, verified in
[`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) lines 76–79). In static
(quote) context the provider returns the fee computed from the *committed* state,
guaranteeing Quote/Swap consistency.

---

## 5. Mechanism 2: LVR recapture via a rebalancing auction `[DESIGN over K2]`

After the external price moves, the pool is mispriced: its marginal price lags `P*`.
The gap is the arbitrage value `[K1]`. RIPTIDE auctions the right to close that gap
and **retains a fraction `beta` of the value for the LP**, per `[K2]`.

### 5.1 The retained-value bound `[K2]`

```text
beta in (0,1)                            governed retention parameter (sims use 0.95)
arbitrage value of the move  =  Upsilon
resolver (auction winner) keeps  (1 - beta) * Upsilon
LP vault retains                  beta * Upsilon
recapture bound:  E[ LVR leaked to arbitrageurs ]  <=  (1 - beta) * L
```

So with `beta = 0.95`, at most 5% of LVR leaks; 95% is returned to the LP. This is
the entire economic content of Mechanism 2.

### 5.2 On-chain price discovery: the Dutch auction `[verified primitive]`

RIPTIDE realizes the auction with the existing `DutchAuctionBalanceIn/Out`
primitives (opcodes `0x94`/`0x95`, verified in
[`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol)). For a
rebalance that pulls the pool toward `P*`, the maker's demanded input decays
geometrically over the auction window:

```text
balanceIn(t)  =  balanceIn(start) * decay^(t - start)        0 < decay < 1   (verified)
require(block.timestamp <= start + duration) else revert     (verified)
```

As `t` advances, the maker demands less input for the same output, i.e. the
rebalancing price improves for a filler. Competing resolvers each hold off until the
price crosses their own profitability threshold; **competition among resolvers is
what forces the fill to happen near the point where the resolver's margin is thin**,
leaving the surplus with the pool. The `decay` and `duration` parameters encode the
intended `beta`: they set how much of `Upsilon` is offered to the winner before the
window closes.

### 5.3 Surplus accounting and the β-split `[DESIGN]`

The full input the resolver provides is credited to the maker's Aqua balance by the
ordinary swap settlement. The recapture question is how much of the resolver's
*surplus over the stale-pool baseline* the maker retains versus rebates to the
resolver as its incentive.

Let `staleIn` be the input the pool's pre-rebalance (stale) CPMM curve would require
for the rebalance output size — the baseline — and let `executedIn` be the input the
winning resolver actually provides under the decaying auction terms. The surplus
captured for the pool is:

```text
S  =  executedIn - staleIn           (>= 0 by construction; else the fill is rejected)
```

Because the resolver's whole `executedIn` is already credited to the maker by
settlement, realizing β means **rebating** `(1-beta)*S` back to the resolver and
letting the maker keep the rest. Rounding favors the maker (invariant 5): the rebate
is floored, so the maker retains **at least** `beta*S`:

```text
payToResolver =  Down( (1 - beta) * S )      rebated to resolver via Aqua pull(maker,...,to=resolver)
retainToLP    =  S - payToResolver           (>= beta * S; stays in the maker's Aqua balance)
```

The rebate is paid with the verified Aqua primitive
`pull(maker, strategyHash, token, payToResolver, resolver)` (see
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md)); `retainToLP` needs no transfer —
it is already in the maker's strategy. If `S < 0` (no genuine surplus, e.g. a
manipulated or stale baseline), the settlement **reverts** — a losing or malicious
bid cannot touch maker inventory (trust model,
[`PROTOCOL.md`](PROTOCOL.md) §12).

### 5.4 Backrun / sandwich protection `[verified primitive]`

Immediately after a rebalance, the counter-direction swap is penalized by the
existing `Decay` instruction (opcode `0x9c`, verified in
[`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol)): a virtual reserve
offset is added against the reverse direction and decays linearly over `period`.
This prevents an attacker from immediately unwinding the rebalance at the LP's
expense. RIPTIDE reuses it unchanged.

---

## 6. The self-reinforcing loop `[DESIGN]`

The auction produces a market-revealed fair price `P*_auction` (the price at which a
competitive resolver was willing to rebalance). RIPTIDE feeds `P*_auction` back into
the volatility oracle as an additional, **incentive-compatible** price observation:

```text
resolver-revealed P*_auction  --->  RiptideVolatilityOracle observation
                              --->  sigmaHat update (§3)
                              --->  feeTarget update (§4)
```

Because a resolver only rebalances when it is genuinely profitable, `P*_auction`
carries information a passive oracle read does not, and it is costly to fake (the
resolver must post real value). This reduces RIPTIDE's dependence on a single
external oracle: the fee controller is partly calibrated by prices that were *paid
for*, not merely reported. This is a design property, not a theorem — it is stated
as such.

---

## 7. Numerical safety and configuration rejection

Configuration and runtime must reject:

- Non-positive prices or reserves; `sigmaHat`, `lambda_Q` outside governed bounds.
- Any transcendental argument outside the §1.2 domains (reject, do not saturate).
- A `feeBps`/`surplusBps` that would violate the verified `FeeProtocol` guard
  `totalFeeBps < BPS && totalSurplusBps < BPS`
  ([`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol) line 217).
- A rebalance whose surplus `S < 0`, or whose stale-pool baseline fails the freshness
  / staleness check (§3.3).
- A Dutch-auction window that has expired (`block.timestamp > start + duration`,
  verified revert in [`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol)).

None of these is a semantic whitelist; they are numerical-domain and economic-sign
guards.

---

## 8. Required mathematical tests

Required checks, owned jointly with [`DIFF_ORACLE.md`](DIFF_ORACLE.md):

**LVR / value function `[K1]`:**
- `ell = (sigma^2/8) V` holds for CPMM against the high-precision oracle across a
  grid of `(sigma, P)`.
- `x*(P) = V'(P)` and `V''(P) <= 0` verified numerically.
- The P&L identity `LP - rebalancing = fees - LVR` holds on simulated price paths.

**Volatility `[STD]`:**
- EWMA recursion matches the oracle to rounding.
- Garman–Klass blend matches; clamps engage at the bounds.
- Stale-round freeze reproduces the last good `sigmaHat` exactly.

**Fee controller `[DESIGN]`:**
- `feeTarget = clamp(phi* * BPS, feeMin, feeMax)` matches the oracle.
- PI controller converges to `feeTarget` for a step input without overshoot beyond a
  stated bound; anti-windup holds `I_k` in `[-Imax, Imax]`.
- **Determinism:** for fixed committed state, `getRecipientAndFees` returns the
  identical `feeBps` in static and non-static context (Quote/Swap consistency).

**Recapture `[K2]/DESIGN]`:**
- Dutch-auction `balanceIn(t)` matches `balanceIn(start) * decay^elapsed` to rounding.
- β-split: `payToResolver = Down((1-beta)*S)`, `retainToLP = S - payToResolver`,
  `retainToLP >= beta*S` (rounding favors the maker).
- `S < 0` reverts; expired window reverts.
- Simulated: with `beta`, average leaked LVR `<= (1-beta) L` over many paths
  (recapture-bound sanity, statistical — K2, not an on-chain theorem).

**Cross-cutting:**
- All rounding favors the maker (invariant 5) on random inputs.
- No transcendental call is made with an out-of-domain argument on the full test
  grid.

---

## 9. Kernel boundary (what this document does NOT define)

This specification does **not** define:

- How strategies are discovered, indexed, or routed across (see solver in
  [`SYSTEM.md`](SYSTEM.md)).
- How the off-chain resolver auction collects and ranks bids (see
  [`SYSTEM.md`](SYSTEM.md) §Resolver Auction).
- Aqua custody, opcode encoding, or settlement authorization (see
  [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md), [`CONTRACTS.md`](CONTRACTS.md)).
- The governance of `beta`, `lambda`, `Kp`, `Ki`, `feeMin/feeMax`, `sigmaMin/Max`
  (see [`PROTOCOL.md`](PROTOCOL.md) §Governance).

Their correctness requires the conservation, security, and integration tests owned
by those documents, not the single-strategy mathematics here.
