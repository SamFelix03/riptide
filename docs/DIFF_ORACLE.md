# RIPTIDE Differential Math Oracle

## Purpose

This model establishes expected mathematical results **before** the Solidity and
TypeScript kernels exist, and remains the differential-testing oracle afterward. It
evaluates the real-number equations normative in [`LVR_MATH.md`](LVR_MATH.md) with
Python's arbitrary-precision `Decimal` standard library: an independent evaluator,
committed JSON vectors, and a strict change rule.

The trust boundary is deliberate:

- it imports no Solidity artifacts, ABI, generated client, or SDK;
- it uses **120 decimal digits** internally and serializes **72 decimal places**;
- it evaluates the exact branches (CPMM, EWMA, Garman–Klass, PI controller, β-split)
  independently of the on-chain code;
- it cross-checks each result against a second, structurally different computation where
  one exists (e.g. exact-in vs exact-out round trip; direct LVR rate vs the `σ²/8`
  CPMM specialization);
- it commits generated JSON so ordinary Solidity/TS tests need **no** Python, FFI, RPC,
  or network access.

This model proves **equation transcription and mathematical identities**. It does *not*
prove EVM overflow safety, token-transfer behavior, settlement security, or the
economic (Layer-2) bound — those are covered by the Foundry unit/fuzz/invariant suite
plus differential tests ([`CONTRACTS.md`](CONTRACTS.md) §16) and, for the economic
bound, by simulation ([`SOURCES.md`](SOURCES.md) §3, K2 recapture bound), each stated
honestly.

## Files

```text
tools/reference/reference_math.py        independent real-number evaluator
tools/reference/vector_cases.py          deterministic scenarios + coverage matrix
tools/reference/generate_vectors.py      write / --check command
tools/reference/test_reference_math.py    oracle + invalid-domain tests
test/vectors/cpmm_swap_v1.json           CPMM exact-in / exact-out + rounding
test/vectors/volatility_v1.json          EWMA + Garman–Klass realized-vol cases
test/vectors/fee_controller_v1.json      break-even target + clamped PI steps
test/vectors/diamond_split_v1.json       β-retention surplus split
test/vectors/invalid_domains_v1.json      declared deterministic failures
```

## Covered mathematics

Each area records ideal real values plus the adjacent WAD integers (§Rounding). The
evaluator is the sole source of expected values for the differential tests.

### 1. CPMM swap (`cpmm_swap_v1.json`)

- constant product `x·y = k`; exact-input `out = y − k/(x+inNet)` and exact-output
  `in = k/(y−out) − x`, each with the fee applied on the input leg;
- **cross-check:** exact-output required-input round-trips back to the requested output
  under the declared rounding;
