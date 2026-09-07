# RIPTIDE SwapVM Program Encoding

Normative encoding of how RIPTIDE's mathematics
([`LVR_MATH.md`](LVR_MATH.md)) become SwapVM bytecode over Aqua. Owns opcode
selection, program bytes, canonical instruction order, the seven SwapVM
invariants, and the Aqua primitive mapping. Does **not** define contract APIs
([`CONTRACTS.md`](CONTRACTS.md)) or economics ([`PROTOCOL.md`](PROTOCOL.md)).

Every opcode, encoding, and constant cited here was read from the files under
[`refs/swap-vm/src`](../../refs/swap-vm/src); each such claim gives its file and is
marked **[verified]**. Anything not yet confirmed against a pinned commit is marked
**[confirm at build]**. The build consumes the **official published**
`@1inch/swap-vm` package (`@1inch/swap-vm@0.0.6` at the pinned local mirror) and
`@1inch/aqua` at their latest versions; the files under `refs/swap-vm/src` are a
**read-only** mirror used for citation, not a vendored dependency.

---

## 1. The three byte layers

RIPTIDE treats "payload", "program", and "strategy" as **three distinct byte
layers** — they are not interchangeable:

1. **RIPTIDE payload** — the fixed-length policy struct encoded by
   `RiptideStrategyCodec` (market, CPMM parameters, fee policy, auction policy, oracle
   config, fee-provider binding). Layout in §7.
2. **SwapVM program** — the opcode bytecode the VM executes. Each instruction is
   `[opcode:1][argsLen:1][args:N]` **[verified, whitepaper §3.2 / Figure 2]**. The
   RIPTIDE payload immediately precedes the program in the order data and is committed
   by the program-offset trait (§6).
3. **Aqua strategy bytes** — `abi.encode(ISwapVM.Order)` with `maker`, `traits`, and
   `data` (the program). Aqua commits `strategyHash = keccak256(abi.encode(order))`
   **[verified: Aqua `ship` / `IAqua.sol`]**.

Identifiers:

```text
policyHash   = keccak256(riptidePayload)          // SDK/audit identity
strategyHash = keccak256(abi.encode(swapVMOrder)) // Aqua commitment + router runtime key
```

`strategyHash` is the router runtime key; `policyHash` cannot substitute for it.

---

## 2. Units

Units follow SwapVM and [`LVR_MATH.md`](LVR_MATH.md) §1.

| Type | Solidity | Scale | Meaning |
| --- | --- | --- | --- |
| Raw token amount | `uint256` | token decimals | Transferred / approved / Aqua-allocated |
| `AmountWad` | `uint128` | `1e18` | Amount normalized for math |
| `PriceWad` | `uint128` | `1e18` | Displayed quote per base |
| `RateWad` | `uint128` | `1e18` | Native output per input |
| `VarWad` | `uint128` | `1e18` | Realized-variance state (`var_k`) |
| `FeeUnits` | `uint24` | `BPS = 1e7` | Fee rate; `1e7 = 100%` **[verified: `FeeFlat.sol`, `IProtocolFeeProvider.sol`]** |
| `Beta` | `uint64` | `1e18` | Retention fraction in `(0,1)` |

---

## 3. Opcode inventory RIPTIDE uses

RIPTIDE composes existing SwapVM instructions and adds **one** custom instruction.
Opcode numbers are **[verified]** from
[`refs/swap-vm/src/libs/OpcodeList.sol`](../../refs/swap-vm/src/libs/OpcodeList.sol)
and each instruction's `exec`.

