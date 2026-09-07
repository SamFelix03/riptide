# RIPTIDE On-Chain Surface

Normative list of every on-chain contract and library: responsibility, external
interface, events, custom errors, and per-contract invariants, plus the
verification-and-testing plan. Does **not** define economics
([`PROTOCOL.md`](PROTOCOL.md)), math derivations
([`LVR_MATH.md`](LVR_MATH.md)), or opcode encoding
([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md)).

Solidity signatures below are **normative intent**, not final code; where a signature
mirrors a 1inch interface it says so and links the file. The build consumes the
**official published** `@1inch/swap-vm` and `@1inch/aqua` packages at their latest
versions (`@1inch/swap-vm@0.0.6` at the pinned local mirror); the files under
[`refs/swap-vm/src`](../../refs/swap-vm/src) are a **read-only** mirror of that same
source, cited by path for provenance only. Pragma is `0.8.30` — the version every
SwapVM instruction in that source uses **[verified]**.

---

## 1. Layout and dependency order

```text
contracts/src/
├── types/        RiptideTypes.sol, RiptideErrors.sol
├── libraries/    WadMulDiv.sol, LnExpMath.sol,
│                 VolatilityMath.sol, LvrMath.sol, FeeController.sol, DiamondSplit.sol
├── oracle/       RiptideVolatilityOracle.sol  (IRiptideVolatilityOracle.sol)
├── fees/         RiptideLvrFeeProvider.sol
├── core/         RiptideStrategyCodec.sol, RiptideRebalanceKernel.sol,
│                 RiptideRebalanceInstruction.sol, RiptideSwapVMRouter.sol
├── periphery/    RiptideAuctionSettler.sol, RiptideQuoter.sol,
│                 RiptideLens.sol, RiptideBatchExecutor.sol
├── interfaces/   IProtocolFeeProvider.sol (from swap-vm), IRiptideEvents.sol,
│                 IRiptideVolatilityOracle.sol, IRiptideRebalanceKernel.sol,
│                 IRiptideQuoter.sol, IRiptideLens.sol, IRiptideBatchExecutor.sol
└── demo/         RiptideDemoToken.sol
```

Build/deploy order (dependencies first): types → libraries → codec → oracle → fee
provider → kernel → instruction → router → periphery → demo. Detailed deployment steps
are in [`SYSTEM.md`](SYSTEM.md) §Deployment.

---

## 2. `RiptideTypes`

Structs and enums shared across contracts (fields normative; packing at build time).

```solidity
enum QuoteKind { ExactInput, ExactOutput }        // exact-in vs exact-out

struct FeePolicy {
    uint24 feeMin; uint24 feeMax;                  // FeeUnits, BPS = 1e7
    uint64 lambda;                                  // EWMA decay, 1e18
    uint64 kp; uint64 ki; uint64 iMax;              // PI controller, 1e18
    uint64 sigmaMin; uint64 sigmaMax;               // vol clamp, 1e18
}

struct AuctionPolicy {
    uint64 beta;                                    // retention, 1e18, (0,1)
    uint16 duration; uint64 decay;                  // Dutch auction
    uint16 antiSandwichPeriod;                      // Decay period
}

struct OracleConfig { address feed; uint8 decimals; uint16 maxStaleness; }

struct Strategy {                                   // decoded payload (see codec)
    address maker; address baseToken; address quoteToken;
    uint128 reserveBaseWad; uint128 reserveQuoteWad;
    FeePolicy fee; AuctionPolicy auction; OracleConfig oracle;
    address feeProvider; bytes32 salt;
}

struct ControllerState {                            // router runtime, per strategyHash
    uint24 feeReported; int192 integral;            // PI state
    uint128 varWad; uint40 lastObsTs; uint128 lastPriceWad;   // vol state
    uint40 lastRebalanceTs; uint64 version; bool initialized;
}

struct RebalanceResult { uint256 surplusWad; uint256 payToResolver; uint256 retainToLP; }
```

---

## 3. `RiptideErrors`

Canonical custom errors — every failure is a named error, never a silent truncation.