- price before/after and effective (secant) price;
- reference for [`LVR_MATH.md`](LVR_MATH.md) §2.1 and the AMM leg in
  [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §6.

### 2. LVR (folded into `cpmm_swap_v1.json` metadata)

- instantaneous rate `ell(σ,P) = (σ²P²/2)·|x*'(P)|` with `x*(P)=V'(P)`, `V''≤0`;
- **cross-check:** for the CPMM, `ell/V` computed from the general formula must equal
  `σ²/8` (K1 specialization) to serialized precision;
- reference for [`LVR_MATH.md`](LVR_MATH.md) §2.

### 3. Realized volatility (`volatility_v1.json`)

- log returns `r_k = ln(P_k / P_{k−1})`;
- EWMA variance `var_k = λ·var_{k−1} + (1−λ)·r_k²`, then
  `sigmaHat = sqrt(var_k / dt_k)`;
- Garman–Klass term `gk_k = 0.5·(ln(H/L))² − (2·ln2 − 1)·(ln(C/O))²`;
- clamp to `[sigmaMin, sigmaMax]`; a stale observation freezes the estimate (the
  reference records both the frozen and the would-be-updated value);
- reference for [`LVR_MATH.md`](LVR_MATH.md) §3;
  `[STANDARD-REFERENCE, OUTSIDE SURVEY]` per [`SOURCES.md`](SOURCES.md) §5.

### 4. Fee controller (`fee_controller_v1.json`)

- break-even target `phi* = (σ̂²/8) / λ_Q`;
- `feeTarget = clamp(phi*·BPS, feeMin, feeMax)` with `BPS = 1e7`;
- clamped PI step with anti-windup: `I_k = clip(I_{k−1} + e_k, −Imax, +Imax)`,
  `u_k = clamp(Kp·e_k + Ki·I_k + feeTarget, feeMin, feeMax)`;
- **cross-check:** output always within `[feeMin, feeMax] ⊂ (0, BPS)` so the
  `FeeProtocol` guard (`totalFeeBps < BPS`, [`CONTRACTS.md`](CONTRACTS.md) §8) can never
  trip;
- reference for [`LVR_MATH.md`](LVR_MATH.md) §4;
  `[STANDARD-REFERENCE, OUTSIDE SURVEY]`.

### 5. Diamond β-split (`diamond_split_v1.json`)

- given `executedIn`, `staleIn` with `S = executedIn − staleIn ≥ 0`:
  `payToResolver = floor((1e18 − β)·S / 1e18)`, `retainToLP = S − payToResolver`;
- **cross-check:** `payToResolver + retainToLP == S` and
  `retainToLP ≥ floor(β·S / 1e18)` (maker retains at least βS) — the exact statements
  checked by the Foundry β-split conservation test (V1) against this vector
  ([`CONTRACTS.md`](CONTRACTS.md) §16);
- `S < 0` is a declared failure (see invalid domains);
- reference for [`LVR_MATH.md`](LVR_MATH.md) §5.3.

### 6. Dutch-auction schedule (folded into `diamond_split_v1.json` metadata)

- `balanceIn·decay^elapsed` and `balanceOut·ONE/decay^elapsed`; revert past
  `start + duration` — reproduced from the verified `DutchAuction.sol` math
  ([`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §5) so the preview in the Resolver
  Console matches on-chain.

### Scenario matrix

Each area sweeps: low/mid/high σ including `sigmaMin`/`sigmaMax` neighbors; small and
large reserves and near-empty pools; `λ` near 0 and near 1; `β` neighbors of 0 and 1
(never equal — declared invalid); surplus `S = 0`, tiny, and large; exact-in and
exact-out; and one-WAD-neighbor rounding cases. Separate vectors prove the stale-freeze
volatility path and the clamped/anti-windup controller path.

## Rounding contract

The JSON stores ideal normalized real values plus the adjacent WAD integers:

```json
{
  "quantity": "payToResolver",
  "direction": "floor",
  "floor": "949999999999999999",
  "ceiling": "950000000000000000"
}
```

Rules (normative in [`LVR_MATH.md`](LVR_MATH.md) §1.1, restated at the boundary in
[`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) §10):

- required **input** selects `ceiling`; delivered **output** selects `floor`;
- the **β rebate** (`payToResolver`) selects `floor`, so the maker retains `≥ βS`
  (rounding favors maker — SwapVM invariant 5);
- these are normalized WAD intervals, not raw token-decimal amounts; raw-token
  conversion applies the same direction at the transfer boundary and mutates state using
  the transferred amount.

## Commands

From the repository root:

```bash
python3 -m unittest tools.reference.test_reference_math -v
```

```bash
python3 -m tools.reference.generate_vectors --check
```

```bash
python3 -m tools.reference.generate_vectors
```

`--check` never writes; it exits non-zero if a committed file is absent or differs
byte-for-byte from deterministic regeneration. The bare write command is used only after
reviewing an intentional equation or scenario change.

## Differential-testing rule

- Solidity libraries (`WadMulDiv`, `LnExpMath`, `VolatilityMath`,
  `LvrMath`, `FeeController`, `DiamondSplit` — [`CONTRACTS.md`](CONTRACTS.md) §5) and the
  TypeScript `riptide-math` mirror both consume the **committed JSON** and must match the
  recorded WAD interval bit-for-bit under the declared rounding direction.
- `RiptideQuoter` ([`CONTRACTS.md`](CONTRACTS.md) §13) must reproduce the same applied
  fee and amounts as the reference for every `cpmm_swap` + `fee_controller` vector, so
  off-chain solver/resolver quotes equal on-chain settlement.
- A Solidity/TS mismatch is presumed a **kernel bug**, not a vector bug.

## Change rule

Never edit generated JSON manually. To change a result: modify the independent evaluator
or a named scenario, run the oracle tests, regenerate, inspect the numerical diff, and
explain the mathematical reason in the same commit. A later Solidity or SDK mismatch must
**not** be fixed by changing expected values unless the normative equation in
[`LVR_MATH.md`](LVR_MATH.md) is independently shown to be wrong — in which case
[`LVR_MATH.md`](LVR_MATH.md) and [`SOURCES.md`](SOURCES.md) are updated in the same
change.