| Opcode | Instruction | Source file | Role in RIPTIDE |
| ---: | --- | --- | --- |
| `0x80` | `FeeProtocol` | [`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol) | **Mechanism 1** — dynamic fee via provider mode (§4). |
| `0x50` | `XYCSwap` (CPMM) | [`XYCSwap.sol`](../../refs/swap-vm/src/instructions/XYCSwap.sol) | Constant-product swap `x·y=k` (the AMM leg). **[verified: `OpcodeList.sol` line 106]** |
| `0x94/0x95` | `DutchAuctionBalanceIn/Out` | [`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol) | **Mechanism 2** — declining-price rebalancing schedule (§5). |
| `0x9c` | `Decay` | [`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) | **Mechanism 2** — anti-sandwich reverse-swap penalty (§5). |
| `0xb2` | `OraclePriceAdjuster` | [`OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol) | Stale-price protection; feeds revealed price to oracle. |
| `0x20` | `Deadline` | [`Controls.sol`](../../refs/swap-vm/src/instructions/Controls.sol) | Reverts past deadline; placed **first** so an expired order reverts before any balance is touched. |
| `0x02` | `Salt` | [`Controls.sol`](../../refs/swap-vm/src/instructions/Controls.sol) | Unique order identity; contributes to program hash. |
| custom | `RiptideRebalanceInstruction` | (new) | **Mechanism 2** — surplus measurement + β-split + oracle write. |

> The CPMM swap opcode is `XYCSwap` = **0x50** **[verified: `OpcodeList.sol` line 106]**;
> the whitepaper labels the family `xycSwapXD`. `Decay`'s per-`orderHash`
> offset and its `!isStaticContext` storage discipline are **[verified: `Decay.sol`
> lines ~76–79]**.
>
> **Balance sourcing (no opcode).** RIPTIDE orders set the Aqua trait
> (`USE_AQUA_TRAIT = 1<<254`, §6), so the router seeds `balanceIn/balanceOut` from the
> maker's live Aqua reserves via
> `AQUA.safeBalances(maker, router, orderHash, tokenIn, tokenOut)` **before** `runLoop`
> **[verified: [`SwapVM.sol`](../../refs/swap-vm/src/SwapVM.sol) L167–169 (quote),
> L221–222 (swap)]**. RIPTIDE therefore uses **no** balance opcode. `DynamicBalances`
> (0x91) is *not* an Aqua reader — it sets the registers from the router's **own**
> persistent per-`orderHash` storage (virtual reserves initialized from literal
> `[balanceA, balanceB]` args, written back when `!isStaticContext`) **[verified:
> [`Balances.sol`](../../refs/swap-vm/src/instructions/Balances.sol) L101–125]** — so
> emitting it would overwrite the Aqua-seeded reserves. It is deliberately absent.

### 3.1 Opcode dispatch via `_runOpcode` override (EIP-170)

The official `@1inch/swap-vm@0.0.6` has **no** `_opcodes()` function-pointer array. A
router's opcode set is extended by overriding
`_dispatch(Context, uint256 opcode, bytes)`, which `AquaSwapVMRouter` forwards to
`_runOpcode(ctx, opcode, args)` — an if-else chain keyed by the **uint256 opcode value**
that reverts `UnknownOpcode` for anything it does not handle **[verified:
[`AquaSwapVMRouter.sol`](../../refs/swap-vm/src/routers/AquaSwapVMRouter.sol) L26–27;
[`AquaOpcodes.sol`](../../refs/swap-vm/src/opcodes/AquaOpcodes.sol) L27]**.

`AquaOpcodes` dispatches a **reduced** set (Jump, `Deadline`, `XYCSwap`, `FeeProtocol`,
`Decay`, `Salt`, token validators, …) and does **not** dispatch `DynamicBalances`
(0x91), `DutchAuctionBalanceIn/Out` (0x94/0x95), or `OraclePriceAdjuster` (0xb2) — those
are dispatched only by the full [`Opcodes.sol`](../../refs/swap-vm/src/opcodes/Opcodes.sol)
(lines 58, 69–70, 88) **[verified]**. So `RiptideSwapVMRouter` overrides `_runOpcode` to
dispatch its one custom instruction and the **auction and oracle** instructions directly
from their libraries, falling back to `super._runOpcode` for the opcodes `AquaOpcodes`
already covers. It does **not** dispatch `DynamicBalances` (0x91): RIPTIDE's reserves are
the live Aqua balances the router seeds into `balanceIn/balanceOut` via `AQUA.safeBalances`
when the Aqua trait is set (before `runLoop`, `SwapVM.sol` L167–169/L221–222), so no
balance opcode is used:

