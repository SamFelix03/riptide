# Build resolutions

Resolutions for every `[confirm at build]` item from `docs/SWAPVM_INTEGRATION.md` §11,
verified against the **pinned** dependencies installed via `forge install` / npm (never
`refs/`).

Date verified: 2026-08-28.

---

## Dependency source split (phase doc correction)

The phase plan references npm packages `@1inch/swap-vm` and `@1inch/aqua` — these are
**not published on public npm** (404). Resolved split:

| Layer | Source | Pin |
| --- | --- | --- |
| Solidity (Foundry) | `forge install` from GitHub | `1inch/swap-vm@v1.0.2`, `1inch/aqua@v1.0.0`, `1inch/solidity-utils@6.9.14` |
| TypeScript | npm exact versions | `@1inch/swap-vm-sdk@0.4.1`, `@1inch/aqua-sdk@0.3.1`, `viem@2.48.4` |

This preserves `SYSTEM.md` §6 intent: official published sources, never the
`refs/` mirror as a build input.

---

## 1. `aqua*` fee-opcode variant (`SWAPVM_INTEGRATION.md` §4, §11)

**Question:** Does `aquaDynamicProtocolFeeAmountInXD` exist in the pinned SwapVM commit?

**Resolution:** **Yes.** Present in pinned `1inch/swap-vm@v1.0.2`:

- File: `lib/swap-vm/src/instructions/Fee.sol`, function `_aquaDynamicProtocolFeeAmountInXD` (line 212)
- Dispatched in `lib/swap-vm/src/opcodes/AquaOpcodes.sol` at opcode table index **31** (line 71)
- Related: `_aquaProtocolFeeAmountInXD` at index **29** (line 69)

**RIPTIDE Mechanism 1 decision (Phase 8):** Mechanism 1 still uses the `FeeProtocol` /
`IProtocolFeeProvider` provider path (`_dynamicProtocolFeeAmountInXD` at index **30**) as
normative in `SWAPVM_INTEGRATION.md` §4. The Aqua pull variants exist for makers who want
fees retained inside Aqua balances; RIPTIDE may evaluate switching in Phase 8 but the
default build path is the ordinary provider `staticcall` flow documented in the spec.

---

## 2. Custom rebalance opcode slot (`SWAPVM_INTEGRATION.md` §3.1, §11)

**Question:** Confirm free `Opcode` slot for `RiptideRebalanceInstruction` (illustrated as `0xa0`).

**Resolution:** **`OpcodeList.sol` does not exist in v1.0.2.** Opcodes are `uint8` indices
into the `_opcodes()` function-pointer array (`lib/swap-vm/src/libs/VM.sol` line 124).

Pinned `AquaOpcodes._opcodes()` (`lib/swap-vm/src/opcodes/AquaOpcodes.sol`):

| Index | Instruction |
| --- | --- |
| 18 | `XYCSwap._xycSwapXD` |
| 20 | `Decay._decayXD` |
| 21 | `Controls._salt` |
| 22 | `Fee._flatFeeAmountInXD` |
| 23–27 | `_notInstruction` (free placeholders) |
| 28–31 | Protocol fee variants |
| 32–34 | PeggedSwap, Extruction, onlyTxOrigin |

**Decision:** The illustrated `0xa0` (160 decimal) is **invalid** for v1.0.2 — the table
has only 35 entries (indices 0–34). RIPTIDE will:

1. **Phase 8:** Override `_opcodes()` in `RiptideSwapVMRouter`, **append** the custom
   rebalance handler at index **35** (first slot after the stock table, per the comment
   "Add new instructions here" at line 60), **or** occupy placeholder index **23** if
   bytecode-size constraints favor reusing a free slot.

Frozen constant for Phase 4+ encoding vectors: `RIPTIDE_REBALANCE_OPCODE = 35` (append),
with index 23 documented as the size-contingent fallback.

---

## 3. `MakerTraits` program-slice bit packing (`SWAPVM_INTEGRATION.md` §6, §11)

**Question:** Confirm `USE_AQUA_TRAIT`, `PROGRAM_OFFSET_SHIFT`, `ORDER_DATA_SLICES_INDEXES_BIT_OFFSET`.

**Resolution** from `lib/swap-vm/src/libs/MakerTraits.sol` (v1.0.2):

| Constant | Value | Source line |
| --- | --- | --- |
| `USE_AQUA_INSTEAD_OF_SIGNATURE_BIT_FLAG` | `1 << 254` | line 30 |
| `ORDER_DATA_SLICES_INDEXES_BIT_OFFSET` | `160` | line 41 |
| `ORDER_DATA_SLICES_INDEX_BIT_MASK` | `type(uint16).max` | line 42 |
| `ORDER_DATA_SLICES_INDEX_BIT_SIZE_SHL` | `4` (16-bit slices) | line 43 |

