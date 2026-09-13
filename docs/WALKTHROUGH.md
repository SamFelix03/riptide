# RIPTIDE Live Walkthrough

Target length: **3 minutes**. Recorded against the deployed Base Sepolia app at
**https://riptide-web-production-77f7.up.railway.app**, with the three demo strategies live.

---

## Pre-flight checklist

- [ ] App loads and `/api/config` returns the current addresses
- [ ] Subgraph indexed to within a few blocks — the freshness badge on `/analytics` reads green
- [ ] 3 strategies on the `/swap` board (if not, re-seed with `pnpm deploy:testnet`; `pnpm demo:reset` is Anvil-only)
- [ ] Browser wallet on Base Sepolia with a little ETH
- [ ] **RBASE and RQUOTE minted** — a first-time wallet has none, and every swap, ship and
      settle moves them. Mint from **Demo tools → Demo token faucet** on `/swap`, `/make` or
      `/resolve`. The header shows both balances beside the wallet address, and any action
      you cannot cover is disabled with the shortfall spelled out
- [ ] The Chainlink-feed owner wallet available for the §4 oracle skew — that one call is owner-only
- [ ] BaseScan open on the BatchExecutor and AuctionSettler addresses
- [ ] Screen recording ready (1920x1080)

Approvals are not a pre-flight step. Every plan detects a missing allowance and puts the
approval in front of the action, so a wallet that has never touched the deployment is fine.

---

## Shot list

### 1. Landing (0:00–0:25)

**What to show:** Hero, the problem/solution pair, the two mechanism cards, the loop
diagram, and the live protocol stats.

**Script:**
> RIPTIDE is a market-making engine for 1inch Aqua. Pools bleed to whoever is fastest —
> that's LVR. RIPTIDE uses two mechanisms: a volatility-indexed fee sized to cover LVR,
> and a Dutch rebalancing auction that keeps β of the surplus with the LP. The auction's
> revealed price feeds back into the fee controller — a self-reinforcing loop.

**Action:** Scroll through "Pools bleed to whoever is fastest" → "Keep the leak in the
market" → the two mechanism cards → "Ordinary AMM vs RIPTIDE" → the loop diagram. Pause on
the live protocol stats; those are indexed on-chain numbers, not copy.

---

### 2. Maker Studio — Configure + Ship (0:25–1:05)

**What to show:** Configure a fourth strategy, watch the previews move, inspect the raw
payload, ship it.

**Script:**
> A maker sets reserves, a fee band, an auction policy and an oracle. The fee curve shows
> how the target fee rises with volatility; the recapture card shows the β split. Shipping
> publishes two Aqua orders — one for swaps, one for the rebalance auction — and registers
> both with the routers.

**Action:**
1. Navigate to `/make`
2. Adjust **Fee band** and watch the **Fee curve** `feeTarget(σ)` redraw
3. Set `beta` in **Auction** to 0.95 — the **Recapture** card updates the split
4. Open **Advanced** — show the 226-byte payload hex and the encode → decode → re-hash
   parity badge
5. Click **Build ship plan** → the stepper shows 8 steps: two approvals, both `Aqua.ship`
   legs, three registrations, and the auction start
6. Execute

**Fallback:** If shipping runs long, cut to `/positions` with the new strategy listed.

---

### 3. Swap — Quote + Execute (1:05–1:40)

**What to show:** A taker swap at the live dynamic fee, split across every live maker.

**Script:**
> The quote shows the fee actually applied and the σ that produced it. The route splits
> across makers by marginal price — each row is a separate maker's pool. It simulates with
> `eth_call` before anything is signed, then settles atomically through the BatchExecutor:
> any fill that fails reverts the whole route.

**Action:**
1. Navigate to `/swap`
2. Enter an exact-in amount in the **Ticket** card
3. Show **Quote** — fee in 1e7 units and σ
4. Show **Route breakdown** — maker, fee, amount in/out and effective price per row
5. Click **Build route** → simulation passes → execute
6. Point out the plan is approve + execute on a first swap, and execute alone afterwards