```solidity
uint256 private constant RIPTIDE_REBALANCE_OPCODE = 0xa0;  // free balances-bank slot [confirm at build]

function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
    if      (opcode == RIPTIDE_REBALANCE_OPCODE)             _riptideRebalance(ctx, args);
    else if (opcode == DutchAuctionBalanceIn.opcode.asU8())  DutchAuctionBalanceIn.exec(ctx, args);  // 0x94
    else if (opcode == DutchAuctionBalanceOut.opcode.asU8()) DutchAuctionBalanceOut.exec(ctx, args); // 0x95
    else if (opcode == OraclePriceAdjuster.opcode.asU8())    OraclePriceAdjuster.exec(ctx, args);    // 0xb2
    else super._runOpcode(ctx, opcode, args);   // XYCSwap 0x50, FeeProtocol 0x80, Decay 0x9c, Deadline 0x20, Salt 0x02
}
```

The `.opcode.asU8()` / `.exec(ctx, args)` accessor pattern is exactly how the stock
dispatchers compare and run each instruction **[verified: `AquaOpcodes.sol`,
`Opcodes.sol`]**; RIPTIDE's custom opcode takes a free `Opcode` slot (value chosen at
build, illustrated as `0xa0`) **[confirm at build]**.

Whether the resulting dispatched set fits under EIP-170 in one contract is an empirical
build-time question **[confirm at build]**. If it does not, the fallback is to split into
two routers sharing the same Aqua app authority, each overriding `_runOpcode` for only
its mechanism's opcodes:

- `RiptideSwapVMRouter` — swap programs (Mechanism 1): `FeeProtocol`, `XYCSwap`,
  `OraclePriceAdjuster`, `Deadline`, `Salt`.
- `RiptideRebalanceRouter` — rebalance programs (Mechanism 2): `XYCSwap`,
  `DutchAuction*`, `Decay`, `RiptideRebalanceInstruction`, `Deadline`, `Salt`.

This split is called out in [`CONTRACTS.md`](CONTRACTS.md) and
[`SYSTEM.md`](SYSTEM.md) as the size-contingent option.

---

## 4. Mechanism 1 wiring — the dynamic fee via `FeeProtocol` (0x80)