**`PROGRAM_OFFSET_SHIFT = 208` does not exist** in v1.0.2. Program payload offset is
encoded via four 16-bit slice indexes packed at bit offset 160 (`OrderDataSlices.Program`
is slice index 4, resolved through `_getDataSlice` / `_getOffset`). Phase 4 codec must
reproduce this packing from `MakerTraitsLib.build`, not the obsolete 208-bit shift from
the pre-v1.0.2 docs.

Frozen vector inputs for Phase 4:

```solidity
USE_AQUA_TRAIT = 1 << 254;
ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160;
// No PROGRAM_OFFSET_SHIFT in v1.0.2 — use MakerTraitsLib.build slice encoding
```

---

## 4. Official Aqua / SwapVM addresses (`INDEX.md` Open Items #2)

**Resolution** (verified from `@1inch/aqua-sdk@0.3.1` / `@1inch/swap-vm-sdk@0.4.1` constants
and 1inch verified contract addresses page, Ethereum mainnet):

| Contract | Address (checksummed) |
| --- | --- |
| Aqua registry | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` |
| AquaSwapVMRouter v1.0.2 | `0x111111338c5091e8440b67b168bae16a668ac0de` |

Fork smoke test (`test/fork/Provenance.t.sol`) ships against the registry on an Ethereum
mainnet fork and reads `safeBalances` — **passes**.

**Testnet note:** Sepolia has the vanity registry but not the vanity router (per 1inch docs
Aug 2026). Integration testing uses **mainnet fork**, not testnet deployment.

---

## 5. EIP-170 two-router split (`SWAPVM_INTEGRATION.md` §3.1, §11)

**Status:** **Resolved in Phase 8** (measured 2026-08-28).

| Contract | Runtime bytecode |
|----------|------------------|
| `AquaSwapVMRouter` (stock) | 24,906 B |
| `RiptideSwapVMRouter` (swap-only) | 34,512 B |
| `RiptideRebalanceRouter` (rebalance) | 36,220 B |

**Decision:** Two-router split implemented. Both RIPTIDE routers exceed the 24 KB mainnet
limit because the pinned SwapVM core is already at the boundary. Local Anvil deployment
succeeds for integration tests. Dutch handlers live in `RiptideDutchHandlers.sol` (copied,
not inherited) to avoid inheritance linearization conflicts with `AquaSwapVMRouter`.

**Opcode table note (via-ir build):** `AquaOpcodes._opcodes()` materializes the table with
an assembly length write that overwrites slot 0, so **runtime dispatch indices are one less**
than source-line indices in `AquaOpcodes.sol` (e.g. `XYCSwap` dispatches at **17**, not 18).
`RiptideConstants.sol` encodes these runtime indices. `_extendOpcodes()` must not repeat the
assembly hack — use `new` dynamic arrays to append RIPTIDE handlers at indices 34–37.

**Batch route version authority:** `RiptideBatchExecutor` checks
`rebalanceRouter.runtimeState(strategyKey).version` (not `swapRouter.strategyVersion`).
Swap registration initializes swap-side version; rebalance bumps rebalance-router version.

**`MAX_FILLS`:** governed constant `8` in `RiptideConstants.sol` for `RiptideBatchExecutor`.

---

## 5b. `IProtocolFeeProvider` naming (`CONTRACTS.md` §8 vs pinned swap-vm v1.0.2)

**Question:** Docs name `getRecipientAndFees(...) → (receiver, feeBps, surplusBps)`; what does
pinned SwapVM call?

**Resolution:** Pinned `lib/swap-vm@v1.0.2` uses `getFeeBpsAndRecipient(...) → (uint32 feeBps,
address to)` only (`IProtocolFeeProvider.sol`; `Fee.sol` staticcall at lines 169–180). No
`surplusBps` in v1.0.2. `RiptideLvrFeeProvider` implements the pinned signature; surplus-fee
accounting is deferred to Phase 8 FeeProtocol wiring if a future SwapVM exposes it.

---

## 6. OraclePriceAdjuster (opcode 37) — reserved, unused (`FEATURES.md` 3.1, 5.3)

**Question:** Should `OraclePriceAdjuster` (`_oraclePriceAdjuster1D`) be wired into the
swap program to feed the volatility oracle per FEATURES §3.1?

**Resolution:** **No.** `OraclePriceAdjuster` exists in pinned SwapVM v1.0.2 at opcode
index 37. It reads Chainlink `latestRoundData` and **rewrites `amountIn`/`amountOut`
toward the oracle price** — it is a taker-favorable post-swap price clip, not a volatility
observer. Wiring it into the swap program would:

1. Fight Mechanism 1 (LVR is priced on the CPMM curve, not erased by oracle).
2. Grow bytecode toward EIP-170 (already at 34–36 KB).
3. Only adjust 1→0 direction swaps.

RIPTIDE feeds the loop through auction-revealed price → `RiptideVolatilityOracle.observe`
(called from the rebalance router) and Chainlink via the vol-indexer. Opcode 37 remains
**reserved and unassigned** in `RiptideConstants.sol`.

---

## 7. `surplusBps` — not available in v1.0.2 (`FEATURES.md` 1.8)

**Question:** FEATURES §1.8 references a maker-paid surplus fee via `surplusBps` in
`FeeProtocol.sol`. Is this available?

**Resolution:** **No.** The pinned v1.0.2 provider API is `getFeeBpsAndRecipient(...)
→ (uint32 feeBps, address to)`. `Fee.sol` decodes exactly 64 bytes from the staticcall.
There is no `surplusBps`, `takeSurplusFee`, or `FeeProtocol.sol` in the v1.0.2 tree.

GitHub `main` (undeployed) has `getRecipientAndFees → (address, uint24, uint24)` —
this is the docs-era API that FEATURES 1.8 and older `SWAPVM_INTEGRATION.md` sections
reference. It does not exist in any published release (v1.0.0–v1.0.2).

**Economic substitute:** Mechanism 2 surplus is `executedIn − staleIn`, split by β in
`RiptideRebalanceKernel.splitSurplus`. This is LP/resolver recapture, not a maker-paid
surplus fee. FEATURES 1.8 is documented as "not in v1.0.2; recapture is M2."

---

## 8. `RiptideMakerTraits.PROGRAM_OFFSET_SHIFT = 208` — correct for slice index 3

`RiptideMakerTraits.sol` uses `PAYLOAD_LENGTH << 208`. This is **correct** for
v1.0.2: `MakerTraitsLib.build` packs four 16-bit slice indexes starting at bit 160
(`ORDER_DATA_SLICES_INDEXES_BIT_OFFSET`). With no hooks, all four indexes equal
`PAYLOAD_LENGTH` (226). Slice index 3 (`OrderDataSlices.Program`) lives at bits
208–223, so `(226 << 208)` sets exactly that field. The RIPTIDE codec additionally
sets `USE_AQUA_TRAIT` at bit 254. This matches what `MakerTraitsLib.build` produces
for the no-hooks case. **Do not change this** — it would invalidate every live order
hash.

---

## 9. `FeePolicy.lambda` as maker-set intensity

`LVR_MATH.md` §4.1 defines `lambda_Q = Q / (V · dt)` as trading intensity estimated
online from fills. The payload field `FeePolicy.lambda` is a **maker-governed set-point**,
not a live estimator. A live estimator would need per-strategy fill accounting, extra
storage, and anti-gaming. The current design uses the maker-set value as a break-even
assumption the controller targets. The UI surfaces this as "maker-set intensity" and does
not claim it is measured turnover.

---

## 10. Toolchain versions (`SOURCES.md` §6)

Without a third-party lockfile to copy, versions were reconciled against pinned SwapVM
`foundry.toml` and the current environment:

| Tool | Pin |
| --- | --- |
| Solidity | `0.8.30` |
| Foundry | `1.2.3-stable` |
| Node | `>=20` (CI: 22; local: 20.20.1) |
| pnpm | `9.15.0` |
| Python | `3.11+` |

---

## 11. The rebalance rebate recipient is the VM taker, not an order argument

`SWAPVM_INTEGRATION.md` §5 and `CONTRACTS.md` §12 show the rebate recipient as the
third field of the `RiptideRebalance` args (`uint64 beta ‖ uint128 staleInWad ‖
address resolver`, 44 bytes) and `buildRebalanceOrder(maker, s, outWad, resolver)`.

**That cannot work.** The program is part of `order.data`, and `order.data` is part of
the strategy hash Aqua commits on `ship`. An address in the args therefore pins the
order to one resolver: any other caller builds a different order, whose hash Aqua has
never seen, and settlement reverts. `RiptideAuctionSettler` is documented as
permissionless, so the two statements contradicted each other — and on a live
deployment only the pre-designated demo resolver could settle.

**Resolution:** the args are `uint64 beta ‖ uint128 staleInWad` (24 bytes, program 66
bytes) and `RiptideRebalanceModule.execute` takes the recipient from `ctx.query.taker`,
forwarded by the router from the VM context at execution time. `buildRebalanceOrder`
and `previewRebalance` lost their `resolver` parameter. The settler is the VM taker, so
it sweeps both legs — unspent quote plus the β rebate, and the bought base — back to
`msg.sender`.

Asserted by `test/fork/AuctionSettler.t.sol::test_anyAddressCanSettle`, which settles
from an arbitrary address and checks it receives the rebate and the base while the
previously designated resolver receives nothing.