---

### 4. Resolve — Auction + Settle (1:40–2:20)

**What to show:** Open a gap, read the decaying auction price, settle it, get paid.

**Script:**
> When the oracle moves away from the pool, a Dutch auction opens and its price decays.
> The preview shows the surplus and exactly how it splits — at least β to the LP, the rest
> to whoever settles. This is permissionless: nothing about the resolver is in the order,
> so any wallet can settle, and the rebate plus the base it just bought land in the wallet
> that sent the transaction. If there is no genuine surplus, settlement reverts.

**Action:**
1. Navigate to `/resolve`
2. Open **Demo tools — oracle skew** → **Build oracle skew plan** → execute from the feed-owner wallet
3. Refresh the **Auction board** — a row appears with its current pay-to-resolver
4. Show the decay meter and the remaining-percentage counter
5. In **Settle ticket**, show **Surplus S**, **Pay resolver** `⌊(1−β)·S⌋` and
   **Retain LP** `≥ β·S` — they sum exactly
6. Click **Settle rebalance** → approve → settle
7. Show **Resolver PnL** — the new row's **Settled by** column is your address

**Worth saying out loud:** the rebate is paid to the VM taker, read at execution time, not
to an address baked into the order. That is what makes any judge able to do this from their
own wallet.

---

### 5. Analytics — Loop Proof (2:20–2:45)

**What to show:** The loop closing, in indexed on-chain data.

**Script:**
> Recaptured to LPs versus paid to resolvers, both from the subgraph. Fee against target
> shows the controller converging. Fee against σ²/8 shows the fee tracking estimated LVR
> rather than sitting at a constant. The settle we just did moved the oracle, which moved
> the fee target, which the next swap will charge.

**Action:**
1. Navigate to `/analytics`
2. **Recapture** — recaptured to LPs, paid to resolvers, fill volume, freshness badge
3. **Fee vs target** and **Fee vs estimated LVR**
4. **Loop** — real event counts
5. **Per-market recapture ratio**
6. **Atomic routes** — the swap from §3, with its fill count
7. **Resolver standings** — your wallet, from the settler's own `AuctionSettled` receipt
8. **Event feed** — clickable tx hashes

---

### 6. Positions — Telemetry + Dock (2:45–3:00)

**What to show:** Live inventory, controller convergence, and withdrawing.

**Script:**
> Reserves are live Aqua balances, not a cached number. The controller telemetry shows
> feeTarget and feeReported converging. Strategies are immutable, so retuning means docking
> and shipping a new salt — docking returns the inventory to the maker's own wallet.

**Action:**
1. Navigate to `/positions`
2. **Strategy list** → select the strategy shipped in §2
3. **Inspector** — Aqua base/quote, σ, feeTarget vs feeReported, recapture
4. **Fill history** — the fills from §3
5. **Dock & republish** → build the dock plan and execute it on the §2 strategy
   (leave the three seeded pools alone)

---

## Failure-safe fallbacks

- **Slow indexing:** the freshness badge says how far behind it is. Show the tx on BaseScan
  and cut back once it catches up.
- **Tx failure:** show the decoded `RiptideErrorDisplay` and read the revert reason —
  `RiptideNoSurplus` on `/resolve` is working as intended, not a bug.
- **Public RPC throttling:** Base Sepolia's public RPC is load-balanced and read-heavy pages
  can hit a lagging node. Retry, or point `RPC_URL` at a dedicated endpoint.
- **Network issues:** keep a recording of a successful run as backup.

## Post-demo

Prove the deployment end to end. This generates two fresh wallets, walks every persona
through the same HTTP endpoints the browser uses, and writes a transaction ledger:

```bash
APP=https://riptide-web-production-77f7.up.railway.app node tools/demo/e2e-live.mjs
```

It needs `DEPLOYER_PRIVATE_KEY` for gas and the one owner-only feed call; everything else in
the run is permissionless. The last run is recorded in [`E2E_RUN.md`](E2E_RUN.md).