`FeeProtocol` supports **provider** entries resolved by `staticcall`. Its encoding is
**[verified]** from the `@dev` block and `build`/`exec` in
[`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol):

```text
args = [ uint8 header,
         { uint8 flags, address target, uint24 feeBps?, uint24 surplusBps? } * count,
         uint216 surplusEstimate? ]

header : [ bit0 isTokenIn, bit3 _, bits4..7 count ]
flags  : [ bit0 isProvider, bit1 takeFlatFee, bit2 takeSurplusFee, bits3..7 _ ]

  - feeBps/surplusBps are encoded ONLY for non-provider (fixed) receivers.
  - For a provider entry (isProvider=1) neither is encoded; both are RETURNED by
    the provider's getRecipientAndFees(...).                       [verified: exec line ~181]
  - surplusEstimate (uint216) is appended iff any takeSurplusFee flag is set.
```

**RIPTIDE's fee instruction** is a `FeeProtocol` with exactly one **provider** entry:

```text
ProviderConfig {
  provider       = RiptideLvrFeeProvider
  takeFlatFee    = true      // dynamic taker fee = LVR fee (Mechanism 1)
  takeSurplusFee = <policy>  // optional maker-paid surplus fee for recapture accounting
}
isTokenIn = true             // charge on the input leg (canonical Aqua ordering)
```

At execution `FeeProtocol` calls **[verified: exec lines 181–188]**:

```text
(receiver, feeBps, surplusBps) =
    RiptideLvrFeeProvider.getRecipientAndFees(
        orderHash, maker, taker, tokenIn, tokenOut, isExactIn)
```

and enforces `totalFeeBps < BPS && totalSurplusBps < BPS` **[verified: line 217]**.
RIPTIDE's provider always returns a fee inside `[feeMin, feeMax] ⊂ (0, BPS)`
([`LVR_MATH.md`](LVR_MATH.md) §4.2), so the guard never trips.

Because `FeeProtocol` is a **wrapping** instruction (adjust amount → `runLoop()` →
finalize, using floor division on the fee) **[verified: exec lines 225–251]**, no new
fee flow is introduced — RIPTIDE only supplies the *rate*. Determinism across
quote/swap is guaranteed by computing that rate from committed state in static context
([`LVR_MATH.md`](LVR_MATH.md) §4.4).

> Fees routed via `FeeProtocol` transfer to the receiver directly. To keep fees inside
> the Aqua balance system, the whitepaper (§5.4) names an
> `aquaDynamicProtocolFeeAmountInXD` variant that transfers via Aqua `pull()`; if that
> opcode is present in the pinned build, RIPTIDE prefers it and the provider interface
> is identical **[confirm at build]**.

---

## 5. Mechanism 2 wiring — the rebalancing auction

`DutchAuction` encoding is **[verified]** from
[`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol):

```text
DutchAuctionBalanceIn  (0x94):  balanceIn  = balanceIn  * decay^elapsed / ONE
DutchAuctionBalanceOut (0x95):  balanceOut = balanceOut * ONE / decay^elapsed
args = [ uint40 start, uint16 duration, uint64 decay ]
revert if block.timestamp > start + duration.
```

