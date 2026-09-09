# Build resolutions

Resolutions for every `[confirm at build]` item from `docs/SWAPVM_INTEGRATION.md` §11,
verified against the **pinned** dependencies installed via `forge install` / npm (never
`refs/`).

Date verified: 2026-09-08.

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

**RIPTIDE Mechanism 1 decision:** Mechanism 1 still uses the `FeeProtocol` /
`IProtocolFeeProvider` provider path. Phase 8 encodes `OP_AQUA_DYNAMIC_PROTOCOL_FEE`
(runtime **30**) in `buildSwapOrder`; that handler `staticcall`s
`getFeeBpsAndRecipient` on `RiptideLvrFeeProvider`. The Aqua-retained pull variants
exist for makers who want fees kept inside Aqua balances; they are not the default
args path. The stock `_dynamicProtocolFeeAmountInXD` (runtime 29) is omitted from
the trimmed swap table.

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
has only 35 entries (indices 0–34). Phase 1 planned to append at source-line index **35**
or reuse placeholder 23.

**Phase 8 freeze:** `AquaOpcodes._opcodes()` overwrites slot 0 with the array length, so
**runtime dispatch indices are one less** than source-line indices. RIPTIDE appends
after a stock table of 34 entries. Frozen in `RiptideConstants.sol`:

| Runtime index | Handler |
| --- | --- |
| 13 | `Controls._deadline` |
| 17 | `XYCSwap._xycSwapXD` |
| 19 | `Decay._decayXD` |
| 20 | `Controls._salt` |
| 30 | `Fee._aquaDynamicProtocolFeeAmountInXD` |
| **34** | `RIPTIDE_REBALANCE_OPCODE` |
| 35 | DutchAuctionBalanceIn |
| 36 | DutchAuctionBalanceOut |
| 37 | `OraclePriceAdjuster` (reserved, unused) |

`_extendOpcodes()` / `_opcodes()` use `new` dynamic arrays and must not repeat the
slot-0 assembly length write. Index 23 was not needed.

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
is slice index 4, resolved through `_getDataSlice` / `_getOffset`). The strategy codec
must reproduce this packing from `MakerTraitsLib.build`, not the obsolete 208-bit shift
from the pre-v1.0.2 docs.

Frozen vector inputs (Phase 1):

```solidity
USE_AQUA_TRAIT = 1 << 254;
ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160;
```

**Phase 4 freeze:** `RiptideMakerTraits` uses `PAYLOAD_LENGTH << 208`. That is the Program
slice index (bits 208–223 = `160 + (3 << 4)`), not an obsolete pre-v1.0.2 shift. See §8.

---

## 4. Official Aqua / SwapVM addresses (`INDEX.md` Open Items #2)

**Resolution** (verified from `@1inch/aqua-sdk@0.3.1` / `@1inch/swap-vm-sdk@0.4.1` constants
and 1inch verified contract addresses page, Ethereum mainnet):

| Contract | Address (checksummed) |
| --- | --- |
| Aqua registry | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` |
| AquaSwapVMRouter v1.0.2 | `0x111111338c5091e8440b67b168bae16a668ac0de` |

Fork smoke test (`test/fork/Provenance.t.sol`) ships against the registry on an Ethereum
mainnet fork and reads `safeBalances`.

**Testnet note:** Sepolia has the vanity registry but not the vanity router (per 1inch docs
Aug 2026). Integration testing uses **mainnet fork**, not testnet deployment.

---

## 5. `IProtocolFeeProvider` naming (`CONTRACTS.md` §8 vs pinned swap-vm v1.0.2)

**Question:** Docs name `getRecipientAndFees(...) → (receiver, feeBps, surplusBps)`; what does
pinned SwapVM call?

**Resolution:** Pinned `lib/swap-vm@v1.0.2` uses `getFeeBpsAndRecipient(...) → (uint32 feeBps,
address to)` only (`IProtocolFeeProvider.sol`; `Fee.sol` staticcall at lines 169–180). No
`surplusBps` in v1.0.2. Mechanism 1 implements the pinned signature.

---

## 6. EIP-170 two-router split (`SWAPVM_INTEGRATION.md` §3.1, §11)

**Status:** **Resolved in Phase 8** (measured 2026-09-09, solc 0.8.30, via_ir, optimizer_runs 700).

| Contract | Runtime bytecode |
| --- | --- |
| `RiptideSwapVMRouter` | 24,527 B |
| `RiptideRebalanceRouter` | 22,648 B |
| EIP-170 cap | 24,576 B |

**Decision:** Two-router split implemented. Combining stock AquaOpcodes with both
mechanisms exceeds EIP-170. Trimming unused mixins and splitting swap vs rebalance
lets **each router fit under 24,576 B**.

- Swap path: `RiptideSwapOpcodes` → `SwapVM`. Does **not** inherit `AquaSwapVMRouter`.
- Rebalance path: `RiptideRebalanceRouter` is `SwapVM` + `RiptideOpcodes`; settlement
  lives in `RiptideRebalanceModule` so the interpreter stays smaller.
- Dutch handlers are copied into `RiptideDutchHandlers.sol` (not inherited from
  `DutchAuction`) to avoid C3 linearization.

**Program layouts:**

- Swap: `Deadline → aquaDynamicProtocolFee(feeProvider) → XYCSwap → Salt`
- Rebalance: `Deadline → DutchAuctionBalanceIn/Out → Decay → XYCSwap → RIPTIDE_REBALANCE_OPCODE → Salt`

Reserves come from Aqua `safeBalances` before `runLoop` when the Aqua trait is set.
No `DynamicBalances` opcode. Payload prefix is 226 bytes; MakerTraits Program slice
starts at 226.

`DeploySizeTest` asserts both routers `<= 24,576`.

---

## 7. Toolchain versions (`SOURCES.md` §6)

Without a third-party lockfile to copy, versions were reconciled against pinned SwapVM
`foundry.toml` and the current environment:

| Tool | Pin |
| --- | --- |
| Solidity | `0.8.30` |
| Foundry | `1.2.3-stable` |
| Node | `>=20` (CI: 22) |
| pnpm | `9.15.0` |
| Python | `3.11+` |

---

## 8. `RiptideMakerTraits.PROGRAM_OFFSET_SHIFT = 208` — correct for slice index 3

`RiptideMakerTraits.sol` uses `PAYLOAD_LENGTH << 208`. This matches the Program slice
index `MakerTraitsLib` packs at bits 208–223 when hooks are empty and the RIPTIDE
payload is a prefix of `order.data`. `MakerTraitsFreeze` proves:

- `USE_AQUA_TRAIT = 1 << 254`
- `ORDER_DATA_SLICES_INDEXES_BIT_OFFSET + (3 << 4) = 208`
- `RiptideMakerTraits.buildOrder` yields a program slice that excludes the 226-byte payload

Do not change the 208-bit shift — it would invalidate every live order hash.

---

## 9. OraclePriceAdjuster (opcode 37) — reserved, unused (`FEATURES.md` 3.1, 5.3)

**Question:** Should `OraclePriceAdjuster` be wired into the swap program?

**Resolution:** **No.** Opcode 37 is reserved in `RiptideConstants.sol` but is not
installed in either opcode table. The SwapVM handler clips `amountIn`/`amountOut`
toward a Chainlink price, which would fight Mechanism 1 (LVR is priced on the CPMM
curve). Volatility enters through auction-revealed price → `RiptideVolatilityOracle.observe`
from the rebalance path, not through opcode 37.
