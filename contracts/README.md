# RIPTIDE Contracts

Every contract RIPTIDE ships, what it does, and where the behaviour lives. Paths are relative to this directory; line references point at the current source.

If you only read one thing: RIPTIDE is a constant-product AMM expressed as a **SwapVM program over 1inch Aqua**. It adds one custom settlement instruction and one auction-schedule instruction. It holds no user funds — Aqua does.

- Normative specs: [`../docs/CONTRACTS.md`](../docs/CONTRACTS.md), [`../docs/LVR_MATH.md`](../docs/LVR_MATH.md), [`../docs/SWAPVM_INTEGRATION.md`](../docs/SWAPVM_INTEGRATION.md)
- Build-time decisions (authoritative where specs disagree): [`../RESOLUTIONS.md`](../RESOLUTIONS.md)
- Local setup and how to exercise all of this: [`../docs/TEST_GUIDE.md`](../docs/TEST_GUIDE.md)

---

## 1. Layout

```
src/
  types/        RiptideTypes, RiptideErrors              structs + 30 named errors
  libraries/    WadMulDiv, LnExpMath, CpmmMath,          pure math, no state
                VolatilityMath, LvrMath, FeeController,
                DiamondSplit, DutchPow
  oracle/       RiptideVolatilityOracle                  EWMA realized volatility (σ)
  fees/         RiptideLvrFeeProvider                    Mechanism 1 — IProtocolFeeProvider
  core/         RiptideSwapVMRouter                      Mechanism 1 router (an Aqua app)
                RiptideRebalanceRouter + Module          Mechanism 2 router + logic
                RiptideRebalanceKernel                   stateless surplus / β / auction math
                RiptideAuctionSchedule                   declining-price instruction
                RiptideStrategyCodec                     226-byte payload codec
                RiptideSwapOpcodes / RiptideOpcodes      the two opcode tables
                RiptideMakerTraits, RiptideConstants     order envelope + frozen indices
  periphery/    Quoter, Lens, AuctionSettler, BatchExecutor
  demo/         RiptideDemoToken                         faucet ERC-20, demo only
  interfaces/   IRiptide*                                external surfaces
script/         deploy, seed, ship, dock, rebalance, batchExecute, demo
test/           unit, fuzz, invariant, differential, integration, fork, script
lib/            pinned 1inch submodules (swap-vm v1.0.2, aqua v1.0.0) + OZ, Solady
```

Build order (dependencies first): types → libraries → codec → oracle → fee provider → kernel → routers → periphery → demo.

---

## 2. The two mechanisms, end to end

### 2.1 Mechanism 1 — a fee that tracks volatility