`Decay` encoding is **[verified]** from
[`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol): `args = [uint16 period]`;
a per-`orderHash` virtual reserve offset penalizes the reverse direction and decays
over `period`; storage is written only when `!ctx.vm.isStaticContext`.

`RiptideRebalanceInstruction` (custom) encoding:

```text
args = [ uint64 beta,          // retention fraction, 1e18 scale, in (0,1)
         uint128 staleInWad,   // baseline input at the pre-rebalance stale CPMM curve
         address resolver ]    // rebate recipient (the auction winner / taker)
```

Its `exec` (normative behavior; math in [`LVR_MATH.md`](LVR_MATH.md) §5.3):

1. Read live balances via Aqua `safeBalances` (never cached) **[verified pattern]**.
2. Compute `S = executedIn - staleInWad` from the settled registers; require `S >= 0`
   else revert (`RiptideNoSurplus`).
3. `payToResolver = Down((1 - beta) * S)`; `retainToLP = S - payToResolver`.
4. Rebate via Aqua `pull(maker, strategyHash, tokenIn, payToResolver, resolver)`
   (§8). `retainToLP` needs no transfer — it is already in the maker's balance.
5. Only when `!ctx.vm.isStaticContext`: record the revealed price to
   `RiptideVolatilityOracle` and emit `RebalanceSettled`. In static (quote) context,
   compute-only — no state change (invariant 3).

### 5.1 Canonical rebalance program ordering

```text
Deadline (0x20)              // first instruction — expired order reverts before any balance
  // router has already seeded balanceIn/Out from live Aqua reserves (Aqua trait; safeBalances, SwapVM.sol:222)
  → DutchAuctionBalanceIn/Out(0x94/0x95)   // declining-price schedule on the live reserves
  → Decay (0x9c)             // arm/apply anti-sandwich reverse penalty
  → XYCSwap (0x50)           // compute rebalance amounts (CPMM)
  → RiptideRebalanceInstruction   // surplus check + β-split rebate + oracle write
  → Salt (0x02)              // unique id
```

Placing `Deadline` first means an expired order reverts before any balance is touched;
this is asserted as the deadline-first stateful invariant (V5) in
[`CONTRACTS.md`](CONTRACTS.md) §16.

---

## 6. Canonical swap program ordering & MakerTraits

For an ordinary taker swap (Mechanism 1), RIPTIDE follows the **verified canonical
Aqua ordering** (whitepaper §5.5): `aquaProtocolFee → [swap] → flatFee → swap → salt`.
With the protocol fee first, it is extracted from `amountIn` before balances are
touched, preserving the conservation invariant
`pool balance + protocol fee = initial balance + total amountIn` **[verified: §5.5]**:

```text
Deadline (0x20)
  → FeeProtocol (0x80, provider = RiptideLvrFeeProvider)   // wraps the inner swap
       └─ OraclePriceAdjuster (0xb2)? → XYCSwap (0x50)   // on router-seeded live Aqua reserves
  → Salt (0x02)
```

Orders are built with the pinned `MakerTraits` packing
**[verified: `MakerTraits.sol`]**:

```text
USE_AQUA_TRAIT      = 1 << 254   // = USE_AQUA_INSTEAD_OF_SIGNATURE_BIT_FLAG
                                 //   [verified: MakerTraits.sol]
PROGRAM_OFFSET_SHIFT= 208        // program slice index packed into MakerTraits
traits = MakerTraits.wrap( USE_AQUA_TRAIT
                         | (RIPTIDE_PAYLOAD_LENGTH << PROGRAM_OFFSET_SHIFT) )
```

so the RIPTIDE payload precedes the program and is committed by the trait. The exact
bit packing of the program slice index is owned by
[`MakerTraits.sol`](../../refs/swap-vm/src/libs/MakerTraits.sol)
(`ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160`, 16-bit slices) and must be reproduced
from it, not reinvented **[confirm at build]**.

---

## 7. RIPTIDE payload version 1

Fixed-length, packed big-endian, no dynamic field.
Exact offsets are frozen once the codec is implemented; the field set is normative now:

| Field | Type | Notes |
| --- | --- | --- |
| Magic `RPT1` | `bytes4` | `0x52505431` |
| Encoding version | `uint8` = 1 | |
| Base token | `address` | |
| Quote token | `address` | |
| Maker salt | `bytes32` | unique identity |
| CPMM base reserve | `uint128 AmountWad` | initial, shipped into Aqua |
| CPMM quote reserve | `uint128 AmountWad` | initial, shipped into Aqua |
| feeMin | `uint24 FeeUnits` | Mechanism 1 |
| feeMax | `uint24 FeeUnits` | Mechanism 1 |
| lambda (EWMA) | `uint64` (1e18) | Mechanism 1 |
| Kp, Ki, Imax | `uint64`×3 (1e18) | PI controller |
| sigmaMin, sigmaMax | `uint64`×2 (1e18) | vol clamp |
| beta | `uint64` (1e18) | Mechanism 2, `(0,1)` |
| auctionDuration | `uint16` | seconds |
| decay | `uint64` | Dutch decay/sec, `0<decay<1` |
| antiSandwichPeriod | `uint16` | `Decay` period, seconds |
| oracle address | `address` | Chainlink feed |
| oracle decimals | `uint8` | |
| maxStaleness | `uint16` | seconds |
| feeProvider | `address` | `RiptideLvrFeeProvider` binding |

`RiptideStrategyCodec.validateStructure` rejects: zero/identical
tokens; `feeMin == 0` or `feeMin >= feeMax`; `feeMax >= BPS`; `lambda`, `beta`, `decay`
outside `(0,1)`; `sigmaMin >= sigmaMax`; a zero oracle/provider address; wrong magic,
version, or length. Decoding bytes is **never** sufficient execution authorization
— every runtime path re-checks live Aqua balances and the domain guards
in [`LVR_MATH.md`](LVR_MATH.md) §7.

---

## 8. Aqua primitive mapping

All five verified Aqua primitives
([`refs/aqua/src/interfaces/IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol))
map to a RIPTIDE action:

