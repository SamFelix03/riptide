# RIPTIDE

**An automated market maker on [1inch Aqua](https://github.com/1inch/aqua) and [SwapVM](https://github.com/1inch/swap-vm) that charges for, and takes back, the money that liquidity providers normally lose to arbitrage.**

**[▶ Open the live app](https://riptide-web-production-77f7.up.railway.app)** · [Contracts and addresses](#deployed-addresses) · [How it actually works](#part-ii--how-it-works-under-the-hood)

---

## Important links

| | |
|---|---|
| **Live app** | https://riptide-web-production-77f7.up.railway.app |
| **Demo video** | _coming soon_ |
| **Network** | Base Sepolia (chain `84532`) — [explorer](https://sepolia.basescan.org) |
| **Subgraph** | [Graph Studio endpoint](https://api.studio.thegraph.com/query/1758400/riptide/version/latest) |
| **Deployment manifest** | [`deployments/84532.json`](deployments/84532.json) — the single source of truth for every address |

**Contracts on BaseScan**

| Contract | What it is |
|---|---|
| [`RiptideSwapVMRouter`](https://sepolia.basescan.org/address/0xf51E8b2f5958Ca7702076923d6F0135027e51B06) | Mechanism 1 — the Aqua app + SwapVM router for taker swaps |
| [`RiptideRebalanceRouter`](https://sepolia.basescan.org/address/0x65e70C18845b411D456af79306609B474Da9eaAA) | Mechanism 2 — hosts the custom rebalance instruction (opcode 34) |
| [`RiptideLvrFeeProvider`](https://sepolia.basescan.org/address/0x188dC95578f7feE2639473DA75427c468ADCe395) | The `IProtocolFeeProvider` 1inch SwapVM staticcalls for the live fee |
| [`RiptideVolatilityOracle`](https://sepolia.basescan.org/address/0xDc44dE5E0c704511aa5073337B93E0478c563251) | On-chain EWMA volatility estimator (σ) |
| [`RiptideBatchExecutor`](https://sepolia.basescan.org/address/0x7F36E1D8A0373cC6244D87816F238f43Db424415) | Atomic multi-maker taker settlement |
| [`RiptideAuctionSettler`](https://sepolia.basescan.org/address/0x254DCF81bC0D6116b2e2421D252b9D47Efee2071) | Permissionless rebalance settlement entrypoint |
| [`Aqua`](https://sepolia.basescan.org/address/0xa6e7714D9956D88C4f26C19a481b12bB60B90Ed2) | 1inch Aqua v1.0.0 (unmodified) — holds every maker allowance |

[Full address table, including kernel, quoter, lens, demo tokens and the mock feed →](#deployed-addresses)

**Specifications** — read in this order

| Doc | Owns |
|---|---|
| [`contracts/README.md`](contracts/README.md) | **Contract-by-contract walkthrough** — every contract, both SwapVM program byte layouts, access control, invariants |
| [`docs/TEST_GUIDE.md`](docs/TEST_GUIDE.md) | **Run it yourself** — local Anvil setup and how to exercise every feature |
| [`docs/E2E_RUN.md`](docs/E2E_RUN.md) | **Proof it works** — every transaction from one end-to-end run against the live app, with the assertions each one satisfies |
| [`subgraph/README.md`](subgraph/README.md) | **The Graph integration** — what is indexed, which Graph features are used, and why it is load-bearing |
| [`docs/INDEX.md`](docs/INDEX.md) | Map of the whole spec set |
| [`docs/SOURCES.md`](docs/SOURCES.md) | The honesty ledger: what was verified, what was kept, what was scrapped and why |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | The product and protocol end to end |
| [`docs/LVR_MATH.md`](docs/LVR_MATH.md) | Every normative equation, unit and rounding rule |
| [`docs/SWAPVM_INTEGRATION.md`](docs/SWAPVM_INTEGRATION.md) | How the maths becomes SwapVM bytecode over Aqua |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Every contract, event, error and invariant |
| [`docs/SYSTEM.md`](docs/SYSTEM.md) | Component inventory, flows, deployment |
| [`docs/UI.md`](docs/UI.md) | Every page and the per-persona user stories |
| [`docs/DIFF_ORACLE.md`](docs/DIFF_ORACLE.md) | The Python differential oracle and the committed vectors |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Traceability matrix — no feature without a reference |
| [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md) | The demo script |

**Build & operations notes**

| Doc | Owns |
|---|---|
| [`RESOLUTIONS.md`](RESOLUTIONS.md) | What was actually decided at build time — **authoritative where it disagrees with `docs/`** |
| [`DEPENDENCY_LOCK.md`](DEPENDENCY_LOCK.md) | Pinned 1inch/OZ/Solady commits, licences, toolchain versions |
| [`ENV.md`](ENV.md) | Environment variables and operator overrides |
| [`LN_EXP_BOUNDS.md`](LN_EXP_BOUNDS.md) | Solady ln/exp/pow domains used on-chain |
| [`deployments/README.md`](deployments/README.md) | Manifest schema and redeploy recipes |

**Research** — [arXiv:2208.06046](https://arxiv.org/abs/2208.06046) ([PDF](docs/LVR_PAPER.pdf)) · [arXiv:2210.10601](https://arxiv.org/abs/2210.10601) ([PDF](docs/DIAMOND_LVR.pdf)) · [arXiv:2305.14604](https://arxiv.org/abs/2305.14604) ([PDF](docs/FEESvLVR.pdf))

---

## Introduction

If you put money into a normal AMM pool — Uniswap, a Curve pool, anything with a fixed curve — you are running a market-making business whether you meant to or not. You quote a price. Someone trades against it. You collect a fee.

The problem is that your price is always slightly out of date. The moment the real price of ETH moves on Binance, your pool is still quoting the old price. Someone notices in a few hundred milliseconds and trades against your stale quote. They make money. That money comes out of your pocket.

This is not a bug and it is not front-running. It is the normal, permanent cost of quoting a price you cannot update fast enough. It has a name — **Loss-Versus-Rebalancing**, or LVR — and since 2022 there has been a precise formula for how much it costs you.

RIPTIDE is one pool design that does two things about it: it **prices** that cost into the fee, and it **sells the right to correct the stale price** instead of letting it be taken for free.

---

## The problem, concretely

Say you provide liquidity to an ETH/USDC pool. Over a year:

- You earn trading fees from ordinary traders — people swapping because they want to swap.
- You lose money to arbitrageurs — people swapping *only* because your price is stale.

Whether you come out ahead is simply whether the first number beats the second. The 2022 LVR paper made this exact rather than vibes-based. For a constant-product pool, the rate you leak to arbitrage is:

```
LVR rate  =  σ² / 8   of the pool's value, per unit time
```

where `σ` is the volatility of the asset. At 100% annualised volatility, that is **one eighth of the pool's value per year**, flowing to arbitrageurs, before you collect a single fee.

Two things follow, and almost every AMM ignores both:

1. **A fixed fee is the wrong instrument.** Your cost is proportional to `σ²`, which moves constantly. A flat 30 bps fee overcharges traders on quiet days and badly undercharges on volatile ones — exactly when you need the money.

2. **The arbitrage profit is not a law of nature — it is an auction you are not running.** When your pool is stale, there is a known, quantifiable amount of money sitting on the table. Today it goes to whoever pays the highest priority fee. It could instead go to whoever pays *you* the most for the right to take it.

## The research we built on

Three papers, all included in this repository as PDFs and audited in [`docs/SOURCES.md`](docs/SOURCES.md). Nothing in RIPTIDE's economics is invented; these supply the numbers.

| Paper | What we take from it |
|---|---|
| **Automated Market Making and Loss-Versus-Rebalancing** — Milionis, Moallemi, Roughgarden, Zhang. [arXiv:2208.06046](https://arxiv.org/abs/2208.06046) · [local PDF](docs/LVR_PAPER.pdf) | The definition and closed form of the cost. `ℓ(σ,P) = (σ²P²/2)·\|x*′(P)\|`, and for a constant-product pool `ℓ/V = σ²/8`. Also the identity that decides everything: **LP value − rebalancing value = fees − accumulated LVR.** |
| **An Automated Market Maker Minimizing Loss-Versus-Rebalancing** ("Diamond") — McMenamin, Daza, Mazorra. [arXiv:2210.10601](https://arxiv.org/abs/2210.10601) · [local PDF](docs/DIAMOND_LVR.pdf) | The recapture result. If you auction the rebalancing right and keep a fraction `β`, the LVR that escapes to arbitrageurs is bounded: `E[LVR to arbitrageurs] ≤ (1−β)·L`. Their simulations use `β = 0.95`. |
| **Automated Market Making and Arbitrage Profits in the Presence of Fees** — Milionis, Moallemi, Roughgarden. [arXiv:2305.14604](https://arxiv.org/abs/2305.14604) · [local PDF](docs/FEESvLVR.pdf) | The principle that the fee is the instrument that offsets LVR, and that there is an interior optimum — too low and you bleed to arbitrage, too high and the flow leaves. We take the *principle*, not a closed-form constant. |

Two standard engineering techniques come from outside that set and are labelled as such throughout: EWMA/RiskMetrics volatility estimation and Garman–Klass range estimation, and a clamped PI feedback controller. These are estimation and control mechanics, not economic claims. See [`docs/SOURCES.md` §5](docs/SOURCES.md).

Papers we deliberately did **not** use — FM-AMM, general convex CFMM routing, payoff replication, LP hedging, options-on-LP — are listed with a written reason for each in [`docs/SOURCES.md` §4](docs/SOURCES.md). The filter was usefulness to this product, not difficulty.

---

## What we built

A RIPTIDE strategy is an ordinary constant-product pool — `x · y = k`, nothing exotic — with two control layers wrapped around it.

### Mechanism 1 — a fee that tracks volatility

The fee is not a number the maker guesses. An on-chain controller reads a live volatility estimate and steers the fee toward the break-even point where expected fee revenue covers expected LVR:

```
break-even fee  φ*  =  (σ̂² / 8) / λ        →  clamped into [feeMin, feeMax]
                                            →  PI controller steps toward it
```

Volatile market, higher fee. Calm market, lower fee. From a trader's point of view it is just a protocol fee that happens to be current, delivered through 1inch's existing fee instruction — **we added no new fee opcode**.

Math: [`docs/LVR_MATH.md` §4](docs/LVR_MATH.md) · Code: [`FeeController.sol`](contracts/src/libraries/FeeController.sol) and [`RiptideLvrFeeProvider.sol`](contracts/src/fees/RiptideLvrFeeProvider.sol)

### Mechanism 2 — auction the stale price instead of donating it

When the external price gaps, the pool is mispriced and there is arbitrage value available. Instead of letting the mempool take it:

- The strategy opens a **declining-price Dutch auction** for the right to rebalance the pool.
- Resolvers compete; competition drives the fill to where the resolver's margin is thin.
- On settlement the contract measures the actual surplus `S`, pays the resolver `⌊(1−β)·S⌋` and **leaves at least `β·S` with the liquidity provider**.
- A reverse swap immediately afterward is penalised, so nobody can sandwich the rebalance.

With `β = 0.95`, at most about 5% of the arbitrage value leaves; the rest stays with the LP.

Math: [`docs/LVR_MATH.md` §5](docs/LVR_MATH.md) · Code: [`RiptideRebalanceModule.sol`](contracts/src/core/RiptideRebalanceModule.sol), [`DiamondSplit.sol`](contracts/src/libraries/DiamondSplit.sol)

### The loop between them

A resolver only bids when rebalancing is genuinely profitable, so the price it pays is a price somebody *actually put money behind*. That price is fed back into the volatility oracle, which moves the next fee target. The fee is partly calibrated by prices that were paid for rather than merely reported.

This is a design property, not a theorem, and is labelled that way everywhere it appears — [`docs/LVR_MATH.md` §6](docs/LVR_MATH.md).

---

## Who this is for, and what they actually get

**Liquidity providers / market makers — the people this is built for.**
You keep your tokens in your own wallet. Aqua holds an allowance record, not your money, so there is no vault to trust and no LP share token. You set a fee band and a retention parameter `β`, and then two things happen automatically that don't happen in a normal pool: your fee rises when volatility rises (so you're charging more precisely when you're losing more), and when the price gaps, the profit from re-pricing your pool is auctioned and most of it comes back to you instead of going to a searcher. The [Strategy Manager](apps/web/src/app/positions/page.tsx) shows you the number that matters: cumulative value recaptured.

**Traders.** You get a quote where the fee and the volatility that produced it are both shown before you sign. The fee is not retroactive and not hidden. Your order is split across makers by a solver and settles atomically — if any part fails, the whole thing reverts and you keep your funds.

**Resolvers / searchers.** A new, legible source of flow. Instead of racing in the mempool for uncertain profit, you can see open auctions with their current price, preview your exact take `⌊(1−β)·S⌋` before committing, and settle through a permissionless entry point. If the trade has no genuine surplus, the contract refuses it — which protects you from a bad fill as much as it protects the maker.

**Analysts and researchers.** Every claim in this repository is traceable. The recapture dashboard links each headline number to the on-chain event that produced it and states the indexed block, and an honesty panel marks which claims are verified on-chain versus validated by simulation.

**Who this is not for:** anyone wanting a managed or hedged vault, exotic payoffs, or a new market design. RIPTIDE keeps the plain constant-product curve on purpose. Non-goals are enumerated in [`docs/PROTOCOL.md` §18](docs/PROTOCOL.md).

---

## Reading the code, and running it

**How RIPTIDE is built on 1inch.** Aqua is the custody layer: makers keep tokens in their own wallets, Aqua holds allowance records, and RIPTIDE's routers are registered as Aqua *apps* that `pull`/`push` against a maker's ledger entry. No RIPTIDE contract ever holds inventory. SwapVM is the execution layer: a strategy *is* a bytecode program, and RIPTIDE emits two of them — a 41-byte swap program built entirely from upstream opcodes (`Deadline → aquaDynamicProtocolFee → XYCSwap → Salt`), and a 66-byte rebalance program that adds two RIPTIDE instructions. The dynamic fee needs no new opcode at all: it is 1inch's existing `IProtocolFeeProvider` hook, answered by a contract that reads an on-chain volatility estimate. Everything compiles against `swap-vm@v1.0.2` and `aqua@v1.0.0` — the releases actually deployed on mainnet — and `@1inch/aqua-sdk` builds all Aqua calldata. Details, including why we deploy our own slimmed routers and why the swap-vm SDK is unused: [§2.1](#21-which-1inch-packages-we-use-and-how).

**[`contracts/README.md`](contracts/README.md) — what each contract does.** A walkthrough of all 35 source files with line references: both program byte layouts instruction by instruction, the fee provider's determinism guarantee, the β-split maths, the router/module trust chain, the 226-byte payload format, the full access-control table, and the invariant suite.

**[`docs/TEST_GUIDE.md`](docs/TEST_GUIDE.md) — run the whole thing locally. Start here if you want to verify any claim in this README yourself.** From a clean clone to both mechanisms settling on a local Anvil chain, in three terminals. Covers the test suite and its negative controls, exercising each mechanism through scripts, driving the self-reinforcing loop by hand, the off-chain services, and a short section on verifying the 1inch integration specifically.

---

## Deployed addresses

**Base Sepolia (chain 84532)** — manifest: [`deployments/84532.json`](deployments/84532.json) · explorer: [sepolia.basescan.org](https://sepolia.basescan.org)

| Contract | Address |
|---|---|
| Aqua | [`0xa6e7714D9956D88C4f26C19a481b12bB60B90Ed2`](https://sepolia.basescan.org/address/0xa6e7714D9956D88C4f26C19a481b12bB60B90Ed2) |
| RiptideSwapVMRouter | [`0xf51E8b2f5958Ca7702076923d6F0135027e51B06`](https://sepolia.basescan.org/address/0xf51E8b2f5958Ca7702076923d6F0135027e51B06) |
| RiptideRebalanceRouter | [`0x65e70C18845b411D456af79306609B474Da9eaAA`](https://sepolia.basescan.org/address/0x65e70C18845b411D456af79306609B474Da9eaAA) |
| RiptideRebalanceKernel | [`0x8e9c8f4123dAfE31421Ef31efb2D24c039C504d2`](https://sepolia.basescan.org/address/0x8e9c8f4123dAfE31421Ef31efb2D24c039C504d2) |
| RiptideVolatilityOracle | [`0xDc44dE5E0c704511aa5073337B93E0478c563251`](https://sepolia.basescan.org/address/0xDc44dE5E0c704511aa5073337B93E0478c563251) |
| RiptideLvrFeeProvider | [`0x188dC95578f7feE2639473DA75427c468ADCe395`](https://sepolia.basescan.org/address/0x188dC95578f7feE2639473DA75427c468ADCe395) |
| RiptideAuctionSettler | [`0x254DCF81bC0D6116b2e2421D252b9D47Efee2071`](https://sepolia.basescan.org/address/0x254DCF81bC0D6116b2e2421D252b9D47Efee2071) |
| RiptideQuoter | [`0x0849a81fA8976e3d391d3F6AC8ed23Ac1E4e017A`](https://sepolia.basescan.org/address/0x0849a81fA8976e3d391d3F6AC8ed23Ac1E4e017A) |
| RiptideLens | [`0x3c5Cc60D38858865D947fd268d453bB219dbbEa8`](https://sepolia.basescan.org/address/0x3c5Cc60D38858865D947fd268d453bB219dbbEa8) |
| RiptideBatchExecutor | [`0x7F36E1D8A0373cC6244D87816F238f43Db424415`](https://sepolia.basescan.org/address/0x7F36E1D8A0373cC6244D87816F238f43Db424415) |
| Demo tokens | RBASE [`0xCd75c96a6659d94004EFBe528D95eAF933A916be`](https://sepolia.basescan.org/address/0xCd75c96a6659d94004EFBe528D95eAF933A916be) · RQUOTE [`0x5A2858D733295000199CA9030e4A094e9E9EF846`](https://sepolia.basescan.org/address/0x5A2858D733295000199CA9030e4A094e9E9EF846) |
| Mock Chainlink feed | [`0x92a149C90d5C43DF299F9db5F8F3c3cC7C7Edd0D`](https://sepolia.basescan.org/address/0x92a149C90d5C43DF299F9db5F8F3c3cC7C7Edd0D) |

Deployed at block `46742718`. Subgraph: [`riptide` on Graph Studio](https://api.studio.thegraph.com/query/1758400/riptide/version/latest).

Three strategies are seeded and live, each with a different fee/auction policy:

| | Maker | `feeMin` | `feeMax` | `beta` | Auction |
|---|---|---|---|---|---|
| S1 | [`0xddDe7a54E430B1D85d24956156867fCe2407dC25`](https://sepolia.basescan.org/address/0xddDe7a54E430B1D85d24956156867fCe2407dC25) | 10_000 (0.1%) | 50_000 | 0.97 | 7200s, decay 0.995 |
| S2 | [`0xad5f8F512C9CD73c74B274D9e84e431ac631ED3C`](https://sepolia.basescan.org/address/0xad5f8F512C9CD73c74B274D9e84e431ac631ED3C) | 30_000 (0.3%) | 500_000 | 0.95 | 3600s, decay 0.99 |
| S3 | [`0x9f7f68976C876DA2656FB835b051DE31Fc5863E6`](https://sepolia.basescan.org/address/0x9f7f68976C876DA2656FB835b051DE31Fc5863E6) | 50_000 (0.5%) | 800_000 | 0.90 | 1800s, decay 0.98 |

**Note on Aqua provenance.** 1inch has no Base Sepolia deployment, so the demo deploys its **own instance of the unmodified official `@1inch/aqua` v1.0.0 `Aqua.sol`** ([`RiptideDeployer.sol:38`](contracts/script/RiptideDeployer.sol#L38)). Integration against the *real* 1inch mainnet deployment is proven separately by the mainnet fork test above. Anvil manifest: [`deployments/31337.json`](deployments/31337.json).

---

## Repository map

```
contracts/          Foundry project — 35 source files, 45 test files, 120 tests
  src/types/          RiptideTypes, RiptideErrors            shared structs + 30 named errors
  src/libraries/      WadMulDiv, LnExpMath, CpmmMath,        the math layer
                      VolatilityMath, LvrMath, FeeController,
                      DiamondSplit, DutchPow
  src/oracle/         RiptideVolatilityOracle                EWMA/GK realized-vol estimator
  src/fees/           RiptideLvrFeeProvider                  Mechanism 1 — IProtocolFeeProvider
  src/core/           RiptideSwapVMRouter                    Mechanism 1 router (Aqua app)
                      RiptideRebalanceRouter + Module        Mechanism 2 router + logic
                      RiptideRebalanceKernel                 stateless surplus/β/auction math
                      RiptideStrategyCodec                   226-byte payload codec
                      RiptideSwapOpcodes / RiptideOpcodes    instruction tables
                      RiptideAuctionSchedule                 RIPTIDE declining-price schedule
                      RiptideMakerTraits                     MakerTraits packing
  src/periphery/      Quoter, Lens, AuctionSettler, BatchExecutor
  script/             deploy, seed, ship, dock, rebalance, batchExecute, demo
  lib/                pinned 1inch submodules (swap-vm v1.0.2, aqua v1.0.0)

packages/
  riptide-math/       exact TypeScript mirror of the on-chain math
  strategy-sdk/       payload encode/decode, policyHash / strategyKey / marketId
  contracts/          generated ABIs, deployment manifest loader, network config
  solver-core/        pure taker route optimiser + subgraph/RPC discovery
  resolver-core/      pure rebalance evaluator (surplus, β-split, timing)
  frontend-api/       framework-neutral UI gateway + deterministic mock

services/
  solver-api/         HTTP :8081 — discover, quote, optimise, simulate, return calldata
  resolver-bot/       :8082 — watches auctions, settles profitable rebalances
  vol-indexer/        :8083 — publishes price observations to the oracle
  liquidity-mcp/      :8084 — MCP server exposing executable-liquidity tools

subgraph/             The Graph — 13 entities, 6 datasources, matchstick tests
apps/web/             Next.js 15 — 6 pages, one per persona
tools/reference/      Python differential oracle (stdlib Decimal, no deps)
test/vectors/         6 committed JSON vector files — the shared source of truth
docs/                 9 normative specs + 3 research PDFs
```

Specification set, in reading order: [`SOURCES.md`](docs/SOURCES.md) → [`PROTOCOL.md`](docs/PROTOCOL.md) → [`LVR_MATH.md`](docs/LVR_MATH.md) → [`SWAPVM_INTEGRATION.md`](docs/SWAPVM_INTEGRATION.md) → [`CONTRACTS.md`](docs/CONTRACTS.md) → [`SYSTEM.md`](docs/SYSTEM.md) → [`UI.md`](docs/UI.md) → [`DIFF_ORACLE.md`](docs/DIFF_ORACLE.md) → [`FEATURES.md`](docs/FEATURES.md). Index: [`docs/INDEX.md`](docs/INDEX.md).

---
---

# Part II — How it works under the hood

Everything below is mechanical. Every claim cites the file and line that implements it.

## 1. Architecture

```mermaid
flowchart TB
  subgraph maker["MAKER"]
    W["Maker wallet<br/>(tokens never leave)"]
  end
  subgraph aqua["1inch AQUA"]
    A["Aqua registry<br/>allowance records, no custody"]
  end
  subgraph riptide["RIPTIDE (SwapVM programs)"]
    SR["RiptideSwapVMRouter<br/>Mechanism 1"]
    RR["RiptideRebalanceRouter<br/>Mechanism 2"]
    FP["RiptideLvrFeeProvider<br/>PI controller"]
    OR["RiptideVolatilityOracle<br/>EWMA σ"]
    KN["RiptideRebalanceKernel<br/>surplus + β split"]
  end
  subgraph off["OFF-CHAIN (untrusted)"]
    SA["solver-api"]
    RB["resolver-bot"]
    VI["vol-indexer"]
    SG["subgraph"]
  end

  W -- "approve + ship" --> A
  A -- "safeBalances" --> SR
  A -- "safeBalances" --> RR
  SR -- "staticcall getFeeBpsAndRecipient" --> FP
  FP -- "sigmaWad" --> OR
  RR -- "splitSurplus" --> KN
  RR -- "pull (1-β)S to resolver" --> A
  RR -- "observe revealed price" --> OR
  OR -. "the loop: new σ moves next fee" .-> FP
  SA --> SR
  RB --> RR
  VI --> OR
  SR --> SG
  RR --> SG
```

The trust boundary is the important part. Everything in the off-chain box can propose a bad route, a losing bid, or a stale estimate — and none of it can move maker inventory, settle a loss-making rebalance, or make the settled fee differ from the quoted fee. The contracts recompute everything. See [`docs/PROTOCOL.md` §12](docs/PROTOCOL.md).

## 2. How Aqua is used

Aqua is a shared-liquidity registry: it holds **allowance records**, not tokens. A maker approves Aqua once and distributes virtual balances across strategies; the real tokens stay in the maker's wallet until pulled during a trade. RIPTIDE's routers are registered as Aqua *apps*.

All five primitives are load-bearing ([`IAqua.sol`](contracts/lib/aqua/src/interfaces/IAqua.sol)):

| Primitive | Where RIPTIDE uses it |
|---|---|
| `ship(app, strategy, tokens, amounts) → strategyHash` | Maker publishes a strategy. Called from the maker's own wallet — [`RiptideSeedLib.sol:136`](contracts/script/RiptideSeedLib.sol#L136) and the web ship plan. RIPTIDE contracts never call it. |
| `safeBalances(maker, app, strategyHash, t0, t1)` | Every quote and swap. SwapVM seeds `balanceIn`/`balanceOut` from it before running the program; RIPTIDE re-reads it for telemetry at [`RiptideSwapVMRouter.sol:107`](contracts/src/core/RiptideSwapVMRouter.sol#L107) and in [`RiptideLens.sol`](contracts/src/periphery/RiptideLens.sol). Never cached. |
| `pull(maker, strategyHash, token, amount, to)` | Swap output to the taker; the **β rebate to the resolver** — [`RiptideRebalanceRouter.sol:81`](contracts/src/core/RiptideRebalanceRouter.sol#L81); and the protocol fee, pulled by SwapVM itself. |
| `push(maker, app, strategyHash, token, amount)` | Taker input credited to the maker's strategy, via SwapVM's `_transferIn` when the taker traits set `useTransferFromAndAquaPush`. |
| `dock(app, strategyHash, tokens)` | Maker cancels and releases balances — [`dock.s.sol:40`](contracts/script/dock.s.sol#L40). |

**There is no RIPTIDE vault.** No contract in `contracts/src/` ever holds maker inventory.

## 2.1 Which 1inch packages we use, and how

| Package | Version | How RIPTIDE uses it |
|---|---|---|
| `1inch/swap-vm` (Solidity) | `v1.0.2` — tag `32c687c2`, on `release/1.0.2` | Compiled against directly. Both routers inherit the `SwapVM` base and reuse `XYCSwap`, `Decay`, `Controls`, `Fee` and `Power` unmodified. |
| `1inch/aqua` (Solidity) | `v1.0.0` | The custody layer. All five primitives are load-bearing. |
| `@1inch/aqua-sdk` (npm) | `0.3.4` | **Used in production.** All Aqua `ship`/`dock` calldata and `strategyHash` go through `AquaProtocolContract` — see [`packages/strategy-sdk/src/aqua.ts`](packages/strategy-sdk/src/aqua.ts). |
| `@1inch/swap-vm-sdk` (npm) | `0.4.4` | Installed, **not used** — see below. |

v1.0.2 is the release 1inch has actually deployed to mainnets; nothing here compiles against `main`.

**Why we deploy our own routers rather than `AquaSwapVMRouter`.** 1inch's guidance is to avoid the all-opcodes `SwapVMRouter` (it does not fit EIP-170) and use the AMM-oriented `AquaSwapVMRouter` instead. RIPTIDE needs a custom instruction, so it builds two slimmed routers on the same `SwapVM` base, each wiring a reduced opcode table at the canonical `AquaOpcodes` runtime indices. The swap program that results is still a plain Aqua-AMM program: [`StockAquaRouterCompat.t.sol`](contracts/test/fork/StockAquaRouterCompat.t.sol) ships it to a **stock, unmodified `AquaSwapVMRouter`** and asserts it prices identically to ours, to the wei.

**Why the swap-vm SDK is installed but unused.** Two independent blockers. Its ESM build is broken — `index.mjs` deep-imports `@1inch/byte-utils/dist/constants`, and that package publishes no `exports` map, which Node's ESM resolver rejects — so it is not importable from this all-ESM workspace. And even via CJS its order model cannot represent a RIPTIDE order: we commit the 226-byte policy payload by pointing the MakerTraits program slice at byte 226, which `MakerTraitsLib.build` never emits and the SDK normalises away. Re-encoding a live order through `Order.encode()` returns 224 bytes instead of 448 — it drops the payload and changes the strategy hash. Order construction therefore stays with RIPTIDE's own codec.

## 3. SwapVM: how a RIPTIDE strategy becomes bytecode

### 3.1 The three byte layers

SwapVM executes a **program** — a sequence of instructions, each encoded as:

```
[opcode : 1 byte][argsLength : 1 byte][args : N bytes]
```

RIPTIDE packs three distinct things into one order ([`docs/SWAPVM_INTEGRATION.md` §1](docs/SWAPVM_INTEGRATION.md)):

```
order.data   = [ 226-byte RIPTIDE payload ][ program bytes ]
order.traits = (1 << 254) | (226 << 208)
order.maker  = maker
```

- `1 << 254` is `USE_AQUA_INSTEAD_OF_SIGNATURE_BIT_FLAG` — it tells SwapVM to authorise via Aqua rather than a signature, and to seed reserves from `safeBalances`.
- `226 << 208` writes the program start offset into MakerTraits slice index 3, so `MakerTraitsLib.program(traits, data)` returns `data[226:]`.

Implemented in [`RiptideMakerTraits.sol:14-20`](contracts/src/core/RiptideMakerTraits.sol#L14-L20), frozen by [`MakerTraitsFreeze.t.sol`](contracts/test/unit/MakerTraitsFreeze.t.sol).

Because the Aqua trait is set, `SwapVM.hash(order)` is plain `keccak256(abi.encode(order))` — the same value Aqua computes as `strategyHash`. That identity is what makes `safeBalances(maker, router, orderHash, …)` resolve. It also means **any change to the payload, program, or auction start produces a different Aqua position.**

### 3.2 The 226-byte payload

Fixed-length, packed big-endian, magic `RPT1` (`0x52505431`). Encoded and validated by [`RiptideStrategyCodec.sol`](contracts/src/core/RiptideStrategyCodec.sol), mirrored bit-for-bit in TypeScript ([`strategy-sdk/src/codec.ts`](packages/strategy-sdk/src/codec.ts)) and Python ([`tools/reference/payload_codec.py`](tools/reference/payload_codec.py)).

| Offset | Bytes | Field |
|---:|---:|---|
| 0 | 4 | magic `RPT1` |
| 4 | 1 | version = 1 |
| 5 / 25 | 20 / 20 | `baseToken` / `quoteToken` |
| 45 | 32 | `salt` |
| 77 / 93 | 16 / 16 | `reserveBaseWad` / `reserveQuoteWad` |
| 109 / 112 | 3 / 3 | `feeMin` / `feeMax` |
| 115…162 | 8 × 6 | `lambda`, `kp`, `ki`, `iMax`, `sigmaMin`, `sigmaMax` |
| 163 / 171 / 173 / 181 | 8 / 2 / 8 / 2 | `beta`, `duration`, `decay`, `antiSandwichPeriod` |
| 183 / 203 / 204 | 20 / 1 / 2 | oracle `feed`, `decimals`, `maxStaleness` |
| 206 | 20 | `feeProvider` |
| **226** | | total |

`maker` is deliberately **not** in the payload — identity lives in the order envelope, and `decode` returns `address(0)` for it ([`RiptideStrategyCodec.sol:47`](contracts/src/core/RiptideStrategyCodec.sol#L47)).

`validateStructure` ([`:72-92`](contracts/src/core/RiptideStrategyCodec.sol#L72-L92)) rejects zero/identical tokens, `feeMin == 0`, `feeMin ≥ feeMax`, `feeMax ≥ BPS`, and `lambda`/`beta`/`decay` outside `(0,1)`. **Decoding is never authorisation** — every runtime path re-reads live Aqua balances.

Three identifiers, never interchangeable:

```
policyHash   = keccak256(payload)                            SDK/audit identity
strategyHash = keccak256(abi.encode(order))                  Aqua commitment
strategyKey  = keccak256(abi.encode(maker, salt))            router runtime key
marketId     = keccak256(abi.encode(DOMAIN, base, quote))    direction-sensitive
```

### 3.3 Opcode indices — a subtle detail worth knowing

SwapVM dispatches on an index into a function-pointer array. `AquaOpcodes._opcodes()` builds a fixed 35-element array and converts it to a dynamic one by writing the length into slot 0 with assembly — **overwriting element 0**. So the runtime dispatch index is one *less* than the source position.

RIPTIDE freezes the resulting indices in [`RiptideConstants.sol`](contracts/src/core/RiptideConstants.sol):

| Index | Instruction | Source |
|---:|---|---|
| 13 | `Controls._deadline` | upstream |
| 17 | `XYCSwap._xycSwapXD` (constant product) | upstream |
| 19 | `Decay._decayXD` (anti-sandwich) | upstream |
| 20 | `Controls._salt` | upstream |
| 30 | `Fee._aquaDynamicProtocolFeeAmountInXD` | upstream — **Mechanism 1** |
| **34** | **`_riptideRebalanceOpcode`** | **RIPTIDE — the custom instruction** |
| 35 / 36 | `_dutchAuctionBalanceIn1D` / `Out1D` | copied from upstream |

Rather than trusting the constants, [`OpcodeIndexProbe.t.sol`](contracts/test/unit/OpcodeIndexProbe.t.sol) resolves them from the *real* dispatch table at runtime — the guard against silent upstream renumbering.

The two routers each build their own reduced table ([`RiptideSwapOpcodes.sol:30-41`](contracts/src/core/RiptideSwapOpcodes.sol#L30-L41), [`RiptideOpcodes.sol:16-29`](contracts/src/core/RiptideOpcodes.sol#L16-L29)), omitting unused upstream mixins. This is what keeps them deployable: `RiptideSwapVMRouter` measures **24,548 bytes against the 24,576-byte EIP-170 cap** — 28 bytes of headroom, asserted in CI by [`DeploySeed.t.sol`](contracts/test/script/DeploySeed.t.sol).

### 3.4 The swap program (Mechanism 1) — 41 bytes

Built by [`RiptideSwapVMRouter._buildSwapProgram:125-132`](contracts/src/core/RiptideSwapVMRouter.sol#L125-L132):

| # | Opcode | Byte | args |
|---|---|---|---|
| 1 | `Deadline` | `0x0D` | `uint40 deadline` |
| 2 | `aquaDynamicProtocolFee` | `0x1E` | `address feeProvider` |
| 3 | `XYCSwap` | `0x11` | — |
| 4 | `Salt` | `0x14` | `uint64 salt` |

Execution is **not** linear, because the fee instruction *wraps* the rest. `Fee._feeAmountIn` ([`Fee.sol:277-293`](contracts/lib/swap-vm/src/instructions/Fee.sol#L277-L293)) for exact-in: save `amountIn`, subtract the fee, call `ctx.runLoop()` — which executes the swap and salt with the *net* input — then restore. Afterwards `_tryPullFee` pulls the fee from the maker's Aqua ledger to the receiver. Real trace:

```
Deadline → Fee(pre) → XYCSwap → Salt → Fee(post) → AQUA.pull
```

Note the fee collection is **best-effort by upstream design**: `_tryPullFee` swallows failures and emits `ProtocolFeeSkipped` rather than reverting, so a one-sided maker position stays tradable.

### 3.5 The rebalance program (Mechanism 2) — 66 bytes

Built by [`RiptideRebalanceModule._buildRebalanceProgram:197-218`](contracts/src/core/RiptideRebalanceModule.sol#L197-L218):

| # | Opcode | Byte | args |
|---|---|---|---|
| 1 | `Deadline` | `0x0D` | `uint40 deadline` |
| 2 | `DutchAuctionBalanceIn` | `0x23` | `uint40 start ‖ uint16 duration ‖ uint64 decay` |
| 3 | `Decay` | `0x13` | `uint16 antiSandwichPeriod` |
| 4 | `XYCSwap` | `0x11` | — |
| 5 | **`RiptideRebalance`** | `0x22` | `uint64 beta ‖ uint128 staleInWad` |
| 6 | `Salt` | `0x14` | `uint64 salt` |

`Decay` also wraps, so the real trace is:

```
Deadline(13)
  DutchAuctionBalanceIn(35)          balanceIn *= decay^(now − auctionStart)
    Decay(19)  [wrapping]            anti-sandwich virtual reserve offset
      XYCSwap(17)                    amountIn = ⌈out·balanceIn/(balanceOut − out)⌉
      RiptideRebalance(34)           surplus check → β split → Aqua pull
      Salt(20)
    Decay(19)  [post]                record new offsets
```

**`Deadline` is deliberately first.** An expired auction reverts before any balance is touched — asserted as invariant V5 by [`V5DeadlineFirst.t.sol`](contracts/test/invariant/V5DeadlineFirst.t.sol), with a negative control ([`BrokenRebalanceProgram.sol`](contracts/test/negative/BrokenRebalanceProgram.sol)) that moves it last and must fail.

## 4. Mechanism 1 in detail — the volatility-indexed fee

### 4.1 The chain of custody for one fee number

```
price observation → RiptideVolatilityOracle (EWMA) → σ
σ → FeeController.feeTarget → clamp → PI step → feeReported
feeReported → RiptideLvrFeeProvider.getFeeBpsAndRecipient  ← SwapVM staticcalls this
```

### 4.2 Volatility estimation — on-chain

Everything runs in Solidity. [`RiptideVolatilityOracle.sol`](contracts/src/oracle/RiptideVolatilityOracle.sol) per strategy:

```
ratio     = priceWad · WAD / lastPriceWad
logReturn = ln(ratio)                                    LnExpMath.lnWad
dt        = (initialized && ts > lastObsTs) ? ts − lastObsTs : 1
varNext   = λ·prevVar + (1−λ)·(logReturn² [+ gkTerm])    VolatilityMath.ewmaVar
σcand     = sqrt(varNext · WAD / dt)  clamped to [σmin, σmax]
σnext     = isStale ? σprev : σcand                      stale freeze
```

[`VolatilityMath.sol:12-53`](contracts/src/libraries/VolatilityMath.sol#L12-L53). The Garman–Klass term is `0.5·ln(H/L)² − (2ln2 − 1)·ln(C/O)²`, clamped at zero.

**Determinism is the load-bearing property.** `observe` short-circuits when `isStatic` and writes nothing ([`:87-89`](contracts/src/oracle/RiptideVolatilityOracle.sol#L87-L89)) — proved with `vm.record`/`vm.accesses` in [`RiptideVolatilityOracle.t.sol`](contracts/test/unit/RiptideVolatilityOracle.t.sol). Only the rebalance router and the governed `volIndexer` key may observe at all (`onlyObserver`, [`:38-43`](contracts/src/oracle/RiptideVolatilityOracle.sol#L38-L43)).

### 4.3 The fee controller

[`FeeController.sol:23-41`](contracts/src/libraries/FeeController.sol#L23-L41):

```solidity
feeTarget(σ, λ, feeMin, feeMax):
    σ²      = σ·σ/WAD
    φ*      = σ²·WAD / (8·λ)          // break-even: LVR rate ÷ flow intensity
    raw     = φ*·BPS / WAD
    return clamp(raw, feeMin, feeMax)

piStep(state, target):
    e        = target − feeReported
    integral = clamp(integral + ki·e/WAD, ±iMax)          // anti-windup
    return clamp(feeReported + kp·e/WAD + integral, feeMin, feeMax)
```

Worked example, matching [`test/vectors/fee_controller_v1.json`](test/vectors/fee_controller_v1.json):

```
σ = 0.3e18, λ = 0.1e18  →  σ² = 9e16  →  φ* = 1.125e17  →  raw = 1_125_000  →  clamped to feeMax = 500_000
piStep(feeReported = 100_000, I = 0, kp = 0.5e18, ki = 0.1e18, target = 500_000):
   e = 400_000;  I = 40_000;  kp·e = 200_000  →  feeReported = 340_000
```

### 4.4 The provider — and why quote equals swap

[`RiptideLvrFeeProvider.getFeeBpsAndRecipient:79-99`](contracts/src/fees/RiptideLvrFeeProvider.sol#L79-L99) is `view` and writes **nothing**. It returns the *committed* `feeReported` and hard-guards the band, reverting `RiptideFeeOutOfRange` if the value ever escapes `[feeMin, feeMax] ⊂ (0, BPS)`.

The controller advances only **after** a swap settles ([`RiptideSwapVMRouter.sol:104`](contracts/src/core/RiptideSwapVMRouter.sol#L104)) or after a rebalance. So within a block, the fee a taker is quoted and the fee they are charged are the same number by construction — SwapVM invariant 3. Asserted by [`V3FeeDeterminism.t.sol`](contracts/test/invariant/V3FeeDeterminism.t.sol) with a negative control that mutates in static context and must fail.

### 4.5 Two fee scales, converted in one place

RIPTIDE denominates fees in `1e7 = 100%` throughout the payload, controller, committed vectors and UI. Pinned SwapVM v1.0.2 denominates protocol fees in `1e9 = 100%` ([`Fee.sol:17`](contracts/lib/swap-vm/src/instructions/Fee.sol#L17); `IProtocolFeeProvider` documents "1e9 = 100%"). `getFeeBpsAndRecipient` is the single boundary between the two, and scales by 100 there:

```solidity
uint32 internal constant SWAPVM_FEE_SCALE = 100; // 1e9 / 1e7
...
return (uint32(reported) * SWAPVM_FEE_SCALE, reg.receiver);
```

Remove that conversion and the VM charges 100× less than the controller intends, silently. Two tests exist to stop that: [`test_providerReturnsSwapVmScaledFee`](contracts/test/unit/RiptideLvrFeeProvider.t.sol) pins the boundary value, and [`test_vmFeeMatchesCpmmMathAtRiptideScale`](contracts/test/fork/Mechanism1.t.sol) asserts the amount the VM actually produces equals what RIPTIDE's own `CpmmMath` models.

## 5. Mechanism 2 in detail — the auction and the split

### 5.1 The declining-price schedule (a RIPTIDE instruction)

swap-vm splits its opcodes by curve shape. `AquaOpcodes` is the AMM group — non-linear curves, and what the deployed `AquaSwapVMRouter` dispatches. `LimitOpcodes` is the limit-order group, where exchange ratios are linear. `DutchAuction` lives in the **limit-order** group, and 1inch's own SDK mirrors the split: `AquaProgramBuilder` exposes no `dutchAuction*`, only `RegularProgramBuilder` does.

RIPTIDE is an AMM, so rather than borrow a limit-order opcode into an AMM router, the schedule is RIPTIDE's own instruction — [`RiptideAuctionSchedule.sol`](contracts/src/core/RiptideAuctionSchedule.sol). It is deliberately AMM-shaped: it only *scales a reserve register*, never prices a swap. `XYCSwap` still computes every amount from the constant-product curve; the schedule just shifts that curve over time. Its args layout matches the reference implementation byte for byte, so the migration to a RIPTIDE-owned instruction changed nothing about how the program executes — verified by [`Mechanism2.t.sol`](contracts/test/fork/Mechanism2.t.sol) and the V5 deadline invariant.


[`RiptideAuctionSchedule.sol:82-91`](contracts/src/core/RiptideAuctionSchedule.sol#L82-L91) shrinks the maker's demanded input over time:

```
balanceIn(t) = balanceIn · decay^(t − start) / WAD          decay < 1
revert if block.timestamp > start + duration
```

For an exact-out rebalance, `XYCSwap` computes `amountIn = ⌈out·balanceIn/(balanceOut − out)⌉`, so shrinking `balanceIn` **reduces** what the resolver must pay as the auction runs — and therefore the surplus decays toward zero. Resolvers race to be first at a price that is still profitable, which is exactly what pushes the fill toward thin margins.

### 5.2 Surplus and the β split

[`RiptideRebalanceModule.execute:125-180`](contracts/src/core/RiptideRebalanceModule.sol#L125-L180):

1. Decode `(beta, staleInWad)` from the 24-byte args. The resolver is **not** in the args — it is `ctx.query.taker`, read from the VM at execution time. Encoding it in the program would put it in the order hash, which would have meant only one pre-designated address could ever settle.
2. Resolve `strategyKey` from the order hash; unknown → `RiptideStrategyNotActive`.
3. `KERNEL.splitSurplus(amountIn, staleInWad, beta)` — **runs in static context too**, so a `quote()` of a no-surplus rebalance reverts exactly as `swap()` would.
4. Only when not static: pull the rebate, record the revealed price, advance the controller, bump the version, emit `RebalanceSettled`.

The split itself ([`DiamondSplit.sol:12-17`](contracts/src/libraries/DiamondSplit.sol#L12-L17)):

```
S             = executedIn − staleIn                 revert RiptideNoSurplus if negative
payToResolver = ⌊(WAD − β)·S / WAD⌋                  floored — rounding favours the maker
retainToLP    = S − payToResolver                    ≥ ⌊β·S⌋, exact conservation
```

`payToResolver` is paid with `AQUA.pull(maker, orderHash, tokenIn, amount, taker)` — the rebate follows whoever is settling. `retainToLP` needs no transfer — it is already in the maker's Aqua balance.

The baseline `staleIn` is what the *pre-rebalance* curve would have demanded, computed by [`RiptideRebalanceKernel.staleBaselineIn`](contracts/src/core/RiptideRebalanceKernel.sol). The no-surplus guard is what makes the auction safe: a malicious or losing bid cannot touch maker inventory, and this is enforced by on-chain arithmetic, not by a caller allow-list.

Settlement is genuinely permissionless. [`RiptideAuctionSettler.settleRebalance`](contracts/src/periphery/RiptideAuctionSettler.sol) can be called by any address: it pulls `maxIn` of the quote token from `msg.sender`, runs the auction order, then sweeps both legs back to `msg.sender` — the unspent quote plus the `β` rebate, and the `outWad` of base the resolver just bought. Nothing about the caller is committed in the order, so a wallet that has never touched this deployment can settle a live auction with no setup beyond an ERC20 approval. [`AuctionSettler.t.sol`](contracts/test/fork/AuctionSettler.t.sol) asserts both, including that an arbitrary address gets the same treatment as the demo resolver.

Verified by [`V1BetaSplit.t.sol`](contracts/test/invariant/V1BetaSplit.t.sol) (conservation and the `≥ β·S` floor, checked against the resolver's *actual* token delta, with an over-paying negative control) and [`V2NoSurplus.t.sol`](contracts/test/invariant/V2NoSurplus.t.sol).

### 5.3 Anti-sandwich

The upstream `Decay` instruction adds a virtual reserve offset against the reverse direction that decays over `antiSandwichPeriod`, so unwinding the rebalance immediately is penalised. Reused unchanged.

### 5.4 Closing the loop

After a successful rebalance the module computes the auction-clearing price from the *adjusted* registers and writes it to the oracle ([`_revealedPriceWad:192-195`](contracts/src/core/RiptideRebalanceModule.sol#L192-L195)), which moves σ, which moves the next `feeTarget`. End-to-end proof: [`test/integration/Loop.t.sol`](contracts/test/integration/Loop.t.sol) — rebalance, then assert σ moved, the controller fee moved, and the original swap order still quotes.

## 6. The math layer

WAD (`1e18`) fixed point. Every operation takes an explicit rounding direction; nothing truncates silently.

| Library | What it owns |
|---|---|
| [`WadMulDiv.sol`](contracts/src/libraries/WadMulDiv.sol) | 512-bit `mulDiv` (Remco/OZ algorithm) with `Down`=floor / `Up`=ceil; reverts on zero denominator or overflow |
| [`LnExpMath.sol`](contracts/src/libraries/LnExpMath.sol) | Checked `ln`/`exp`/`pow`/`sqrt` over Solady, with explicit domains and identity bypasses — bounds in [`LN_EXP_BOUNDS.md`](LN_EXP_BOUNDS.md) |
| [`CpmmMath.sol`](contracts/src/libraries/CpmmMath.sol) | `exactIn` floors both steps; `exactOut` ceils both — asymmetric on purpose |
| [`LvrMath.sol`](contracts/src/libraries/LvrMath.sol) | `ℓ = σ²·V/8` — the K1 CPMM specialisation |
| [`VolatilityMath.sol`](contracts/src/libraries/VolatilityMath.sol) | EWMA, Garman–Klass, σ clamp, stale freeze |
| [`FeeController.sol`](contracts/src/libraries/FeeController.sol) | break-even target + clamped PI |
| [`DiamondSplit.sol`](contracts/src/libraries/DiamondSplit.sol) | β retention split |
| [`DutchPow.sol`](contracts/src/libraries/DutchPow.sol) | 512-bit-safe integer WAD exponentiation mirroring SwapVM's `Power.pow` |

**Rounding contract:** `amountIn` rounds up, `amountOut` rounds down, the β rebate is floored. All three point the same way — value never leaves the maker through a rounding choice. This is SwapVM invariant 5, checked across the seven-invariant suite in [`SwapVMInvariants.t.sol`](contracts/test/fork/SwapVMInvariants.t.sol).

## 7. Verification: the differential oracle

The design rule ([`docs/DIFF_ORACLE.md`](docs/DIFF_ORACLE.md)) is that expected values come from an **independent** evaluator that imports no Solidity artifact, ABI, or SDK — a Python program using stdlib `Decimal` at 120-digit precision ([`tools/reference/reference_math.py`](tools/reference/reference_math.py)). It emits committed JSON vectors, so ordinary tests need no Python, FFI, or network.

Three implementations then consume the *same* files and must agree:

| Vector | Python | TypeScript | Solidity |
|---|---|---|---|
| [`cpmm_swap_v1.json`](test/vectors/cpmm_swap_v1.json) | generator | `riptide-math` | `DifferentialCpmm.t.sol`, `RiptideQuoter.t.sol` |
| [`volatility_v1.json`](test/vectors/volatility_v1.json) | generator | `riptide-math` | `DifferentialVolatility.t.sol` |
| [`fee_controller_v1.json`](test/vectors/fee_controller_v1.json) | generator | `riptide-math` | `DifferentialFeeController.t.sol` |
| [`diamond_split_v1.json`](test/vectors/diamond_split_v1.json) | generator | `riptide-math`, `resolver-core` | `DifferentialDiamondSplit.t.sol` |
| [`invalid_domains_v1.json`](test/vectors/invalid_domains_v1.json) | generator | — | `DifferentialInvalidDomains.t.sol` |
| [`payload_v1.json`](test/vectors/payload_v1.json) | generator | `strategy-sdk` | `RiptideStrategyCodec.t.sol` |

`python -m tools.reference.generate_vectors --check` re-derives and byte-compares, exiting non-zero on drift. A Solidity/TS mismatch is presumed a kernel bug, not a vector bug.

## 8. Test suite

**120 test functions across 45 test files.** Five named protocol invariants, each shipping a **negative control** — a deliberately broken variant that must make the test fail, so a green suite is evidence the test *can* fail:

| | Property | Negative control |
|---|---|---|
| **V1** | `pay + retain == S` and `retain ≥ ⌊β·S⌋`, checked against the resolver's real token delta | a split that overpays by 1 wei must fail |
| **V2** | rebalance reverts whenever `executedIn < staleIn` | a build without the guard must fail |
| **V3** | quote and swap return the identical fee for identical committed state | a build that mutates in static context must fail |
| **V4** | applied fee always inside `[feeMin, feeMax] ⊂ (0, BPS)` | unclamped controller output must fail |
| **V5** | expired rebalance leaves Aqua balances bit-identical | `Deadline` reordered last must fail |

Plus: the seven SwapVM invariants ([`SwapVMInvariants.t.sol`](contracts/test/fork/SwapVMInvariants.t.sol)), 10 fuzz tests at 10,000 runs, 12 differential tests, atomic-rollback and reentrancy tests, and a mainnet fork test against the real 1inch Aqua registry.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs seven jobs: contracts, a full Anvil deploy+seed+service-integration pass, subgraph matchstick, TypeScript packages, web Playwright, a hardcoded-address audit, and the Python vector check.

### Against the deployed app

Unit and fork tests prove the contracts in isolation. [`tools/demo/e2e-live.mjs`](tools/demo/e2e-live.mjs)
proves the whole thing together: it generates two wallets, funds them from the demo faucet,
and walks every persona — ship, swap exact-in, swap exact-out, skew the oracle, preview,
settle, dock, read the analytics — talking only to the same HTTP endpoints the browser
uses. Nothing is pre-approved and no fixture is involved; each assertion is checked against
on-chain state or the indexed data.

```bash
APP=https://riptide-web-production-77f7.up.railway.app node tools/demo/e2e-live.mjs
```

The most recent run — 20 transactions, 41/41 assertions, every hash linked to BaseScan — is
recorded in [`docs/E2E_RUN.md`](docs/E2E_RUN.md).

## 9. Off-chain services

All are **untrusted and replaceable**. None of them signs for a user.

### solver-api (`:8081`)
[`services/solver-api`](services/solver-api) — Hono server. `POST /v1/quote`, `POST /v1/route`, `/livez`, `/readyz`, `/metrics`.

The route path: discover candidates (subgraph, falling back to RPC), draft-optimise, **refresh the selected candidates' live state over RPC**, re-optimise, stamp each fill with the live `swapVersion` as an optimistic-concurrency token, build per-fill SwapVM orders, then **`eth_call`-simulate the whole batch** before returning calldata. Simulation is the real correctness gate. The service returns unsigned calldata targeting `RiptideBatchExecutor` and nothing else — asserted by [`test/trust.test.ts`](services/solver-api/test/trust.test.ts).

Allocation lives in [`packages/solver-core/src/optimize.ts`](packages/solver-core/src/optimize.ts), capped at `MAX_FILLS = 8`.

### resolver-bot (`:8082`)
[`services/resolver-bot`](services/resolver-bot) — polls for strategies whose pool price has drifted from the oracle by more than `PRICE_GAP_BPS`, previews the rebalance on-chain via `RiptideQuoter.previewRebalance`, and settles when `payToResolver` clears `MIN_PROFIT_WAD`. Advisory only; the on-chain `RiptideNoSurplus` guard is the real protection.

### vol-indexer (`:8083`)
[`services/vol-indexer`](services/vol-indexer) — reads a price (Chainlink round or an HTTP source) and calls `oracle.observe(...)` under the governed key. **It computes no volatility** — the entire EWMA/clamp/freeze pipeline is on-chain, so a bad push is bounded by the on-chain clamps rather than trusted.

### liquidity-mcp (`:8084`)
[`services/liquidity-mcp`](services/liquidity-mcp) — an MCP stdio server exposing three tools: `get_riptide_executable_liquidity` (curve-aware executable size, Quoter ground truth), `get_riptide_recapture_stats` (protocol and per-market recapture from the subgraph), and `compare_liquidity_vs_dex` (RIPTIDE vs Uniswap V3 mainnet via The Graph — honestly labelled as a CPMM estimate from indexed TVL, not an on-chain quote).

## 10. Indexing and the app

### The Graph — how RIPTIDE uses it, and why it is load-bearing

RIPTIDE is a **single-maker micro-pool** design: there is no shared pool contract, each maker ships their own strategy into Aqua with their own curve, fee band and β. That is what makes the economics work, and it creates a discovery problem — to quote a swap you must first know which strategies exist, which are active, and what inventory each holds. There is no on-chain registry to enumerate: Aqua is keyed by `strategyHash` and exposes balance getters only, and an EVM transaction cannot scan every maker within gas.

So the taker path is **discover off-chain, verify on-chain**. The subgraph answers "what exists"; the contracts re-derive every number that matters. A block-lag or mapping bug can make a stale route revert — it can never authorise a bad fill.

**What is indexed** — `specVersion 1.0.0`, mapping `apiVersion 0.0.9`, six datasources and ten handlers across [`subgraph/subgraph.yaml`](subgraph/subgraph.yaml):

| Datasource | Handlers |
|---|---|
| **Aqua** (1inch's own contract) | `Shipped`, `Docked`, `Pushed`, `Pulled` — strategy lifecycle and inventory are Aqua's events, not ours ([`src/mappings/aqua.ts`](subgraph/src/mappings/aqua.ts)) |
| `RiptideSwapVMRouter` | `StrategyRuntimeInitialized`, `SwapFilled` ([`swap-router.ts`](subgraph/src/mappings/swap-router.ts)) |
| `RiptideLvrFeeProvider` | `FeeControllerUpdated` — the σ → `feeTarget` → `feeReported` series ([`fee-provider.ts`](subgraph/src/mappings/fee-provider.ts)) |
| `RiptideBatchExecutor` | `RouteExecuted` ([`batch-executor.ts`](subgraph/src/mappings/batch-executor.ts)) |
| `RiptideRebalanceRouter` | `RebalanceSettled` — the β split ([`rebalance-router.ts`](subgraph/src/mappings/rebalance-router.ts)) |
| `RiptideAuctionSettler` | `AuctionSettled` — who actually settled ([`settler.ts`](subgraph/src/mappings/settler.ts)) |

Thirteen entities in [`schema.graphql`](subgraph/schema.graphql). `Fill`, `ControllerState` and `Route` are `@entity(immutable: true)` — append-only history, cheaper to index. `Protocol`, `Market` and `Maker` stay mutable because they carry running totals, including cumulative β-recaptured. `@derivedFrom` gives the reverse lookups without hand-maintained arrays.

**Two events, one settlement.** `Rebalance` is the only history row that is *not* immutable, and the reason is worth stating. The router's `RebalanceSettled` fires inside the swap and names the VM taker; when settlement goes through `RiptideAuctionSettler` — which is the permissionless path, and the one the UI uses — that taker is the settler contract, not a person. The settler emits its own `AuctionSettled` receipt later in the same transaction naming `msg.sender`, and [`settler.ts`](subgraph/src/mappings/settler.ts) joins the two through a `RebalanceTxIndex` row keyed by `txHash-strategyKey`, rewriting `Rebalance.settledBy` and rolling up a per-wallet `Resolver` aggregate. Without that join, every settlement in the analytics would be attributed to one contract address and the resolver leaderboard would be a single row.

**The field that makes the product work.** A strategy's fee policy, auction policy and salt live *only* in the 226-byte payload inside the Aqua order — Aqua exposes no getter for it, and neither router stores it. The single place those bytes are ever visible is Aqua's `Shipped` event, so the mapping persists them as `Strategy.orderBytes`. The solver decodes them ([`packages/solver-core/src/orderPayload.ts`](packages/solver-core/src/orderPayload.ts)) and rebuilds a priceable strategy. **Without this, anything a real maker ships through the UI is invisible to takers** — only the hardcoded demo strategies would be routable. This is the clearest case of The Graph doing something in RIPTIDE that no RPC call can.

**Freshness is returned, not hidden.** `_meta { block }` is compared against the chain head on every quote, and the UI renders the indexed block with a stale badge past a threshold — because a router built on an old snapshot can quote liquidity that has already moved.

Queried through 11 typed queries in [`packages/solver-core/src/subgraph/client.ts`](packages/solver-core/src/subgraph/client.ts), consumed by the solver, the resolver bot, the MCP server and every analytics surface. Matchstick tests in [`subgraph/tests/`](subgraph/tests) cover creation and replay-idempotency per datasource.

If no subgraph is configured, every read falls back to RPC `getLogs` from the deploy block ([`packages/solver-core/src/rpcEvents.ts`](packages/solver-core/src/rpcEvents.ts)) — the app still works, but maker-shipped strategies stop being routable, freshness degrades to unknown, and aggregates are recomputed by log-scanning on every request. The fallback is a correctness guarantee, not a substitute.

> **[`subgraph/README.md`](subgraph/README.md) — visit it for the detailed explanation of the subgraph**: every entity and field, each Graph feature and where it is used, the `StrategyKeyIndex` two-identifier bridge, local Graph Node and Studio deployment, and the known gaps.

**Web app** ([`apps/web`](apps/web)) — Next.js 15, six routes, one per persona:

| Route | Persona | What it does |
|---|---|---|
| [`/`](apps/web/src/app/page.tsx) | everyone | mechanism explainer with the KaTeX identities, live protocol stats |
| [`/make`](apps/web/src/app/make/page.tsx) | maker | configure the pool, preview the fee-vs-σ curve and the β split, inspect the raw payload with a TS↔Solidity hash-parity check, ship |
| [`/swap`](apps/web/src/app/swap/page.tsx) | taker | quote showing the applied fee **and the σ that produced it**, route split, simulation before signing |
| [`/resolve`](apps/web/src/app/resolve/page.tsx) | resolver | auction board, live Dutch price, surplus preview, settle |
| [`/positions`](apps/web/src/app/positions/page.tsx) | maker | live Aqua reserves, controller telemetry, fill history, dock |
| [`/analytics`](apps/web/src/app/analytics/page.tsx) | analyst | recaptured vs paid, fee vs estimated LVR (`σ²/8`), loop visualiser, **atomic route log**, honesty panel |

The browser never holds RPC secrets: all protocol reads go through `POST /api/riptide` into [`packages/frontend-api`](packages/frontend-api), which selects subgraph, solver API, or direct RPC per method. Contract addresses come from `deployments/<chainId>.json` via `GET /api/config` — no address is hardcoded in runtime code, and [`tools/audit/hardcoded-addresses.mjs`](tools/audit/hardcoded-addresses.mjs) enforces that in CI.

---

## Running it

```bash
pnpm install

# Local Anvil (needs the raised code-size limit for stock Aqua test contracts)
anvil --host 0.0.0.0 --chain-id 31337 --code-size-limit 100000
pnpm demo:reset                 # deploy + seed 3 strategies + sync subgraph + validate

# Contracts
cd contracts && forge test -vvv

# Differential oracle
python3 -m unittest discover tools/reference -v
python3 -m tools.reference.generate_vectors --check

# Web app (points at Base Sepolia)
pnpm web:dev
```

### Deploying the web app

Hosted on Railway. Config is Infrastructure-as-Code in [`.railway/railway.ts`](.railway/railway.ts) — build/start commands, healthcheck and non-secret env all live there, so a redeploy is reproducible:

```bash
railway link                 # select the `riptide` project
railway config apply --yes   # sync .railway/railway.ts to the service
railway up --service riptide-web
```

Only the Reown/WalletConnect project id is set on the service rather than in the repo (`preserve()` in the config keeps IaC from clearing it). `.railwayignore` keeps the upload to ~3.5 MB by excluding Foundry artifacts, submodules and `node_modules`; the container builds from committed ABIs via `RIPTIDE_SKIP_CODEGEN=1`, since it has no Foundry toolchain.

Toolchain: Solidity 0.8.30, Foundry 1.2.3-stable, Node ≥20, pnpm 9.15.0, Python 3.11+. Exact pins and licences in [`DEPENDENCY_LOCK.md`](DEPENDENCY_LOCK.md); environment variables in [`ENV.md`](ENV.md); build-time decisions in [`RESOLUTIONS.md`](RESOLUTIONS.md); demo script in [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md).

## Licence
MIT