```solidity
// config / decode
error RiptideZeroAddress();
error RiptideIdenticalTokens(address token);
error RiptideUnsupportedTokenDecimals(address token, uint8 decimals);
error RiptideInvalidEncodingLength(uint256 actual, uint256 expected);
error RiptideInvalidEncodingMagic(bytes4 actual, bytes4 expected);
error RiptideUnsupportedEncodingVersion(uint8 actual, uint8 supported);
error RiptideInvalidFeeBounds(uint24 feeMin, uint24 feeMax);   // feeMin==0 || feeMin>=feeMax || feeMax>=BPS
error RiptideInvalidBeta(uint64 beta);                          // !(0<beta<1e18)
error RiptideInvalidDecay(uint64 decay);                        // !(0<decay<1e18)
error RiptideInvalidSigmaBounds(uint64 sigmaMin, uint64 sigmaMax);
// runtime auth / lifecycle
error RiptideStrategyHashMismatch(bytes32 supplied, bytes32 computed);
error RiptideStaleVersion(uint64 expected, uint64 actual);
error RiptideStrategyNotActive(bytes32 strategyHash);
error RiptideDeadlineExpired(uint40 deadline, uint256 timestamp);
error RiptideUnauthorizedResolver(address caller);
error RiptideReentrantExecution();
// mechanism-2 economic guards
error RiptideNoSurplus(int256 surplusWad);                      // S < 0
error RiptideAuctionWindowClosed(uint40 start, uint16 duration, uint256 nowTs);
error RiptideStaleBaseline();                                   // baseline oracle round too old
// fee guard
error RiptideFeeOutOfRange(uint256 feeBps, uint256 surplusBps); // would breach FeeProtocol guard
// oracle
error RiptideStaleOracleRound(uint256 updatedAt, uint16 maxStaleness);
error RiptideNonPositivePrice(int256 answer);
// math domains
error RiptideMathDivisionByZero();
error RiptideMathOverflow();
error RiptideMathUnderflow();
error RiptideAmountOverflow(uint256 amount);
error RiptideLogInputOutOfDomain(uint256 inputWad);
error RiptideExpInputOutOfDomain(int256 inputWad);
error RiptidePowOutOfDomain(uint256 baseWad, int256 exponentWad);
// routing
error RiptideSlippageExceeded(uint256 actual, uint256 limit);
error RiptideTooManyFills(uint256 actual, uint256 maximum);
error RiptideDuplicateStrategy(bytes32 strategyKey);
```

---

## 4. `IRiptideEvents`

Canonical events consumed by the subgraph.
Aqua `Shipped/Docked/Pulled/Pushed` remain authoritative for lifecycle/allocation.

```solidity
interface IRiptideEvents {
    /// Materialize immutable runtime for a strategy.
    event StrategyRuntimeInitialized(
        bytes32 indexed strategyKey, bytes32 indexed marketId, address indexed maker,
        bytes32 strategyHash, uint128 reserveBaseWad, uint128 reserveQuoteWad, uint64 version);

    /// One taker swap; carries the fee actually applied (Mechanism 1).
    event SwapFilled(
        bytes32 indexed routeId, bytes32 indexed strategyKey, address indexed maker,
        bytes32 marketId, address tokenIn, address tokenOut,
        uint256 amountIn, uint256 amountOut,
        uint24 feeBpsApplied, uint128 sigmaWad,
        uint128 reserveBaseAfterWad, uint128 reserveQuoteAfterWad, uint64 versionAfter);

    /// One rebalance; carries the β-split (Mechanism 2).
    event RebalanceSettled(
        bytes32 indexed strategyKey, address indexed maker, address indexed resolver,
        bytes32 marketId, address tokenIn, address tokenOut,
        uint256 executedInWad, uint256 staleInWad, uint256 surplusWad,
        uint256 retainToLPWad, uint256 payToResolverWad,
        uint128 revealedPriceWad, uint64 versionAfter);

    /// Fee controller advanced (Mechanism 1 telemetry).
    event FeeControllerUpdated(
        bytes32 indexed strategyKey, uint128 sigmaWad, uint24 feeTarget, uint24 feeReported);

    /// Aggregate atomic taker route.
    event RouteExecuted(
        bytes32 indexed routeId, bytes32 indexed marketId, address indexed payer,
        address recipient, QuoteKind kind, address tokenIn, address tokenOut,
        uint256 amountIn, uint256 amountOut, uint256 limit, uint16 fillCount);
}
```