| Aqua primitive (verified signature) | RIPTIDE use |
| --- | --- |
| `ship(app, strategy, tokens, amounts) → strategyHash` | Maker publishes a strategy; inventory enters Aqua (no vault). |
| `safeBalances(maker, app, strategyHash, t0, t1) → (b0,b1)` | Every quote/swap/rebalance reads **live** reserves; never cached. |
| `pull(maker, strategyHash, token, amount, to)` | Swap output to taker; **β rebate** to resolver (§5). |
| `push(maker, app, strategyHash, token, amount)` | Swap input credited to maker's strategy. |
| `dock(app, strategyHash, tokens)` | Maker cancels a strategy and releases balances. |

The router is the Aqua **app**; it holds the minimum app authority to move only the
maker's own strategy balances
**[verified: `AQUA.safeBalances(order.maker, address(this), …)` in
[`SwapVM.sol`](../../refs/swap-vm/src/SwapVM.sol)]**.

---

## 9. Preservation of the seven SwapVM invariants

Any new instruction must maintain the seven core invariants (whitepaper §4)
**[verified]**. How RIPTIDE preserves each:

| Invariant | How RIPTIDE preserves it |
| --- | --- |
| 1. ExactIn/Out symmetry | CPMM leg is the stock `XYCSwap` (0x50); the fee provider returns the same rate for both directions; `RiptideRebalanceInstruction` computes `S` from settled registers symmetrically. |
| 2. Swap additivity | RIPTIDE adds no path that makes splitting profitable; the CPMM stays subadditive; the fee is a per-swap rate, not a size rebate. |
| 3. Quote/Swap consistency | Fee provider and rebalance instruction change **no** state in static context; controller/oracle advance only when `!isStaticContext` ([`LVR_MATH.md`](LVR_MATH.md) §4.4, §5) — the discipline verified in `Decay.sol`. |
| 4. Price monotonicity | CPMM `amountOut/amountIn` is non-increasing in size; the fee only lowers effective output further; the auction schedule is monotone in time, not size. |
| 5. Rounding favors maker | `amountIn` ceil, `amountOut` floor; the β rebate is floored so the maker retains `≥ β·S` ([`LVR_MATH.md`](LVR_MATH.md) §5.3). |
| 6. Balance sufficiency | Reverts if `amountOut > balanceOut`; the β rebate `pull` cannot exceed the surplus already credited. |
| 7. Strategy liveness | `Decay` restores over time; reverse swaps remain possible; a depleted side is refilled by the opposite flow. |

---

## 10. Rounding & determinism contract (boundary restatement)

Full rounding rules are normative in [`LVR_MATH.md`](LVR_MATH.md) §1.1.
At the SwapVM boundary: required raw input rounds up, delivered raw
output rounds down, WAD↔raw conversion is directional, `minAmountOut`/`maxAmountIn`
compare **actual raw transferred** amounts, and no arithmetic falls back to truncation
— domain failures revert with canonical custom errors ([`CONTRACTS.md`](CONTRACTS.md)).

---

## 11. Open items

- **[confirm at build]** Any `aqua*` fee-opcode variant present in the pinned SwapVM
  commit (§4), and the RIPTIDE custom-opcode slot value (§3.1).
- **[confirm at build]** EIP-170 fit of the dispatched opcode set in one router vs the
  two-router split (§3.1).
- **[confirm at build]** Exact `MakerTraits` program-slice bit packing (§6) and the
  frozen payload offsets (§7), reproduced from `MakerTraits.sol` and committed as a
  deterministic vector under `test/vectors/`.
