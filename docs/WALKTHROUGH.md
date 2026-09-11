# RIPTIDE Live Walkthrough

Target length: **3 minutes**. Recorded against a seeded Base Sepolia deployment with
three strategies already live.

---

## Pre-flight checklist

- [ ] 3 strategies seeded and active (run `pnpm demo:reset` if needed)
- [ ] Solver API healthy (`/v1/health`)
- [ ] Subgraph indexed up to latest block
- [ ] Browser wallet on Base Sepolia with demo tokens
- [ ] Pre-open Activity tab in BaseScan for the BatchExecutor address
- [ ] Screen recording tool ready (1920x1080)

---

## Shot list

### 1. Landing (0:00–0:25)

**What to show:** The RIPTIDE landing page hero animation, ticker, mechanism
cards, stat tiles, how-it-works flow.

**Script:**
> RIPTIDE is a market-making engine for 1inch Aqua. It uses two mechanisms:
> a volatility-indexed fee that tracks LVR, and a Dutch rebalancing auction
> that returns surplus to LPs. The auction's revealed price feeds back into
> the fee controller — a self-reinforcing loop.

**Action:** Scroll slowly through the landing page. Hover TiltCards to show
3D effect. Pause on stat tiles showing live protocol numbers.

---

### 2. Maker Studio — Configure + Ship (0:25–1:05)

**What to show:** Configure a 4th strategy with custom parameters, preview
the fee curve, review the CPMM price, and ship.

**Script:**
> A maker configures reserves, fee band, auction policy, and oracle settings.
> The fee curve preview shows how the target fee varies with volatility.
> After approving tokens, we ship both swap and rebalance Aqua orders in one
> transaction plan.

**Action:**
1. Navigate to `/make`
2. Adjust `beta` to 0.95, show the recapture preview updating
3. Open the Strategy Inspector — show payload hex and hash parity
4. Click "Build ship plan" → show the TransactionStepper steps
5. Execute (or show the plan if wallet is demo-only)

**Fallback:** If the ship tx takes too long, cut to the Positions page showing
the new strategy as active.

---

### 3. Swap — Quote + Execute (1:05–1:40)

**What to show:** A taker swap with the volatility-indexed fee applied,
route breakdown across multiple makers.

**Script:**
> A taker requests a swap. The quote shows the current dynamic fee and
> volatility. The route breakdown splits the trade across three makers,
> showing per-maker effective prices and the worst marginal price.
> After simulation passes, we execute atomically through the BatchExecutor.

**Action:**
1. Navigate to `/swap`
2. Enter 1 WAD exact-in
3. Show the Quote card with fee bps and σ
4. Show the Route Breakdown — per-maker allocation
5. Click "Build route" → simulation pass → execute

---

### 4. Resolve — Auction + Settle (1:40–2:15)

**What to show:** Skew the oracle, open an auction window, preview surplus,
and settle a rebalance.

**Script:**
> When external price gaps, a Dutch auction opens. Resolvers see the live
> auction price decaying over time. The surplus preview shows how much
> goes to the LP (β) and how much to the resolver (1−β).
> Settlement reverts if there is no genuine surplus.

**Action:**
1. Navigate to `/resolve`
2. Click "Build oracle skew plan" → execute to create a price gap
3. Refresh auction board — show the new auction with surplus
4. Show the Decay card with progress bar
5. Show the Auction Price card
6. Show the Surplus Estimate
7. Click "Settle rebalance" → execute
8. Show the Resolver PnL table updating

---

### 5. Analytics — Loop Proof (2:15–2:40)

**What to show:** The recapture dashboard proving the loop closed.

**Script:**
> The analytics dashboard shows real on-chain data: fee vs target,
> fee vs estimated LVR, and the self-reinforcing loop.
> The rebalance settled, the oracle updated, the fee controller
> recalibrated, and the next swap charged the new fee.

**Action:**
1. Navigate to `/analytics`
2. Show Protocol Overview — recaptured to LPs, paid to resolvers
3. Show Fee vs Target sparklines
4. Show Fee vs Estimated LVR
5. Show Loop Visualizer with real event counts
6. Show Event Feed with clickable tx hashes
7. Show Honesty badges

---

### 6. Positions — Dock (2:40–3:00)

**What to show:** Strategy detail, controller telemetry, and dock flow.

**Script:**
> The positions page shows live reserves, controller telemetry showing
> fee convergence, and fill history. The maker can dock the strategy
> to withdraw inventory and republish with tuned parameters.

**Action:**
1. Navigate to `/positions`
2. Show the Strategy Detail card
3. Show Controller Telemetry — feeTarget vs feeReported convergence
4. Show Fill History table
5. Briefly show Dock button (don't execute to keep strategies live)
6. End on the Republish guidance card

---

## Failure-safe fallbacks

- **Slow indexing:** If subgraph lags, pre-open BaseScan and show the tx
  there, then cut to the app after indexing catches up.
- **Tx failure:** Show the RiptideErrorDisplay and explain the revert reason.
  Re-run with adjusted parameters.
- **Network issues:** Have a screen recording of a successful run as backup.

## Post-demo

Run `pnpm release:verify` to prove the public demo is healthy:

```bash
PUBLIC_APP_URL=https://... \
PUBLIC_API_URL=https://... \
PUBLIC_SUBGRAPH_URL=https://... \
PUBLIC_RPC_URL=https://... \
PUBLIC_MANIFEST_URL=https://... \
node scripts/verify-public-demo.mjs
```