---

## 5. Math libraries

Each library is pure/`view`, takes explicit `Rounding`, and reverts on domain error
(never truncates). Math is normative in [`LVR_MATH.md`](LVR_MATH.md); these are the
Solidity homes.

| Library | Owns | Key functions | Invariants |
| --- | --- | --- | --- |
| `WadMulDiv` | 512-bit `mulDiv`, WAD mul/div/reciprocal, raw↔WAD | `mulDiv(x,y,d,Rounding)`, `toWad`, `fromWad` | Reverts on zero denom / overflow; `Up`=ceil, `Down`=floor ([`LVR_MATH.md`](LVR_MATH.md) §1.1). |
| `LnExpMath` | Checked `ln`, `exp`, `pow`, `sqrt` over Solady backend | `lnWad`, `expWad`, `powWad`, `sqrtWad` | In-domain only (§1.2); identities `x^0=1,1^a=1,x^1=x` bypass. |
| `VolatilityMath` | EWMA + Garman–Klass realized variance | `ewmaVar(prev,r,lambda)`, `gkTerm(h,l,c,o)`, `sigmaFromVar` | Clamped to `[sigmaMin,sigmaMax]`; stale input freezes ([`LVR_MATH.md`](LVR_MATH.md) §3). |
| `LvrMath` | LVR rate, CPMM `σ²/8` | `lvrRateCpmm(sigmaWad, valueWad)` | `ell >= 0`; matches K1 / [`DIFF_ORACLE.md`](DIFF_ORACLE.md). |
| `FeeController` | Break-even target + clamped PI | `feeTarget(sigmaWad, lambdaQ, feeMin, feeMax)`, `piStep(state, target)` | Output in `[feeMin,feeMax]`; anti-windup `|I|<=Imax` (§4). |
| `DiamondSplit` | β-retention split | `split(surplusWad, beta) → (payToResolver, retainToLP)` | `payToResolver=Down((1-β)S)`, `retainToLP=S-payToResolver >= βS` (§5.3). |

---

## 6. `RiptideStrategyCodec`

Stateless encode/decode/validate of the RIPTIDE payload (layout in
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §7).

```solidity
library RiptideStrategyCodec {
    function encode(Strategy calldata s) internal pure returns (bytes memory);
    function decode(bytes calldata payload) internal pure returns (Strategy memory);
    function validateStructure(Strategy memory s) internal pure;   // reverts with RiptideErrors
    function marketId(address base, address quote) internal pure returns (bytes32);
    function strategyKey(address maker, bytes32 strategyHash) internal pure returns (bytes32);
}
```

**Invariants:** fixed 1-byte-tagged length; rejects the config errors in §3; decoding is
never authorization — callers re-check live Aqua balances and math
domains.

---

## 7. `RiptideVolatilityOracle` / `IRiptideVolatilityOracle`

On-chain realized-volatility estimator. Records price observations (from swaps,
rebalances, and the vol-indexer service) and exposes the current `sigma` per strategy.

```solidity
interface IRiptideVolatilityOracle {
    function sigmaWad(bytes32 strategyKey) external view returns (uint128);   // clamped
    function varWad(bytes32 strategyKey)   external view returns (uint128);
    /// Advances EWMA with a new observation. MUST be a no-op view in static context;
    /// callers pass isStatic so quote() never mutates.
    function observe(bytes32 strategyKey, uint128 priceWad, uint40 ts, bool isStatic)
        external returns (uint128 sigmaWad);
    function observeRange(bytes32 strategyKey, uint128 h, uint128 l, uint128 c, uint128 o, uint40 ts)
        external returns (uint128 sigmaWad);
}
```