A taker swap runs this SwapVM program, built by [`RiptideSwapVMRouter._buildSwapProgram`](src/core/RiptideSwapVMRouter.sol#L125-L132):

| # | Opcode | Index | Args |
|---|---|---|---|
| 1 | `Controls._deadline` | 13 | `uint40 deadline` |
| 2 | `Fee._aquaDynamicProtocolFeeAmountInXD` | 30 | `address feeProvider` |
| 3 | `XYCSwap._xycSwapXD` | 17 | — |
| 4 | `Controls._salt` | 20 | `uint64 salt` |

41 program bytes. Every opcode is upstream 1inch code at its canonical `AquaOpcodes` index — nothing here is a RIPTIDE instruction.

Execution is **not** linear: the fee instruction *wraps* the rest. `Fee._feeAmountIn` subtracts the fee from `amountIn`, calls `ctx.runLoop()` (which executes the swap and salt on the net input), then restores. So the real trace is `Deadline → Fee(pre) → XYCSwap → Salt → Fee(post) → AQUA.pull`.

The rate itself comes from [`RiptideLvrFeeProvider.getFeeBpsAndRecipient`](src/fees/RiptideLvrFeeProvider.sol#L79-L99), which SwapVM `staticcall`s. It is `view` and writes nothing — that is what makes a quote and the settling swap return the same fee inside a block. The controller advances *after* the swap, in [`riptideSwap`](src/core/RiptideSwapVMRouter.sol#L104).

### 2.2 Mechanism 2 — auction the stale price

A rebalance runs this program, built by [`RiptideRebalanceModule._buildRebalanceProgram`](src/core/RiptideRebalanceModule.sol#L197-L218):

| # | Opcode | Index | Args |
|---|---|---|---|
| 1 | `Controls._deadline` | 13 | `uint40 deadline` |
| 2 | `RiptideAuctionSchedule._riptideAuctionBalanceIn` | 35 | `uint40 start ‖ uint16 duration ‖ uint64 decay` |
| 3 | `Decay._decayXD` | 19 | `uint16 antiSandwichPeriod` |
| 4 | `XYCSwap._xycSwapXD` | 17 | — |
| 5 | `_riptideRebalanceOpcode` | 34 | `uint64 beta ‖ uint128 staleInWad ‖ address resolver` |
| 6 | `Controls._salt` | 20 | `uint64 salt` |

86 program bytes. `Decay` also wraps, so instructions 4–6 execute inside it.

`Deadline` is **first on purpose**: an expired auction reverts before any balance is touched. That is invariant V5, asserted by [`V5DeadlineFirst.t.sol`](test/invariant/V5DeadlineFirst.t.sol) with a negative control that moves it last and must fail.

---

## 3. Contract reference

### 3.1 `core/RiptideSwapVMRouter.sol` — Mechanism 1 router

An Aqua **app** and a SwapVM router. Inherits [`RiptideSwapOpcodes`](src/core/RiptideSwapOpcodes.sol), which wires a four-entry opcode table on the `SwapVM` base.

| Function | Line | What it does |
|---|---|---|
| `registerStrategy` | [`:53-75`](src/core/RiptideSwapVMRouter.sol#L53-L75) | Binds a strategy to the fee provider and oracle. **Auth: `strategy.maker` or `owner()`.** Emits `StrategyRuntimeInitialized`. |
| `buildSwapOrder` | [`:77-87`](src/core/RiptideSwapVMRouter.sol#L77-L87) | `pure`. Produces `ISwapVM.Order` with `data = payload ‖ program`. |
| `riptideSwap` | [`:89-123`](src/core/RiptideSwapVMRouter.sol#L89-L123) | `delegatecall`s the inherited `swap` (preserving `msg.sender` as the taker), then advances the controller, reads live Aqua balances and emits `SwapFilled`. |

Storage is only bookkeeping: `_marketIds` and `_versions`, both keyed by `strategyKey`. **No token balances.**

### 3.2 `core/RiptideRebalanceRouter.sol` + `RiptideRebalanceModule.sol` — Mechanism 2

Split in two because a single contract would not fit EIP-170. The router is the Aqua app and opcode host; the module holds the logic and storage. The router constructs its module in its own constructor, so the pair is immutable and closed.

The trust chain is deliberately tight:
- `RiptideRebalanceModule.execute` — **only** callable by `ROUTER` ([`:136`](src/core/RiptideRebalanceModule.sol#L136))
- `RiptideRebalanceRouter.pullForRebalance` / `observeForRebalance` / `advanceControllerForRebalance` / `emitRebalanceSettled` — **only** callable by `MODULE`

`execute` ([`:125-180`](src/core/RiptideRebalanceModule.sol#L125-L180)) is the heart of the mechanism:

1. Decode `(beta, staleInWad, resolver)` from the 44-byte args.
2. Resolve `strategyKey` from the order hash; unknown → `RiptideStrategyNotActive`.
3. `KERNEL.splitSurplus(...)` — **runs in static context too**, so quoting a loss-making rebalance reverts exactly as settling would.
4. Only when not static: `AQUA.pull` the rebate, record the revealed price to the oracle, advance the controller, bump the version, emit `RebalanceSettled`.

`_revealedPriceWad` ([`:192-195`](src/core/RiptideRebalanceModule.sol#L192-L195)) uses the *auction-adjusted* registers, so the price fed back into the oracle is the clearing price, not the raw pool price. That is what closes the loop.

### 3.3 `core/RiptideAuctionSchedule.sol` — the declining-price instruction

swap-vm splits opcodes into an AMM group (`AquaOpcodes`) and a limit-order group (`LimitOpcodes`). `DutchAuction` is in the limit-order group; 1inch's SDK mirrors this (`AquaProgramBuilder` has no `dutchAuction*`). RIPTIDE is an AMM, so rather than borrow across that boundary it owns the instruction.

It only **scales a reserve register** — it never prices a swap:

```
balanceIn *= decay^(now − auctionStart)     // resolver pays less the longer it waits
require(now <= start + duration)            // window closes
```

`XYCSwap` still computes every amount from the constant-product curve; the schedule shifts that curve over time. A guard requires it to run before the swap leg. The args layout matches the reference implementation byte for byte, so program bytes and live order hashes are unchanged — asserted by [`AuctionScheduleByteParity.t.sol`](test/fork/AuctionScheduleByteParity.t.sol) against the pre-migration router still deployed on Base Sepolia.

### 3.4 `fees/RiptideLvrFeeProvider.sol` — Mechanism 1's fee source

Implements 1inch's `IProtocolFeeProvider`. Two properties carry the whole mechanism:

**It never writes state.** `getFeeBpsAndRecipient` is `view` and returns the *committed* `feeReported`. Proved with `vm.record`/`vm.accesses` in [`test_v3DeterminismNoStorageWrites`](test/unit/RiptideLvrFeeProvider.t.sol). This is SwapVM invariant 3 — quote and swap agree in-block.

**The fee band is hard-guarded.** `feeReported ∈ [feeMin, feeMax] ⊂ (0, BPS)` or it reverts `RiptideFeeOutOfRange` ([`:94-96`](src/fees/RiptideLvrFeeProvider.sol#L94-L96)), so SwapVM's own `feeBps <= BPS` check can never trip.

`advanceController` ([`:101-122`](src/fees/RiptideLvrFeeProvider.sol#L101-L122)) is the only mutating path and is router-only. It reads σ, computes the break-even target, runs one PI step, and emits `FeeControllerUpdated`.

**Fee units:** RIPTIDE uses `1e7 = 100%` everywhere; swap-vm v1.0.2 uses `1e9`. The conversion happens at exactly one place — the return of `getFeeBpsAndRecipient`, via `SWAPVM_FEE_SCALE = 100`. Remove it and the VM charges 100× too little.

### 3.5 `oracle/RiptideVolatilityOracle.sol` — σ

Per-strategy EWMA of log returns, optionally blended with a Garman–Klass range term.

```
r          = ln(price / lastPrice)
var'       = λ·var + (1−λ)·(r² [+ gkTerm])
σ          = sqrt(var' · WAD / dt)   clamped to [σmin, σmax]
σ          = isStale ? σprev : σ     stale freeze
```

Two guards matter:
- `observe` **short-circuits when `isStatic`** and writes nothing ([`:87-89`](src/oracle/RiptideVolatilityOracle.sol#L87-L89)) — quoting never moves σ.
- `onlyObserver` ([`:38-43`](src/oracle/RiptideVolatilityOracle.sol#L38-L43)) — only the rebalance router and a governed indexer key may observe. The swap router deliberately cannot.

Note `sigmaFromVar` clamps to `sigmaMin` even at zero variance, so a single observation lands σ at the floor; moving the fee needs a series.

### 3.6 `core/RiptideRebalanceKernel.sol` — the economics, isolated

Stateless and below EIP-170 so the routers stay deployable, and so the surplus maths has one audited home shared by the instruction and the periphery.

| Function | Purpose |
|---|---|
| `staleBaselineIn` | What the pre-rebalance curve would have demanded — the baseline surplus is measured against |
| `splitSurplus` | `S = executedIn − staleIn`; reverts `RiptideNoSurplus` if negative; returns the β split |
| `auctionBalance` | View-callable replica of the on-chain auction clock, so off-chain previews match settlement |

The split itself, [`DiamondSplit.split`](src/libraries/DiamondSplit.sol#L12-L17):

```
payToResolver = ⌊(WAD − β)·S / WAD⌋      floored — rounding favours the maker
retainToLP    = S − payToResolver         ≥ ⌊β·S⌋, exact conservation
```

### 3.7 `core/RiptideStrategyCodec.sol` — the 226-byte payload

Fixed-length, packed big-endian, magic `RPT1`. Carries market, reserves, fee policy, auction policy, oracle config and the fee-provider binding.

`maker` is deliberately **absent** — identity lives in the order envelope, and `decode` returns `address(0)` for it.

`validateStructure` ([`:72-92`](src/core/RiptideStrategyCodec.sol#L72-L92)) rejects zero/identical tokens, `feeMin == 0`, `feeMin ≥ feeMax`, `feeMax ≥ BPS`, and `lambda`/`beta`/`decay` outside `(0,1)`. **Decoding is never authorisation** — every runtime path re-reads live Aqua balances.

Three identifiers, never interchangeable:

```
policyHash   = keccak256(payload)                    SDK / audit identity
strategyHash = keccak256(abi.encode(order))          Aqua commitment
strategyKey  = keccak256(abi.encode(maker, salt))    router runtime key
```

### 3.8 `core/RiptideMakerTraits.sol` — the order envelope

```
order.data   = [226-byte payload][program bytes]
order.traits = (1 << 254) | (226 << 208)
```

`1 << 254` is `USE_AQUA_INSTEAD_OF_SIGNATURE`, so SwapVM authorises via Aqua and seeds reserves from `safeBalances`. `226 << 208` writes the program start offset into MakerTraits slice index 3, making `MakerTraitsLib.program(traits, data)` return `data[226:]`.

This is a deliberate, valid-but-non-canonical use of the slice encoding: the on-chain resolution honours it, but `MakerTraitsLib.build` would never produce it (it derives slice indexes from real hook data), and 1inch's SDK normalises it away. That is precisely why order construction cannot be delegated to `@1inch/swap-vm-sdk`. Frozen by [`MakerTraitsFreeze.t.sol`](test/unit/MakerTraitsFreeze.t.sol).

### 3.9 `core/RiptideConstants.sol` — frozen opcode indices

`AquaOpcodes._opcodes()` builds a fixed array then converts it to a dynamic one by writing the length into slot 0 — **overwriting element 0**. So the runtime dispatch index is one *less* than the source position. Those indices are frozen here (13, 17, 19, 20, 30) and re-derived from the live dispatch table at runtime by [`OpcodeIndexProbe.t.sol`](test/unit/OpcodeIndexProbe.t.sol), which is the guard against silent upstream renumbering.

### 3.10 Periphery

| Contract | Role |
|---|---|
| [`RiptideQuoter`](src/periphery/RiptideQuoter.sol) | Exact quotes **through the real VM**, so off-chain quotes equal settlement. `previewRebalance` rebuilds the exact shipped order (hence `buildRebalanceOrderWithAuctionStart`). |
| [`RiptideLens`](src/periphery/RiptideLens.sol) | Reconciles config, router runtime, live Aqua balances, wallet balance and allowance in one read. |
| [`RiptideAuctionSettler`](src/periphery/RiptideAuctionSettler.sol) | **Permissionless** rebalance entrypoint. The resolver is `msg.sender`, baked into the order — so the order hash only matches for the actual settler. Protection is the on-chain surplus maths, not a caller allow-list. |
| [`RiptideBatchExecutor`](src/periphery/RiptideBatchExecutor.sol) | Atomic multi-maker taker settlement. Bounded fills (`MAX_FILLS = 8`), per-fill version checks, aggregate slippage and deadline, reentrancy guard. Any failed fill reverts the whole route. |

### 3.11 Math libraries

All pure, all take an explicit rounding direction, all revert rather than truncate.

| Library | Owns |
|---|---|
| [`WadMulDiv`](src/libraries/WadMulDiv.sol) | 512-bit `mulDiv` with `Down`=floor / `Up`=ceil; reverts on zero denominator or overflow |
| [`LnExpMath`](src/libraries/LnExpMath.sol) | Checked `ln`/`exp`/`pow`/`sqrt` over Solady with explicit domains ([`../LN_EXP_BOUNDS.md`](../LN_EXP_BOUNDS.md)) |
| [`CpmmMath`](src/libraries/CpmmMath.sol) | `exactIn` floors both steps; `exactOut` ceils both — asymmetric on purpose |
| [`LvrMath`](src/libraries/LvrMath.sol) | `ℓ = σ²·V/8`, the CPMM LVR rate |
| [`VolatilityMath`](src/libraries/VolatilityMath.sol) | EWMA, Garman–Klass, σ clamp, stale freeze |
| [`FeeController`](src/libraries/FeeController.sol) | Break-even target + clamped PI with anti-windup |
| [`DiamondSplit`](src/libraries/DiamondSplit.sol) | β retention split |
| [`DutchPow`](src/libraries/DutchPow.sol) | 512-bit-safe integer WAD exponentiation |

**Rounding contract:** `amountIn` rounds up, `amountOut` rounds down, the β rebate is floored. All three point the same way — value never leaves the maker through a rounding choice (SwapVM invariant 5).

---

## 4. How Aqua is used

Aqua holds **allowance records, not tokens**. A maker approves Aqua once; real tokens stay in the maker's wallet until pulled during a trade. RIPTIDE's routers are registered as Aqua *apps*. **No RIPTIDE contract ever holds maker inventory.**

| Primitive | Where |
|---|---|
| `ship` | Maker publishes a strategy — called from the maker's own wallet, never by a RIPTIDE contract |
| `safeBalances` | Every quote and swap; SwapVM seeds `balanceIn`/`balanceOut` from it before running the program |
| `pull` | Swap output to taker; the **β rebate to the resolver** ([`RiptideRebalanceRouter.sol:81`](src/core/RiptideRebalanceRouter.sol#L81)); and the protocol fee, pulled by SwapVM itself |
| `push` | Taker input credited to the maker's strategy |
| `dock` | Maker cancels and releases balances |

---

## 5. Access control

| Entry point | Who may call |
|---|---|
| `RiptideSwapVMRouter.registerStrategy` | `strategy.maker` or `owner()` |
| `RiptideRebalanceRouter.registerStrategy` | first caller binds the key; thereafter bound maker or `owner()` |
| `RiptideRebalanceRouter.setRebalanceAuctionStart` | bound maker or `owner()` |
| `RiptideRebalanceRouter.pullForRebalance` (+ observe/advance/emit) | **`MODULE` only** |
| `RiptideRebalanceModule.execute` / `registerStrategy` | **`ROUTER` only** |
| `RiptideLvrFeeProvider.registerStrategy` | swap router or `owner` |
| `RiptideLvrFeeProvider.advanceController` | either router |
| `RiptideVolatilityOracle.observe*` | rebalance router or governed `volIndexer` |
| `RiptideAuctionSettler.settleRebalance` | **anyone** — protection is `RiptideNoSurplus`, not identity |
| `RiptideBatchExecutor.execute` | `route.payer == msg.sender` |

Reentrancy: three independent transient locks — SwapVM's per-order guard, the module's global lock, and the batch executor's.

**Trust assumptions worth stating plainly.** `owner` (the deployer) can register or overwrite any strategy on both routers and is also the oracle's `volIndexer`, so it can push arbitrary σ observations — bounded by the on-chain clamps. `RiptideVolatilityOracle.configureStrategy` is freely overwritable by the routers. The rebalance router uses first-come binding for unregistered keys. And Aqua protocol-fee collection is **best-effort**: SwapVM's `_tryPullFee` swallows failures and emits `ProtocolFeeSkipped`, which should be monitored.

---

## 6. Tests

**119 test functions across 46 files.** Five named protocol invariants, each shipping a **negative control** — a deliberately broken variant that must make the test fail, so a green suite is evidence the test *can* fail.

| | Property | Negative control |
|---|---|---|
| **V1** | `pay + retain == S` and `retain ≥ ⌊β·S⌋`, checked against the resolver's real token delta | a split overpaying by 1 wei must fail |
| **V2** | rebalance reverts whenever `executedIn < staleIn` | a build without the guard must fail |
| **V3** | quote and swap return the identical fee for identical committed state | mutating in static context must fail |
| **V4** | applied fee always inside `[feeMin, feeMax] ⊂ (0, BPS)` | unclamped controller output must fail |
| **V5** | expired rebalance leaves Aqua balances bit-identical | `Deadline` reordered last must fail |

Plus: the seven SwapVM invariants, 10 fuzz tests at 10,000 runs, 12 differential tests against a committed Python oracle, atomic-rollback and reentrancy tests, and three fork tests that matter for integration claims:

- [`Provenance.t.sol`](test/fork/Provenance.t.sol) — ships real WETH/USDC into the **canonical 1inch Aqua registry** on an Ethereum mainnet fork.
- [`StockAquaRouterCompat.t.sol`](test/fork/StockAquaRouterCompat.t.sol) — runs RIPTIDE's Mechanism-1 program on a **stock, unmodified `AquaSwapVMRouter`** and asserts it prices identically to ours.
- [`AuctionScheduleByteParity.t.sol`](test/fork/AuctionScheduleByteParity.t.sol) — asserts the auction args encoding has not drifted, against a live pre-migration router.

Run them: see [`../docs/TEST_GUIDE.md`](../docs/TEST_GUIDE.md).

---

## 7. Build configuration

`foundry.toml`: Solidity `0.8.30`, `via_ir = true`, `optimizer_runs = 700`, `evm_version = "cancun"` — mirroring swap-vm's own settings, which matters because the frozen opcode indices are build-dependent.

`code_size_limit` is raised locally so stock Aqua **test** contracts compile; the RIPTIDE routers themselves fit the real 24,576-byte limit and are asserted to by [`DeploySizeTest`](test/unit/DeploySizeTest.t.sol). Headroom on the swap router is thin — treat any addition to it as size-sensitive.

Pinned dependencies and licences: [`../DEPENDENCY_LOCK.md`](../DEPENDENCY_LOCK.md).