**Invariants:** (1) `observe` changes state only when `!isStatic` — preserving
Quote/Swap consistency (invariant 3); (2) a stale feed round freezes the estimate at
its last good value (`RiptideStaleOracleRound` on the freshness read path); (3)
`sigmaWad` is always within `[sigmaMin, sigmaMax]`. Feed staleness is checked exactly
as the verified `OraclePriceAdjuster`
([`refs/swap-vm/src/instructions/OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol)).

**Authority:** only the RIPTIDE router/instruction (and a governed vol-indexer key) may
call the mutating `observe*`; external callers get the `view` reads.

---

## 8. `RiptideLvrFeeProvider` (implements `IProtocolFeeProvider`)

The Mechanism 1 contract. Implements the **verified** interface exactly
([`IProtocolFeeProvider.sol`](../../refs/swap-vm/src/instructions/interfaces/IProtocolFeeProvider.sol)):

```solidity
contract RiptideLvrFeeProvider is IProtocolFeeProvider {
    /// Called by FeeProtocol(0x80) via staticcall in both quote() and swap().
    function getRecipientAndFees(
        bytes32 orderHash, address maker, address taker,
        address tokenIn, address tokenOut, bool isExactIn
    ) external view returns (address receiver, uint24 feeBps, uint24 surplusBps);

    function registerStrategy(bytes32 strategyKey, bytes32 orderHash, FeePolicy calldata p) external; // maker/governance
}
```

**Behavior:** resolves `strategyKey` from `orderHash`/`maker`, reads
`RiptideVolatilityOracle.sigmaWad`, computes `feeTarget` via `FeeController` and returns
the *committed* `feeReported` (deterministic in the `staticcall` context —
[`LVR_MATH.md`](LVR_MATH.md) §4.4). `receiver` is the maker's fee sink.

**Invariants:** (1) **pure function of committed on-chain state** — identical return in
quote and swap within a block (invariant 3); (2) `feeBps ∈ [feeMin, feeMax] ⊂ (0, BPS)`
so `FeeProtocol`'s `totalFeeBps < BPS` guard never trips **[verified: `FeeProtocol.sol`
line 217]**; (3) it **never** writes state (it is `view`) — the controller advances in
the router's non-static path, not here.

---

## 9. `RiptideRebalanceKernel` / `IRiptideRebalanceKernel`

Stateless quote/compute kernel kept **below EIP-170** so the router stays deployable.
Holds the surplus/baseline/β-split math so the instruction and periphery share one
audited implementation.

```solidity
interface IRiptideRebalanceKernel {
    function staleBaselineIn(uint256 outWad, uint128 reserveInWad, uint128 reserveOutWad, QuoteKind kind)
        external pure returns (uint256 staleInWad);              // CPMM baseline
    function splitSurplus(uint256 executedInWad, uint256 staleInWad, uint64 beta)
        external pure returns (RebalanceResult memory);          // reverts RiptideNoSurplus if S<0
    function auctionBalance(uint128 balanceWad, uint40 start, uint16 duration, uint64 decay, bool isIn, uint256 nowTs)
        external pure returns (uint128);                         // mirrors DutchAuction math
}
```

**Invariants:** `splitSurplus` enforces §5.3 exactly (maker-favorable rounding);
`auctionBalance` reverts `RiptideAuctionWindowClosed` past `start+duration`
**[verified: `DutchAuction.sol`]**.

---

## 10. `RiptideRebalanceInstruction`

The **one** custom SwapVM instruction (abstract contract; Decay/DutchAuction-style
per-key storage, mutate only when `!isStaticContext`).
Encoding in [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §5.

```solidity
abstract contract RiptideRebalanceInstruction {
    IRiptideRebalanceKernel public immutable KERNEL;
    IRiptideVolatilityOracle public immutable ORACLE;
    mapping(bytes32 strategyKey => ControllerState) internal _runtime;

    /// Called by the router's opcode dispatch.
    function _riptideRebalance(Context memory ctx, bytes calldata args) internal;
}
```

**Behavior (normative):** decode `(beta, staleInWad, resolver)`; read `safeBalances`;
compute `S`, `payToResolver`, `retainToLP` via the kernel; require `S >= 0`; rebate via
Aqua `pull(maker, strategyHash, tokenIn, payToResolver, resolver)`; then **only when
`!ctx.vm.isStaticContext`**: `ORACLE.observe(...)`, advance `_runtime`, emit
`RebalanceSettled`.

**Invariants:** (1) reverts `RiptideNoSurplus` on `S<0`; (2) no state change / no
transfer in static context (invariant 3); (3) rounding favors maker (invariant 5); (4)
the rebate `pull` amount `≤ S` and cannot exceed the maker's credited balance
(invariant 6).

---

## 11. `RiptideSwapVMRouter`

The Aqua **app** and SwapVM router.

```solidity
contract RiptideSwapVMRouter is AquaSwapVMRouter, RiptideRebalanceInstruction {
    constructor(address aqua, address weth, address owner, string name, string version,
                address kernel, address oracle) AquaSwapVMRouter(aqua, weth, owner, name, version) { ... }

    uint256 private constant USE_AQUA_TRAIT      = 1 << 254;   // verified: MakerTraits.sol
    uint256 private constant PROGRAM_OFFSET_SHIFT = 208;       // verified: MakerTraits.sol

    /// The one custom instruction takes a currently-unallocated `Opcode` slot
    /// (OpcodeList.sol reserves `_XX` placeholders for exactly this). Value [confirm at build].
    uint256 private constant RIPTIDE_REBALANCE_OPCODE = 0xa0;  // free balances-bank slot [confirm at build]

    function buildSwapOrder(address maker, Strategy calldata s) external view returns (ISwapVM.Order memory);
    function buildRebalanceOrder(address maker, Strategy calldata s, uint256 outWad, address resolver)
        external view returns (ISwapVM.Order memory);

    /// Custom instructions extend SwapVM by overriding its real dispatch hook `_runOpcode`,
    /// keyed by the **uint256 opcode value** (there is no `_opcodes()`/`_instructions()` in
    /// `@1inch/swap-vm@0.0.6` — verified: SwapVM.sol `_dispatch`, AquaOpcodes `_runOpcode`).
    /// `AquaOpcodes` is a *reduced* set, so RIPTIDE dispatches the auction and oracle
    /// instructions it needs directly from their libraries, then defers to `super`.
    /// Reserves are the live Aqua balances the router seeds via `AQUA.safeBalances`
    /// (Aqua trait, before `runLoop`), so no balance opcode (`DynamicBalances`) is dispatched.
    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        if      (opcode == RIPTIDE_REBALANCE_OPCODE)             _riptideRebalance(ctx, args);
        else if (opcode == DutchAuctionBalanceIn.opcode.asU8())  DutchAuctionBalanceIn.exec(ctx, args);  // 0x94
        else if (opcode == DutchAuctionBalanceOut.opcode.asU8()) DutchAuctionBalanceOut.exec(ctx, args); // 0x95
        else if (opcode == OraclePriceAdjuster.opcode.asU8())    OraclePriceAdjuster.exec(ctx, args);    // 0xb2
        else super._runOpcode(ctx, opcode, args);   // XYCSwap 0x50, FeeProtocol 0x80, Decay 0x9c, Deadline 0x20, Salt 0x02
    }
}
```

**Opcode set:** the instructions a RIPTIDE program uses are `XYCSwap(0x50)`,
`FeeProtocol(0x80)`, `DutchAuctionBalanceIn/Out(0x94/0x95)`, `Decay(0x9c)`,
`OraclePriceAdjuster(0xb2)`, `Deadline(0x20)`, `Salt(0x02)` — all
**[verified]** in [`OpcodeList.sol`](../../refs/swap-vm/src/libs/OpcodeList.sol) — plus
the one custom `RiptideRebalanceInstruction` at `RIPTIDE_REBALANCE_OPCODE` **[confirm at
build]**. Reserves are not loaded by an opcode: the router seeds `balanceIn/balanceOut`
from live Aqua balances via `AQUA.safeBalances` when the Aqua trait is set (before
`runLoop`), so `DynamicBalances(0x91)` is not used. Because `AquaOpcodes` dispatches only
a subset (XYCSwap, FeeProtocol, Decay, Deadline, Salt), the `_runOpcode` override above
adds the auction and oracle instructions directly; see
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §3.1.

**Size-contingent split [confirm at build]:** if the dispatched set exceeds EIP-170,
split into `RiptideSwapVMRouter` (swap opcodes) and `RiptideRebalanceRouter` (rebalance
opcodes), both registered as the same Aqua app class with identical authority.

**Invariants:** builds orders with the verified trait layout; reads balances only via
`AQUA.safeBalances`; reentrancy guard before any token movement
(`RiptideReentrantExecution`); preserves all seven SwapVM invariants
([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §9).

---

## 12. `RiptideAuctionSettler`

Periphery entrypoint resolvers call to settle a rebalance. Builds the rebalance order
and invokes `router.swap(...)` with the resolver as taker; holds the resolver-facing
authorization surface.

```solidity
contract RiptideAuctionSettler {
    function settleRebalance(
        address maker, Strategy calldata s, uint256 outWad,
        uint256 maxInWad, uint40 deadline
    ) external returns (RebalanceResult memory);
}
```

**Invariants:** the program's **first** instruction is `Deadline(0x20)`, so an expired
order reverts before any balance is touched; the settler never holds custody; a reverted
rebalance leaves all balances unchanged (checks-effects-interactions + reentrancy guard).
Malicious/rank-losing bids cannot settle at a loss to the maker (guaranteed by
`RiptideNoSurplus`, not by the settler).

---

## 13. `RiptideQuoter` and `RiptideLens`

```solidity
interface IRiptideQuoter {
    function quoteSwap(Strategy calldata s, QuoteKind kind, uint256 rawAmount)
        external view returns (uint256 amountIn, uint256 amountOut, uint24 feeBpsApplied, uint128 sigmaWad);
    function previewRebalance(Strategy calldata s, uint256 outWad)
        external view returns (RebalanceResult memory, uint128 auctionPriceNowWad);
}

interface IRiptideLens {
    /// Reconcile strategy config, router runtime, Aqua balances, wallet balance, allowance.
    function strategyState(address maker, bytes32 strategyHash, address base, address quote)
        external view returns ( /* config, ControllerState, aquaBase, aquaQuote, walletBal, allowance */ );
}
```

**Invariants:** both are read-only; `RiptideQuoter` reproduces exact settlement math
including the current dynamic fee and rounding (so off-chain solver quotes match
on-chain — the differential-testing target in
[`DIFF_ORACLE.md`](DIFF_ORACLE.md)); `RiptideLens` reads live Aqua balances,
never cached.

---

## 14. `RiptideBatchExecutor` / `IRiptideBatchExecutor`

Atomic multi-strategy taker settlement.

```solidity
interface IRiptideBatchExecutor {
    struct FillRequest { bytes order; address maker; bytes32 strategyHash; uint64 expectedVersion; uint256 amount; }
    struct Route {
        address base; address quote; QuoteKind kind; address recipient; address refundRecipient;
        uint40 deadline; bytes32 salt; uint256 aggregateLimit; FillRequest[] fills;
    }
    function execute(Route calldata route) external payable returns (uint256 amountIn, uint256 amountOut);
}
```

**Invariants:** hard `maxFills` bound (`RiptideTooManyFills`); one occurrence per
`strategyKey` (`RiptideDuplicateStrategy`); per-fill version check
(`RiptideStaleVersion`); aggregate slippage/deadline (`RiptideSlippageExceeded`,
`RiptideDeadlineExpired`); any failed fill reverts the whole route; CEI ordering +
reentrancy guard before token movement. One market + one direction per route, so
freshly credited maker inventory cannot be recursively consumed in the same route
.

---

## 15. `RiptideDemoToken`

Standard 18-decimal ERC-20 with a faucet for the demo only (OpenZeppelin ERC-20).
No production role. The deployment supports **standard ERC-20 only**; rebasing,
fee-on-transfer, and callback tokens are rejected/unsupported
([`PROTOCOL.md`](PROTOCOL.md) §17).

---

## 16. Verification and testing plan

RIPTIDE is verified with **Foundry** (unit, fuzz, and stateful-invariant tests) against a
**Python arbitrary-precision differential oracle**
([`DIFF_ORACLE.md`](DIFF_ORACLE.md)). Every property below ships a **negative
control** — a deliberately broken variant that must make the test fail — so a passing
suite is evidence the test can fail, not just that it is silent.

**V1 — β-split conservation (fuzz + differential).** For all `0 < beta < 1e18` and
`S >= 0`, `DiamondSplit.split` satisfies:

```text
payToResolver + retainToLP == S
retainToLP >= floor(beta * S / 1e18)          (maker retains at least βS)
payToResolver == floor((1e18 - beta) * S / 1e18)
```

Negative control: a rounding variant that over-pays the resolver must fail V1.

**V2 — no-surplus safety (unit + fuzz).** `RiptideRebalanceInstruction` reverts whenever
`executedIn < staleIn` (no maker value leaves on a loss). Negative control: a build that
skips the `S >= 0` check must fail V2.

**V3 — quote/swap fee determinism (unit + fuzz).** `RiptideLvrFeeProvider.getRecipientAndFees`
returns identical `feeBps` for identical committed state regardless of the context flag —
the oracle/controller advance state only when `!isStaticContext` (supports invariant 3).
Negative control: a build that mutates controller state in static context must fail V3.

**V4 — fee-band containment (fuzz).** The applied `feeBps` is always in
`[feeMin, feeMax] ⊂ (0, BPS)`, so the `FeeProtocol` guard (`totalFeeBps < BPS`, §8) can
never trip. Negative control: unclamped controller output that exceeds `feeMax` must fail
V4.

**V5 — deadline-first revert (stateful invariant).** Because `Deadline(0x20)` is the
program's first instruction, an expired order reverts before any balance is touched: the
invariant asserts Aqua balances are unchanged across a reverted expired rebalance.
Negative control: reordering the deadline after a balance-touching instruction must fail
V5.

**Differential layer.** The Solidity math libraries and the TypeScript `riptide-math`
mirror both consume the committed JSON vectors and must match the recorded WAD interval
bit-for-bit under the declared rounding ([`DIFF_ORACLE.md`](DIFF_ORACLE.md)); a
mismatch is presumed a kernel bug, not a vector bug.

**Honest edges (declared, not hidden):** the CPMM swap, `DutchAuction`, `Decay`,
`FeeProtocol`, and Aqua primitives are **1inch-audited** and are modelled as trusted
callees (not re-verified here); transcendental/EWMA numerical bounds are validated by the
differential tests in [`DIFF_ORACLE.md`](DIFF_ORACLE.md); the Layer-2 economic
claim (Diamond β-retention bound, [`SOURCES.md`](SOURCES.md) §3 K2) is validated
**statistically by simulation**, not proved on-chain and not asserted as a closed-form
theorem in the contracts.

---

## 17. Per-contract invariant summary

| Contract | Load-bearing invariant | Enforced by |
| --- | --- | --- |
| `RiptideLvrFeeProvider` | fee deterministic in-block; `∈ (0,BPS)` | V3, V4; `FeeProtocol` guard |
| `RiptideVolatilityOracle` | no mutation in static ctx; stale freeze; clamp | invariant 3; freshness read |
| `RiptideRebalanceInstruction` | `S>=0` or revert; maker-favorable split; no static mutation | V1, V2; invariant 3 |
| `RiptideSwapVMRouter` | seven SwapVM invariants; live-balance reads; reentrancy | [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §9 |
| `RiptideBatchExecutor` | bounded fills; version/slippage/deadline; atomic revert | §14 checks |
| math libraries | in-domain or revert; explicit rounding | differential-oracle tests |
