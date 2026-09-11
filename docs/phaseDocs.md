Understood — here's the complete phase-by-phase plan, in full, inline. I re-verified every phase against all nine spec docs before writing this (nothing here is paraphrased from memory of the earlier file; it's the same deep pass, delivered as requested — in chat, not as a download).

# RIPTIDE Implementation Plan

**Status:** Execution-ready build plan derived from `INDEX.md`, `PROTOCOL.md`, `LVR_MATH.md`, `SWAPVM_INTEGRATION.md`, `CONTRACTS.md`, `SYSTEM.md`, `UI.md`, `DIFF_ORACLE.md`, `SOURCES.md`, `FEATURES.md`.

This document does not introduce new requirements. Every phase below cites the normative doc/section it implements. Where the specs mark something `[confirm at build]`, that confirmation is placed explicitly as a phase exit-blocking task — not silently assumed. The governing rule from `SYSTEM.md` §17 holds throughout: **no later phase compensates for a failed earlier gate.**

---

## 0. How to use this document

Each phase has five parts:

- **Summary** — what this phase is for, one paragraph.
- **Implement exactly** — the concrete deliverables, file by file.
- **Output** — what must exist on disk / on-chain / deployed when the phase is done.
- **Test** — the specific commands/tests that must be written and must pass.
- **Exit criteria** — the binary gate. If any item is unmet, do not start the next phase.

Phases are ordered by dependency, matching `CONTRACTS.md` §1 build order (types → libraries → codec → oracle → fee provider → kernel → instruction → router → periphery → demo) nested inside `SYSTEM.md` §17's twelve-gate sequence, expanded into finer, independently-testable increments.

---

## 1. Prerequisites

Have these in place **before Phase 0**:

- A GitHub (or equivalent) account with access to create a monorepo.
- Access to the **official published** packages `@1inch/swap-vm` and `@1inch/aqua` (npm) — not the `refs/` mirror, which is read-only citation material only (`SYSTEM.md` §6, `CONTRACTS.md` intro, `SWAPVM_INTEGRATION.md` intro).
- The `refs/` directory itself (`refs/swap-vm`, `refs/aqua`, plus the three LVR papers) available locally for citation/provenance checks during Phase 1 — it is never a build input.
- A funded deployer wallet (or Anvil/local fork) for the target network profile (`SYSTEM.md` §14.2).
- A Chainlink price feed address on the target network (or a mock oracle for local dev) for `OracleConfig.feed` (`PROTOCOL.md` §4).
- The Graph account/API key if deploying to a hosted/Studio subgraph (`SYSTEM.md` §9).
- Decide the network profile now (`SYSTEM.md` §14.2): a local fork of a network with an **official** Aqua deployment for integration testing, and a Graph-supported chain for the public demo. This choice gates Phase 19.

### Toolchain

| Tool | Purpose | Notes |
| --- | --- | --- |
| Foundry (forge/cast/anvil) | Solidity build, unit/fuzz/invariant tests, fork tests | Pragma `0.8.30` — verified as the version every SwapVM instruction in `refs/swap-vm/src` uses (`CONTRACTS.md` intro) |
| Node.js + pnpm | TypeScript packages, services, web app | Version pinned in Phase 1, reconciled against pinned SwapVM `foundry.toml` (`SOURCES.md` §6) |
| Python 3.11+ with `decimal` (stdlib only) | Independent reference math oracle | No third-party numerics deps — `DIFF_ORACLE.md` requires ordinary tests to need **no** Python/FFI/RPC/network access once vectors are committed |
| Graph CLI (`@graphprotocol/graph-cli`) | Subgraph codegen/build/deploy | `SYSTEM.md` §9 |
| Docker (optional) | Local Anvil fork + Graph node for full-stack integration testing | — |

### Environment variables

Populate `.env` files per package; **never commit secrets, never ship RPC URLs or sponsor API keys in the browser bundle** (`SYSTEM.md` §10, `UI.md` §2.1).

```bash
# contracts/.env (Foundry)
DEPLOYER_PRIVATE_KEY=            # multisig/timelock in production; labelled demo key locally
RPC_URL_LOCAL=http://127.0.0.1:8545
RPC_URL_TARGET=                  # the chosen public demo network
ETHERSCAN_API_KEY=               # or target explorer's equivalent, for verification
AQUA_ADDRESS=                    # official deployment, re-verified per SYSTEM.md §14.1/§2 open item
SWAPVM_ROUTER_BASE=              # if SwapVM ships a base router to inherit, else empty
CHAINLINK_FEED_ADDRESS=          # per market, or mock oracle address for local dev

# services/solver-api/.env
RPC_URL=
SUBGRAPH_URL=
PORT=8081
MAX_SHORTLIST=                   # bounded RPC-refresh shortlist size (PROTOCOL.md §9)

# services/resolver-bot/.env  (also used by services/resolver-auction)
RPC_URL=
SUBGRAPH_URL=
RESOLVER_PRIVATE_KEY=            # demo-labelled key; never the maker's key
MIN_PROFIT_WAD=                  # resolver bot's own profitability floor (off-chain, advisory)

# services/vol-indexer/.env
RPC_URL=
GOVERNED_INDEXER_KEY=            # the authorized off-chain observer key (CONTRACTS.md §7 "Authority")
PRICE_SOURCE_URL=

# subgraph/.env
GRAPH_DEPLOY_KEY=
GRAPH_STUDIO_SLUG=

# apps/web/.env (public — no secrets)
NEXT_PUBLIC_CHAIN_ID=
NEXT_PUBLIC_DEPLOYMENT_MANIFEST_URL=     # points at deployments/<chainId>.json
NEXT_PUBLIC_SUBGRAPH_URL=
NEXT_PUBLIC_SOLVER_API_URL=
The running web app is live-only against the deployment manifest (`CHAIN_ID`, default Base Sepolia). Unit tests may stub `/api/riptide`.
```

### Repository skeleton (target of Phase 0)

Matches `SYSTEM.md` §16 verbatim:

```text
contracts/{src/{types,libraries,oracle,fees,core,periphery,demo},script,test}
packages/{riptide-math,strategy-sdk,contracts,solver-core,resolver-core,frontend-api}
services/{solver-api,resolver-bot,vol-indexer,liquidity-mcp}
subgraph/
apps/web/
deployments/
tools/reference/
docs/                 # this doc set, already provided
```

---

## Phase 0 — Workspace, tooling, and repo bootstrap

**Summary.** Stand up the monorepo skeleton, pin toolchains, and wire CI so every later phase has somewhere to land and a place to fail loudly. No product logic yet.

**Implement exactly:**
1. Create the directory tree from §1 above.
2. `pnpm` workspace root (`pnpm-workspace.yaml`) covering `packages/*`, `services/*`, `apps/*`.
3. `foundry.toml` in `contracts/` pinned to Solidity `0.8.30`; `remappings.txt` placeholder (populated in Phase 1 once package versions are pinned).
4. Root `tools/reference/` Python package skeleton (`reference_math.py`, `vector_cases.py`, `generate_vectors.py`, `test_reference_math.py` — empty modules with the function signatures stubbed, per `DIFF_ORACLE.md` §Files).
5. CI pipeline (GitHub Actions or equivalent) with three jobs, all currently trivially green: `forge build`, `pnpm -w build`, `python3 -m unittest`.
6. `DEPENDENCY_LOCK.md` stub in repo root (populated in Phase 1) — `SYSTEM.md` §14.1.
7. `deployments/` directory with a `.gitkeep`; the manifest schema (`SYSTEM.md` §14.3) documented in a `deployments/README.md` but not yet populated.

**Output.** An empty-but-buildable monorepo; CI green on a no-op commit.

**Test.**
- `forge build` exits 0 on an empty `contracts/src`.
- `pnpm -w install && pnpm -w build` exits 0 with no packages yet emitting output.
- `python3 -m unittest discover tools/reference` exits 0 (no tests collected is acceptable at this point, but the harness must run without import errors).

**Exit criteria.** CI pipeline green; repo layout matches `SYSTEM.md` §16 exactly (a reviewer can diff the tree against that section).

---

## Phase 1 — Dependency pinning & provenance (Gate 1 of `SYSTEM.md` §17)

**Summary.** Nothing normative gets built on a moving target. This phase pins the **official published** `@1inch/swap-vm` and `@1inch/aqua` packages (never the `refs/` mirror as a build input — `SYSTEM.md` §6, §14.1), records exact versions/commits/licenses, and resolves every `[confirm at build]` item that blocks opcode/encoding decisions downstream.

**Implement exactly:**
1. `pnpm add @1inch/swap-vm@latest @1inch/aqua@latest` (plus the official Aqua TS SDK once its package name is confirmed) inside `contracts/` (as a dev dependency for Foundry's node_modules remapping) and `packages/strategy-sdk`.
2. Populate `remappings.txt` to point at the installed package paths.
3. Write `DEPENDENCY_LOCK.md`: exact resolved versions, commit hashes, and licenses for `@1inch/swap-vm`, `@1inch/aqua`, OpenZeppelin (pinned per `CONTRACTS.md` §5 library table — v5.4.0 per `SYSTEM.md` §5), and Solady (pinned). `SYSTEM.md` §14.1.
4. Resolve the **open items** blocking Phase 8 (`SWAPVM_INTEGRATION.md` §11):
   - Confirm whether an `aqua*` fee-opcode variant (e.g. `aquaDynamicProtocolFeeAmountInXD`) exists in the pinned commit, or whether RIPTIDE's fee flows through `FeeProtocol`'s ordinary (non-Aqua-`pull`) transfer as documented (`SWAPVM_INTEGRATION.md` §4 note).
   - Confirm the free `Opcode` slot value for `RiptideRebalanceInstruction` (illustrated as `0xa0` in `CONTRACTS.md` §11 / `SWAPVM_INTEGRATION.md` §3.1) against `OpcodeList.sol` in the pinned commit.
   - Confirm exact `MakerTraits` program-slice bit packing (`ORDER_DATA_SLICES_INDEXES_BIT_OFFSET`) from `MakerTraits.sol` (`SWAPVM_INTEGRATION.md` §6, §11) and freeze it as a deterministic vector.
   - Re-verify official Aqua/SwapVM **addresses and commit hashes** against the official 1inch deployment manifest (`INDEX.md` Open Items #2).
5. Reconcile toolchain versions (Node/pnpm/Foundry/Solidity/Python) against pinned SwapVM `foundry.toml` and the current environment (`SOURCES.md` §6) and pin them in `package.json` `engines` + `foundry.toml`.
6. Do **one real transfer** through the pinned Aqua contract on a local fork (`ship` + `safeBalances` read) as a smoke test that the pinned package actually links and behaves as `refs/` describes (`SYSTEM.md` §17 step 1).

**Output.**
- `DEPENDENCY_LOCK.md` committed with exact versions/commits/licenses.
- A short `RESOLUTIONS.md` recording the four confirm-at-build resolutions above, each with the source line/commit that resolved it.
- A passing Foundry smoke test: `test/fork/Provenance.t.sol` that ships a token into a real Aqua fork and reads it back via `safeBalances`.

**Test.**
- `forge test --match-path test/fork/Provenance.t.sol -vvv` against `RPC_URL_TARGET` (forked) passes.
- Manual diff: every `[confirm at build]` tag inside `SWAPVM_INTEGRATION.md` §11 has a corresponding resolved entry in `RESOLUTIONS.md`.

**Exit criteria.** All four `SWAPVM_INTEGRATION.md` §11 open items resolved and recorded; pinned-package fork smoke test passes; no file under `contracts/` imports anything from `refs/`.

---

## Phase 2 — Core types, errors, events

**Summary.** The shared vocabulary every later contract imports. Corresponds to `CONTRACTS.md` §2–§4.

**Implement exactly:**
1. `contracts/src/types/RiptideTypes.sol` — `QuoteKind`, `FeePolicy`, `AuctionPolicy`, `OracleConfig`, `Strategy`, `ControllerState`, `RebalanceResult`, exactly as specified in `CONTRACTS.md` §2 (field types, packing deferred to build but field set is normative now).
2. `contracts/src/types/RiptideErrors.sol` — every custom error listed in `CONTRACTS.md` §3, verbatim (config/decode, runtime auth/lifecycle, mechanism-2 economic guards, fee guard, oracle, math domains, routing).
3. `contracts/src/interfaces/IRiptideEvents.sol` — `StrategyRuntimeInitialized`, `SwapFilled`, `RebalanceSettled`, `FeeControllerUpdated`, `RouteExecuted` exactly as in `CONTRACTS.md` §4.

**Output.** Three compiling files with zero external RIPTIDE dependencies (only `@1inch/swap-vm`/`@1inch/aqua` interfaces where a struct/event mirrors one).

**Test.**
- `forge build` compiles cleanly with no warnings for unused imports.
- A trivial Foundry test file instantiates each struct with a zero/dummy value and each error/event with dummy args to confirm ABI encodability (`test/unit/TypesCompile.t.sol`).

**Exit criteria.** Every error in `CONTRACTS.md` §3 and every event in §4 exists with matching name and argument list; `forge build` green; no other contract yet depends on these (checked by `forge build` succeeding with only these three files present).

---

## Phase 3 — Math libraries + Python differential oracle (parallel track)

**Summary.** This is the highest-risk phase: it is Gate 2 of `SYSTEM.md` §17 ("Freeze math") and the foundation every economic guarantee rests on. It is built **in lockstep** with the Python differential oracle so Solidity, TypeScript, and Python agree before any contract that consumes this math exists.

### 3a. Python differential oracle (build first — it is the arbiter)

**Implement exactly**, per `DIFF_ORACLE.md`:
1. `tools/reference/reference_math.py` — pure-Python, `decimal.Decimal` at 120 internal digits, evaluating:
   - CPMM exact-in/exact-out (`LVR_MATH.md` §2.1) with the fee-on-input-leg rule.
   - LVR rate `ell(σ,P) = (σ²P²/2)|x*'(P)|` and its CPMM specialization `ell/V = σ²/8` as an independent cross-check (`LVR_MATH.md` §2, §2.1).
   - EWMA log-return variance + Garman–Klass blend + clamp + stale-freeze (`LVR_MATH.md` §3).
   - Break-even fee target `phi* = (σ̂²/8)/λ_Q`, `feeTarget` clamp, and the clamped PI step with anti-windup (`LVR_MATH.md` §4).
   - Diamond β-split: `payToResolver = floor((1e18−β)S/1e18)`, `retainToLP = S − payToResolver` (`LVR_MATH.md` §5.3).
   - Dutch-auction schedule `balanceIn(t) = balanceIn(start)·decay^(t−start)` (`LVR_MATH.md` §5.2).
2. `tools/reference/vector_cases.py` — the scenario matrix from `DIFF_ORACLE.md` §Scenario matrix: low/mid/high σ incl. clamp neighbors; small/large/near-empty reserves; λ near 0/1; β neighbors of 0/1 (never equal); `S = 0`/tiny/large; exact-in and exact-out; one-WAD-neighbor rounding cases; separate stale-freeze and anti-windup scenarios.
3. `tools/reference/generate_vectors.py` — `write` and `--check` modes exactly as specified (deterministic regeneration; `--check` never writes, exits non-zero on any diff).
4. `tools/reference/test_reference_math.py` — oracle self-tests plus the invalid-domain tests (`S<0` rejected, out-of-domain ln/exp/pow rejected).
5. Generate the five committed vector files under `test/vectors/`: `cpmm_swap_v1.json`, `volatility_v1.json`, `fee_controller_v1.json`, `diamond_split_v1.json`, `invalid_domains_v1.json` — each following the rounding-contract JSON shape in `DIFF_ORACLE.md` §Rounding contract (`quantity`, `direction`, `floor`, `ceiling`).

**Test.**
- `python3 -m unittest tools.reference.test_reference_math -v` passes.
- `python3 -m tools.reference.generate_vectors --check` passes against the committed vectors (i.e., regeneration is byte-identical).
- Cross-check assertions inside the oracle itself pass: `ell/V == σ²/8` for CPMM; exact-output required-input round-trips to the requested output under declared rounding; `payToResolver + retainToLP == S` and `retainToLP ≥ floor(βS/1e18)`.

**Exit criteria (3a).** Five vector files committed; `--check` green; every cross-check in `DIFF_ORACLE.md` §Covered mathematics passes inside the Python suite itself, independent of any Solidity/TS code.

### 3b. Solidity math libraries

**Implement exactly**, per `CONTRACTS.md` §5 and `LVR_MATH.md` §1:
1. `WadMulDiv.sol` — `mulDiv(x,y,d,Rounding)` (512-bit, `Down`=floor, `Up`=ceil), `toWad`/`fromWad` for `0 <= decimals <= 18`. Reverts (never truncates) on zero denominator or overflow (`RiptideMathDivisionByZero`, `RiptideMathOverflow`).
2. `LnExpMath.sol` — `lnWad`, `expWad`, `powWad`, `sqrtWad` wrapping the pinned Solady backend, with the explicit domains from `LVR_MATH.md` §1.2 and the identity bypasses (`x^0=1`, `1^a=1`, `x^1=x`). Out-of-domain reverts with `RiptideLogInputOutOfDomain` / `RiptideExpInputOutOfDomain` / `RiptidePowOutOfDomain`, never saturates.
3. `VolatilityMath.sol` — `ewmaVar(prev, r, lambda)`, `gkTerm(h,l,c,o)`, `sigmaFromVar`, with the `[sigmaMin,sigmaMax]` clamp and stale-freeze behavior.
4. `LvrMath.sol` — `lvrRateCpmm(sigmaWad, valueWad)` returning `ell ≥ 0`.
5. `FeeController.sol` — `feeTarget(sigmaWad, lambdaQ, feeMin, feeMax)`, `piStep(state, target)` with `|I| ≤ Imax` anti-windup, output always in `[feeMin, feeMax]`.
6. `DiamondSplit.sol` — `split(surplusWad, beta) → (payToResolver, retainToLP)` exactly matching `LVR_MATH.md` §5.3 rounding.
7. Write `LN_EXP_BOUNDS.md` recording the exact conditioning bounds used (`LVR_MATH.md` §1.2).

### 3c. TypeScript math mirror

**Implement exactly**, per `SYSTEM.md` §7 and `PROTOCOL.md` §15:
1. `packages/riptide-math` — dependency-free TS mirror of every function in 3b, sharing the same committed JSON vectors (`DIFF_ORACLE.md` §Differential-testing rule).

### 3d. Differential test harness (binds 3a+3b+3c together)

1. `test/differential/*.t.sol` — Foundry tests that load each committed JSON vector and assert the Solidity library output matches the recorded WAD interval **bit-for-bit** under the declared rounding direction.
2. `packages/riptide-math/test/differential/*.test.ts` — same, for the TS mirror.
3. Fuzz tests per library (random in-domain inputs) asserting: rounding always favors the maker (`amountIn` ceil, `amountOut` floor, β-rebate floor); no transcendental call escapes its domain on the full fuzz grid (`LVR_MATH.md` §8 Cross-cutting).

**Output.** Six Solidity libraries + one TS package, both differentially tested against the same five committed JSON vectors; `LN_EXP_BOUNDS.md` committed.

**Test.**
- `forge test --match-contract Differential -vvv` — 100% of vector cases match bit-for-bit; a deliberate off-by-one rounding change (temporary local edit) must make the corresponding test **fail** — confirms the harness can actually fail (mirrors the negative-control discipline that governs the V1–V5 invariants in Phase 10, applied early here to the math layer).
- `pnpm --filter riptide-math test` — same vectors, same result, from TS.
- `forge test --match-contract Fuzz` — rounding-direction and domain-safety fuzz suites, ≥ 10,000 runs each.

**Exit criteria.** Solidity and TS both match the Python oracle bit-for-bit on every committed vector; a Solidity/TS mismatch is treated as a **kernel bug**, not a vector bug, per `DIFF_ORACLE.md` — so this phase does not close until mismatches are zero, not until they're "close enough." This is Gate 2 of `SYSTEM.md` §17.

---

## Phase 4 — `RiptideStrategyCodec` and wire format freeze (Gate 3)

**Summary.** Freezes the RIPTIDE payload byte layout and the `policyHash`/`strategyHash` identifiers so Solidity and TypeScript agree on encoding before any contract that decodes a strategy exists. Corresponds to `CONTRACTS.md` §6 and `SWAPVM_INTEGRATION.md` §1, §6, §7.

**Implement exactly:**
1. `contracts/src/core/RiptideStrategyCodec.sol` — `encode`, `decode`, `validateStructure`, `marketId`, `strategyKey`, with the **exact** payload layout from `SWAPVM_INTEGRATION.md` §7 (magic `RPT1`, version byte, base/quote addresses, salt, reserves, fee policy fields, auction policy fields, oracle config, `feeProvider` address) — fixed-length, packed big-endian, no dynamic field.
2. `validateStructure` rejects exactly the config errors enumerated in `SWAPVM_INTEGRATION.md` §7 and `CONTRACTS.md` §3 (`config/decode` group): zero/identical tokens, `feeMin==0 || feeMin>=feeMax`, `feeMax>=BPS`, `lambda`/`beta`/`decay` outside `(0,1)`, `sigmaMin>=sigmaMax`, zero oracle/provider address, wrong magic/version/length.
3. `marketId = domain-separated hash of ordered (base, quote)`; `strategyKey = keccak256(maker, strategyHash)`; keep `policyHash` (SDK/audit identity, `keccak256(riptidePayload)`) and `strategyHash` (`keccak256(abi.encode(order))`, the Aqua commitment) explicitly non-interchangeable (`SWAPVM_INTEGRATION.md` §1, §4).
4. Confirm and freeze the `MakerTraits` program-slice bit packing (`USE_AQUA_TRAIT = 1<<254`, `PROGRAM_OFFSET_SHIFT = 208`, `ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160`) reproduced from `MakerTraits.sol`, not reinvented — this was flagged `[confirm at build]` in Phase 1 and must be closed here (`SWAPVM_INTEGRATION.md` §6, §11).
5. `packages/strategy-sdk` — TS payload builder/decoder mirroring the Solidity codec exactly, including `policyHash`/`strategyHash` computation.
6. Commit a deterministic offset/encoding vector (`test/vectors/payload_v1.json`) (`SWAPVM_INTEGRATION.md` §11).

**Output.** `RiptideStrategyCodec.sol`, `packages/strategy-sdk` encode/decode, one committed payload vector file.

**Test.**
- Round-trip fuzz: `decode(encode(s)) == s` for random valid `Strategy` structs.
- Rejection unit tests: one test per `validateStructure` error condition.
- **Hash-parity test** (blocking, called out explicitly by `UI.md` §3.2 `StrategyBytesInspector` and user story §4.5): for the same `Strategy`, Solidity `RiptideStrategyCodec.encode` + `keccak256` and the TS SDK's encoder produce **byte-identical** payloads and hashes, checked against the committed vector.

**Exit criteria.** Gate 3 of `SYSTEM.md` §17 ("Freeze encoding") — payload bytes and `strategyHash` parity across Solidity/TS proven by a committed vector, not just "looks right."

---

## Phase 5 — `RiptideVolatilityOracle`

**Summary.** The on-chain realized-volatility estimator both mechanisms read. Corresponds to `CONTRACTS.md` §7.

**Implement exactly:**
1. `contracts/src/oracle/IRiptideVolatilityOracle.sol` — interface exactly as in `CONTRACTS.md` §7 (`sigmaWad`, `varWad`, `observe`, `observeRange`).
2. `contracts/src/oracle/RiptideVolatilityOracle.sol`:
   - `observe`/`observeRange` call into `VolatilityMath` (Phase 3) for the EWMA/Garman–Klass update.
   - **Invariant (blocking):** state mutates **only** when `!isStatic` — the `Decay.sol`-style discipline (`CONTRACTS.md` §7 Invariants (1), `LVR_MATH.md` §4.4).
   - Staleness check identical to `OraclePriceAdjuster`'s (`block.timestamp > updatedAt + maxStaleness`) — freezes `sigmaWad` at last good value rather than trusting a stale round; reverts `RiptideStaleOracleRound` on the freshness read path where specified.
   - `sigmaWad` always clamped to `[sigmaMin, sigmaMax]`.
   - **Authority:** only the router/instruction and the governed vol-indexer key may call mutating `observe*`; everyone else gets `view` reads (`CONTRACTS.md` §7 Authority).

**Output.** Deployed-ready `RiptideVolatilityOracle` + interface, unit-tested in isolation (no router dependency yet — it's called with a mock caller).

**Test.**
- Unit: EWMA/GK values match the Phase 3 differential vectors exactly when driven through `observe`/`observeRange`.
- Unit: `observe(..., isStatic=true)` leaves all storage unchanged (assert via `vm.record()`/storage diff) — this is the seed of invariant V3, tested in isolation here and again at the router level in Phase 10.
- Unit: a stale round (`ts` beyond `maxStaleness`) freezes `sigmaWad` at the prior value; a **negative control** (temporarily removing the staleness check) must make this test fail.
- Authority test: a non-authorized caller's `observe*` call reverts.

**Exit criteria.** All oracle invariants in `CONTRACTS.md` §7 hold in isolation; zero mutation in static context proven with a negative control that actually fails without the guard.

---

## Phase 6 — `RiptideLvrFeeProvider` (Mechanism 1)

**Summary.** The contract that turns the volatility estimate into the dynamic fee `FeeProtocol` (0x80) will consult. This is Mechanism 1 as a standalone, router-independent contract, satisfying `IProtocolFeeProvider` exactly. Corresponds to `CONTRACTS.md` §8, `SWAPVM_INTEGRATION.md` §4, `PROTOCOL.md` §2.1.

**Implement exactly:**
1. `contracts/src/fees/RiptideLvrFeeProvider.sol` implementing the **verified** `IProtocolFeeProvider` interface: `getRecipientAndFees(orderHash, maker, taker, tokenIn, tokenOut, isExactIn) → (receiver, feeBps, surplusBps)`.
2. `registerStrategy(strategyKey, orderHash, FeePolicy)` — maker/governance-gated registration mapping `orderHash`↔`strategyKey`.
3. Behavior: resolve `strategyKey`, read `RiptideVolatilityOracle.sigmaWad`, compute `feeTarget` via `FeeController` (Phase 3), return the **committed** `feeReported` — i.e., this function is `view` and returns already-advanced state, never advancing it itself (`CONTRACTS.md` §8 Behavior/Invariants (3)).
4. Guarantee `feeBps ∈ [feeMin, feeMax] ⊂ (0, BPS)` unconditionally, so the `FeeProtocol` guard `totalFeeBps < BPS` (verified, `FeeProtocol.sol` line 217) can never trip (`CONTRACTS.md` §8 Invariants (2)).

**Output.** A `view`-only `RiptideLvrFeeProvider` that can be called standalone (mock `orderHash`/oracle) and returns a deterministic fee.

**Test.**
- **V3 seed (quote/swap determinism):** call `getRecipientAndFees` twice for identical committed state, once framed as a `staticcall` and once not — results must be byte-identical. Full V3 invariant (including the router's non-static advance path) is proven at the router level in Phase 10; this phase proves the provider itself never mutates (it's `view`, so this is close to a compile-time guarantee, but assert it anyway with a state-diff test).
- **V4 seed (fee-band containment):** fuzz `sigmaWad` across `[0, type(uint128).max]` clamped domain and assert `feeBps` is always in `[feeMin, feeMax]`. Negative control: an unclamped controller output must fail this test.
- Differential: fee values match the `fee_controller_v1.json` vectors from Phase 3 when driven through the full provider (oracle → controller → provider), not just the bare library.

**Exit criteria.** Provider is `view`-pure, deterministic, and fee-band-safe in isolation, both proven with fuzz tests that include a documented negative control.

---

## Phase 7 — `RiptideRebalanceKernel` (Mechanism 2 math, below EIP-170)

**Summary.** The stateless surplus/baseline/β-split/auction-schedule kernel kept deliberately small so the instruction and periphery can share one audited implementation without bytecode-size risk. Corresponds to `CONTRACTS.md` §9.

**Implement exactly:**
1. `contracts/src/interfaces/IRiptideRebalanceKernel.sol` and `contracts/src/core/RiptideRebalanceKernel.sol` exactly per `CONTRACTS.md` §9: `staleBaselineIn(outWad, reserveInWad, reserveOutWad, kind) → staleInWad` (CPMM baseline); `splitSurplus(executedInWad, staleInWad, beta) → RebalanceResult` (reverts `RiptideNoSurplus` if `S<0`); `auctionBalance(...)` mirroring `DutchAuction` math exactly.
2. `splitSurplus` calls `DiamondSplit` (Phase 3) — do not re-implement the split math here; this kernel is wiring, not a second source of truth.
3. `auctionBalance` reverts `RiptideAuctionWindowClosed` past `start + duration`, matching the verified `DutchAuction.sol` revert condition.

**Output.** A pure/`view`-only kernel, independently callable and testable without the router or Aqua.

**Test.**
- **V1 seed (β-split conservation):** fuzz `beta ∈ (0, 1e18)` and `S ≥ 0`, assert `payToResolver + retainToLP == S` and `retainToLP ≥ floor(beta*S/1e18)`. Negative control: an over-paying rounding variant must fail.
- **V2 seed (no-surplus safety):** unit + fuzz test that `splitSurplus` (or the future instruction wrapping it) reverts whenever `executedIn < staleIn`. Negative control: a build that skips the `S≥0` check must fail.
- `staleBaselineIn` matches the CPMM `cpmm_swap_v1.json` vectors from Phase 3.
- `auctionBalance` matches the Dutch-auction metadata inside `diamond_split_v1.json` (Phase 3) and reverts correctly past the window.

**Exit criteria.** V1 and V2 invariants both hold **and** have demonstrated negative controls at the kernel level (full V1/V2 sign-off, including the in-router path, happens again in Phase 10 — this phase proves the math is sound before it is wired into anything stateful).

---

## Phase 8 — `RiptideRebalanceInstruction` + `RiptideSwapVMRouter` (Gate 4 & 5)

**Summary.** The highest-integration-risk phase: wiring the custom opcode into SwapVM's dispatch, seeding reserves from live Aqua balances, and proving both mechanisms actually settle atomically through the router. This phase delivers Gates 4 and 5 of `SYSTEM.md` §17 ("Prove Mechanism 1", "Prove Mechanism 2").

**Implement exactly:**
1. `contracts/src/core/RiptideRebalanceInstruction.sol` (abstract) per `CONTRACTS.md` §10: holds `KERNEL`, `ORACLE` immutables and the `_runtime: mapping(strategyKey => ControllerState)`. `_riptideRebalance(ctx, args)` decodes `(beta, staleInWad, resolver)` (`SWAPVM_INTEGRATION.md` §5), reads `safeBalances`, computes `S`, `payToResolver`, `retainToLP` via the kernel, requires `S≥0`, rebates via Aqua `pull(maker, strategyHash, tokenIn, payToResolver, resolver)`, and **only when `!ctx.vm.isStaticContext`**: calls `ORACLE.observe(...)`, advances `_runtime`, emits `RebalanceSettled`.
2. `contracts/src/core/RiptideSwapVMRouter.sol` per `CONTRACTS.md` §11 / `SWAPVM_INTEGRATION.md` §3.1:
   - Inherits `AquaSwapVMRouter` and `RiptideRebalanceInstruction`.
   - `USE_AQUA_TRAIT = 1<<254`, `PROGRAM_OFFSET_SHIFT = 208` (frozen in Phase 4).
   - `RIPTIDE_REBALANCE_OPCODE` set to the value confirmed in Phase 1.
   - Overrides `_runOpcode` to dispatch the custom opcode plus `DutchAuctionBalanceIn/Out` (0x94/0x95) and `OraclePriceAdjuster` (0xb2) directly, falling back to `super._runOpcode` for `XYCSwap`(0x50), `FeeProtocol`(0x80), `Decay`(0x9c), `Deadline`(0x20), `Salt`(0x02).
   - `buildSwapOrder` / `buildRebalanceOrder` construct `ISwapVM.Order` with the canonical program orderings (`SWAPVM_INTEGRATION.md` §5.1, §6):
     - Swap: `Deadline → FeeProtocol(provider=RiptideLvrFeeProvider) → [OraclePriceAdjuster?] → XYCSwap → Salt`.
     - Rebalance: `Deadline → DutchAuctionBalanceIn/Out → Decay → XYCSwap → RiptideRebalanceInstruction → Salt`.
   - Confirms reserves are **never** loaded by a balance opcode: `balanceIn`/`balanceOut` are seeded from `AQUA.safeBalances` before `runLoop` (`SwapVM.sol` L167–169/L221–222) whenever the Aqua trait is set — no `DynamicBalances`(0x91) dispatch.
3. **EIP-170 check (blocking):** measure deployed bytecode size. If it exceeds 24 KB, execute the documented fallback: split into `RiptideSwapVMRouter` (swap opcodes) + `RiptideRebalanceRouter` (rebalance opcodes) sharing Aqua app authority (`CONTRACTS.md` §11 "Size-contingent split", `SWAPVM_INTEGRATION.md` §3.1).
4. Register `RiptideLvrFeeProvider` as the provider entry inside the built `FeeProtocol` args (`takeFlatFee=true`, `isTokenIn=true`), per `SWAPVM_INTEGRATION.md` §4.

**Output.** A deployable `RiptideSwapVMRouter` (or the two-router split) that can `ship`, `quote`, and `swap` a real strategy on a local Aqua fork, and separately settle a rebalance.

**Test (fork-based, real Aqua/SwapVM contracts):**
- **Mechanism 1 proof:** ship a strategy on a local fork; a taker exact-in swap charges the committed dynamic fee through the `FeeProtocol` provider path; assert quote/swap parity (the `eth_call` quote and the settled swap report the identical `feeBpsApplied`).
- **Mechanism 2 proof:** inject a price gap; a rebalance settles via the custom instruction; assert the β-split rebate lands in the resolver's wallet via Aqua `pull` and `retainToLP` stays in the maker's Aqua balance; assert `RiptideNoSurplus` blocks a crafted loss-making fill.
- Seven-invariant preservation checklist (`SWAPVM_INTEGRATION.md` §9): write one targeted test per invariant (ExactIn/Out symmetry, additivity, quote/swap consistency, price monotonicity, maker-favorable rounding, balance sufficiency, strategy liveness).
- Reentrancy: a malicious token/callback attempting reentry during `push`/`pull`/`safeBalances` reverts with `RiptideReentrantExecution`.

**Exit criteria.** Gates 4 and 5 of `SYSTEM.md` §17: a real fork transaction demonstrates Mechanism 1 charging the committed fee and Mechanism 2 settling a β-split rebalance, both through the actual official Aqua/SwapVM contracts — not mocks. EIP-170 size question resolved one way or the other, not deferred.

---

## Phase 9 — The loop (Gate 6)

**Summary.** Proves the self-reinforcing loop is not just described but wired: a settled rebalance's revealed price actually moves the next quote's fee. Corresponds to `PROTOCOL.md` §2.3, `LVR_MATH.md` §6, `SYSTEM.md` §17 step 6.

**Implement exactly.** No new contracts — this phase is pure integration verification of Phase 5+6+8 wired together. If the loop doesn't close, it's a Phase 5/6/8 bug, not new code.

**Test.**
1. Ship a strategy, record `feeReported_0` from a quote.
2. Settle a rebalance whose `revealedPriceWad` differs materially from the last observation.
3. Assert `RiptideVolatilityOracle.sigmaWad` changed as a direct function of that observation (matches the Phase 3 EWMA vectors given the new return).
4. Quote again; assert `feeReported_1 != feeReported_0` and moves in the direction the math predicts (higher realized vol → higher fee, within one PI step per `LVR_MATH.md` §4.3).

**Output.** A single end-to-end Foundry (or Foundry+script) test, `test/integration/Loop.t.sol`, plus a narrated trace usable later for the demo script (Phase 20) and the `LoopVisualizer` component (Phase 18).

**Exit criteria.** The loop test passes deterministically (same inputs → same fee delta) and the trace is legible enough to reuse as demo evidence.

---

## Phase 10 — Full Foundry verification suite: V1–V5, fuzz, invariants, fork

**Summary.** Consolidates everything proven in isolation (Phases 3, 5–9) into the complete, named verification plan from `CONTRACTS.md` §16, run against the **actual deployed router**, not standalone libraries. This is where "prove atomic routing" (Gate 7) partially lands, alongside hardening.

**Implement exactly**, per `CONTRACTS.md` §16 (each with a negative control):
1. **V1 — β-split conservation** (fuzz + differential), at the router/instruction level this time, not just the kernel.
2. **V2 — no-surplus safety** (unit + fuzz), through `RiptideRebalanceInstruction` as actually dispatched by the router opcode.
3. **V3 — quote/swap fee determinism** (unit + fuzz), through the full `FeeProtocol → RiptideLvrFeeProvider` staticcall path in both static and non-static context.
4. **V4 — fee-band containment** (fuzz), asserting the deployed router can never trip the `FeeProtocol` `totalFeeBps<BPS` guard.
5. **V5 — deadline-first revert** (stateful invariant): Foundry invariant test asserting Aqua balances are unchanged across a reverted expired rebalance; negative control reorders `Deadline` after a balance-touching instruction and must fail V5.
6. Runtime tests (`SYSTEM.md` §13 "Runtime" row): first-fill init, version races, unsolicited Aqua credit, docked-state rejection, rollback after a failed transfer.
7. Aqua fork tests (`SYSTEM.md` §13 "Aqua" row): real `ship`/`pull`/`push`/`dock`, approvals, ERC-20 transfers, and the β rebate `pull`, against the pinned official contracts.

**Output.** `test/invariant/*.t.sol` (V1–V5 + negative-control siblings), `test/fork/*.t.sol`, `test/unit/Runtime*.t.sol`, all green in CI.

**Test.** `forge test -vvv --match-path "test/invariant/**"` and `forge test -vvv --match-path "test/fork/**"`; every negative-control sibling test must **fail** when run against the intentionally-broken variant (kept as a `_NegativeControl` contract behind a build flag, never deployed) and **pass** when that flag is off — i.e., prove the harness can fail, per `CONTRACTS.md` §16 intro.

**Exit criteria.** All five named invariants (V1–V5) pass with demonstrated negative controls; runtime and Aqua fork test rows from `SYSTEM.md` §13 are green. This is the contracts side fully closed — nothing in `contracts/src` changes after this phase except to fix a bug surfaced later.

---

## Phase 11 — Periphery: `RiptideAuctionSettler`, `RiptideQuoter`, `RiptideLens`, `RiptideBatchExecutor`

**Summary.** The entrypoints everything off-chain actually calls. Corresponds to `CONTRACTS.md` §12–§14 and delivers Gate 7 ("Prove atomic routing").

**Implement exactly:**
1. `contracts/src/periphery/RiptideAuctionSettler.sol` per `CONTRACTS.md` §12: `settleRebalance(maker, s, outWad, maxInWad, deadline) → RebalanceResult`. Builds the rebalance order and calls `router.swap(...)` with the resolver as taker. First instruction is `Deadline(0x20)` (permissionless — no caller allow-list, `PROTOCOL.md` §12).
2. `contracts/src/periphery/RiptideQuoter.sol` + `IRiptideQuoter` per `CONTRACTS.md` §13: `quoteSwap`, `previewRebalance`, both `view`, both reproducing exact settlement math (including current dynamic fee and rounding) so off-chain quotes match on-chain settlement — this is the `RiptideQuoter` requirement from `DIFF_ORACLE.md` §Differential-testing rule: it must reproduce the same applied fee and amounts as the differential oracle for every vector.
3. `contracts/src/periphery/RiptideLens.sol` + `IRiptideLens` per `CONTRACTS.md` §13: `strategyState(...)` reconciling strategy config, router runtime, Aqua balances, wallet balance, and allowance in one call — always reading live Aqua balances, never cached.
4. `contracts/src/periphery/RiptideBatchExecutor.sol` + `IRiptideBatchExecutor` per `CONTRACTS.md` §14: `FillRequest[]`, `Route`, `execute(route) → (amountIn, amountOut)`. Hard `maxFills` bound, one occurrence per `strategyKey`, per-fill `expectedVersion` check, aggregate slippage/deadline, full-route revert on any failed fill, CEI ordering + reentrancy guard, one market + one direction per route (so freshly credited maker inventory cannot be recursively consumed in the same route).

**Output.** Four periphery contracts, each independently deployable against the Phase 8 router.

**Test.**
- `RiptideQuoter` differential test: for every `cpmm_swap_v1.json` + `fee_controller_v1.json` vector pair, the quoter's returned `amountIn`/`amountOut`/`feeBpsApplied` matches the Python differential oracle exactly.
- `RiptideBatchExecutor` multi-maker fork test: ≥2 makers, exact-in **and** exact-out batches, with staleness (mid-route reserve change → `RiptideStaleVersion`) and rollback tests (one fill fails → whole route reverts, confirmed via balance diff of every participant).
- `RiptideLens` reconciliation test: deliberately desync router runtime vs Aqua balance (e.g. direct Aqua manipulation on a fork) and assert `strategyState` surfaces the live (not stale) numbers.
- `RiptideAuctionSettler` unauthorized/expired-window fork tests (any caller may submit; only the deadline and surplus checks gate settlement).

**Exit criteria.** Gate 7 of `SYSTEM.md` §17: an atomic multi-maker batch (≥2 strategies, both quote kinds) executes on a fork with a passing stale-route + rollback test; `RiptideQuoter` is proven bit-for-bit against the Python differential oracle.

---

## Phase 12 — `RiptideDemoToken` and local deployment scripts

**Summary.** Unblocks every subsequent phase that needs tokens to move on a local fork. Corresponds to `CONTRACTS.md` §15 and `SYSTEM.md` §16 (`script/`).

**Implement exactly:**
1. `contracts/src/demo/RiptideDemoToken.sol` — standard 18-decimal ERC-20 with a faucet, demo-only, no production role.
2. `contracts/script/deploy.s.sol`, `seed.s.sol`, `ship.s.sol`, `dock.s.sol`, `rebalance.s.sol`, `demo.s.sol` — Foundry scripts covering the full dependency-ordered deploy (libraries → oracle/provider → kernel/instruction → router → periphery → demo tokens) plus a scripted seed of **three** demo strategies with different volatility/auction policies, matching the demo definition of done (`PROTOCOL.md` §20).
3. `deployments/<chainId>.json` populated for the local/Anvil profile per the schema in `SYSTEM.md` §14.3 (chain, block, commit, every contract address, demo tokens, placeholder subgraph URL, RPC/explorer links).

**Output.** `forge script script/deploy.s.sol --broadcast` stands up the full system on Anvil; `seed.s.sol` populates three strategies.

**Test.**
- Full local deploy + seed script runs end-to-end with 0 reverts.
- `deployments/<chainId>.json` validates against its documented schema (a small JSON-schema check in CI).
- Idempotency: re-running `seed.s.sol` against a fresh Anvil instance produces identical strategy hashes (demo-reset repeatability, `SYSTEM.md` §14.4).

**Exit criteria.** A fresh Anvil instance can be deployed and seeded from a single script invocation, deterministically, with no manual console steps — this is the repeatable base every off-chain component (Phases 13–19) will point at.

---

## Phase 13 — `packages/contracts` (generated clients)

**Summary.** Generated ABIs/typed clients so no downstream package hand-writes an ABI. Corresponds to `SYSTEM.md` §7.

**Implement exactly:**
1. Build pipeline: `forge build` → extract ABIs → generate TypeScript typed clients (e.g. via `wagmi`/`viem` codegen or an equivalent typed-ABI generator) into `packages/contracts`.
2. `manifest schema` validator consuming `deployments/<chainId>.json` (`SYSTEM.md` §7 table).
3. No secrets in this package — it is pure generated code + the manifest schema.

**Output.** `packages/contracts` importable by `strategy-sdk`, `solver-core`, `resolver-core`, `frontend-api`, and services.

**Test.** Codegen is deterministic (running it twice on the same ABI produces identical output — checked in CI like the vector `--check` pattern); a smoke import test from each consumer package resolves types with no `any`.

**Exit criteria.** Every other TS package in the monorepo can `import` typed contract clients with zero hand-maintained ABI JSON.

---

## Phase 14 — `packages/solver-core` + `services/solver-api`

**Summary.** The taker-side discovery/optimization/execution pipeline. Corresponds to `SYSTEM.md` §7–§8, `PROTOCOL.md` §9.

**Implement exactly:**
1. `packages/solver-core` — pure, deterministic taker route optimizer: bounded separable allocation (water-filling against a common marginal cost, since native `amountOut/amountIn` is non-increasing in size so exact-output cost is convex — `PROTOCOL.md` §9); exact rounding matching `riptide-math`; a "route certificate" recording expected strategy versions used.
2. `services/solver-api` — stateless orchestration implementing the four-step flow from `SYSTEM.md` §8 and `PROTOCOL.md` §9: query subgraph at block `B` → reproduce quotes + optimize with `solver-core` → refresh only the shortlisted strategies via batched RPC (bounded shortlist, `MAX_SHORTLIST` env) → `eth_call` simulate against `RiptideBatchExecutor` → return calldata + freshness metadata.
3. Endpoints: `POST /v1/quote`, `POST /v1/route`, `/livez`, `/readyz`, `/metrics` (`SYSTEM.md` §8).
4. **Trust boundary (blocking):** the service must be replaceable/stateless; it proposes routes but the contracts (Phase 8–11) are the sole source of correctness. No signature from this service grants authorization.

**Output.** A running `solver-api` against the Phase 12 local deployment, returning routes for at least the three seeded demo strategies.

**Test.**
- Unit: `solver-core` water-filling matches a hand-computed optimum on a small fixture (2–3 strategies, known reserves) — exact rounding matches `RiptideQuoter`.
- Integration: `POST /v1/route` against the local deployment returns calldata that, when submitted to `RiptideBatchExecutor` on the fork, settles with the quoted `amountOut` (within the declared rounding tolerance, i.e. exactly, given the differential guarantee from Phase 3/11).
- Adversarial: a solver response with a stale/manipulated route is rejected by the on-chain checks (reprise of Phase 11's stale-route test, this time entered through the actual service).
- `/livez`/`/readyz` respond correctly when the RPC or subgraph is unreachable.

**Exit criteria.** `solver-api` produces calldata that settles correctly against the live local deployment for both quote kinds and for a multi-strategy split; a manufactured bad route from the service still gets rejected on-chain, proving the trust boundary holds end to end.

---

## Phase 15 — `packages/resolver-core` + `services/resolver-bot` (`resolver-auction`)

**Summary.** The resolver-side coordination service and its pure evaluator. Corresponds to `SYSTEM.md` §8, `PROTOCOL.md` §10.

**Implement exactly:**
1. `packages/resolver-core` — pure rebalance evaluator: given open auctions, computes `S`, the `(1−β)S` take, and best-time-to-settle; no I/O (`SYSTEM.md` §7).
2. `services/resolver-bot` (the doc set names this both `resolver-bot` in `SYSTEM.md` §8 and `resolver-auction` in `PROTOCOL.md` §10/§15 — implement as one service satisfying both descriptions): watches external prices and RIPTIDE strategies' marginal prices; signals when mispricing crosses a profitability threshold; optionally ranks competing resolver intents; **never holds custody or settlement authority** — its ranking is advisory only, the on-chain `RiptideRebalanceInstruction` is the sole arbiter (`PROTOCOL.md` §10).
3. Submits to `RiptideAuctionSettler` when `resolver-core` judges a candidate profitable, using `RESOLVER_PRIVATE_KEY` — a demo-labelled key, distinct from any maker key.

**Output.** A running `resolver-bot` that detects the Phase 12 seeded strategies' mispricing and autonomously settles a rebalance on the local fork.

**Test.**
- Unit: `resolver-core.evaluate` matches the `diamond_split_v1.json` vectors for `S`/`payToResolver` given the same inputs.
- Integration: inject a price gap into the local deployment's oracle feed; the bot detects it, submits `settleRebalance`, and the on-chain event shows the correct β-split.
- Adversarial: bot attempts to submit a manufactured negative-surplus rebalance (bypassing its own profitability check) — on-chain `RiptideNoSurplus` still reverts it (reprise of V2, entered through the actual service).

**Exit criteria.** The bot autonomously and correctly settles a rebalance against a live price gap on the local deployment with no manual intervention, and a deliberately malicious submission from the bot is still blocked on-chain.

---

## Phase 16 — `services/vol-indexer`

**Summary.** Feeds price observations to the volatility oracle under a governed key. Corresponds to `SYSTEM.md` §8, `CONTRACTS.md` §7 Authority.

**Implement exactly:**
1. `services/vol-indexer` — polls `PRICE_SOURCE_URL` (or a local mock price feed for dev), calls `RiptideVolatilityOracle.observe*` using `GOVERNED_INDEXER_KEY`.
2. Confirms the on-chain clamp/stale-freeze bounds any bad input from this service — i.e., this service is explicitly **not** trusted for correctness, only for liveness of observations (`SYSTEM.md` §8).

**Output.** A running indexer that keeps the Phase 12 seeded strategies' σ estimates current between resolver-triggered updates.

**Test.**
- Integration: indexer-fed observations move `sigmaWad` exactly as the Phase 3 EWMA vectors predict.
- Adversarial: indexer attempts to submit an out-of-clamp or manipulated price — on-chain clamp still holds (reprise of Phase 5's clamp test, through the real service).
- Unauthorized-key test: a non-governed key attempting to call `observe*` through this service's code path still reverts on-chain (Phase 5 authority check, not re-implemented, just re-exercised).

**Exit criteria.** Indexer keeps live σ current on the local deployment; every adversarial input is still contained by the on-chain guards, not by the indexer's own good behavior.

---

## Phase 17 — Subgraph (Gate 9)

**Summary.** The single indexed dataset every discovery path (solver, resolver bot, web app) reads from instead of one RPC read per maker. Corresponds to `SYSTEM.md` §9 and delivers Gate 9 ("Ship live data").

**Implement exactly:**
1. `subgraph/schema.graphql` — entities exactly per `SYSTEM.md` §9 table: `Protocol`, `Market`, `Maker`, `Strategy`, `ControllerState`, `Fill`, `Rebalance`, `Route`, `Token`, `MarketSnapshot`.
2. `subgraph/mappings/*.ts` — handlers for Aqua `Shipped/Docked/Pushed/Pulled` (filtered to the router app), router `SwapFilled`/`FeeControllerUpdated`, and settler `RebalanceSettled`/`RouteExecuted` (`SYSTEM.md` §9, `CONTRACTS.md` §4).
3. `_meta` block usage so consumers can read the indexed block for freshness labelling (`SYSTEM.md` §9, `UI.md` §8).
4. A **second**, standardized-DEX subgraph connection (read-only, for the MCP comparison tool only — `SYSTEM.md` §9 last line).
5. Deploy against the Phase 12 local deployment (local Graph node or Studio pointed at the local RPC, per the chosen dev setup).

**Output.** A running subgraph indexing every event from the Phase 8–11 contracts, queryable by the solver, resolver bot, and (later) the web app.

**Test.**
- Event→entity mapping unit tests (Matchstick or equivalent) for every handler.
- Reorg/idempotency test: replay a block twice, assert no duplicate entities.
- Reconciliation test: for a batch of fills, subgraph-aggregated volume/recapture matches an independent on-chain sum via `RiptideLens`.
- Freshness test: artificially lag the indexer and confirm `_meta.block` reports the lag correctly (feeds the stale-route labelling tested again in Phase 19).

**Exit criteria.** Gate 9 of `SYSTEM.md` §17: subgraph reconciles with `RiptideLens` on the seeded demo state; solver/resolver discovery (Phases 14–15) can be repointed from direct RPC scanning to subgraph queries with identical results.

---

## Phase 18 — `services/liquidity-mcp` (Gate 11)

**Summary.** The reusable Graph-powered MCP tool exposing curve-aware executable liquidity and recapture data, composed with the standardized DEX subgraph. Corresponds to `SYSTEM.md` §8 and Gate 11 ("Ship the reusable Graph tool").

**Implement exactly:**
1. `services/liquidity-mcp` — MCP server exposing tools for: querying RIPTIDE's executable liquidity (curve-aware, accounting for the dynamic fee) and recapture stats, and comparing them against the standardized DEX subgraph source (`SYSTEM.md` §15 sponsor mapping row "The Graph MCP").

**Output.** An MCP server that answers "what's the executable liquidity/expected fee for size X on RIPTIDE vs a standard DEX" using live subgraph data.

**Test.** Tool-call integration tests against the Phase 17 subgraph with known seeded state; comparison output matches an independently computed reference (reuse `RiptideQuoter`'s numbers as ground truth for the RIPTIDE side).

**Exit criteria.** Gate 11: the MCP tool is callable and returns correct, subgraph-backed comparisons for the seeded demo strategies.

---

## Phase 19 — `packages/frontend-api` (gateway + deterministic mock)

**Summary.** The single framework-neutral boundary every UI component consumes. Building this **before** any page means Phase 20 (the actual web app) can start against the deterministic mock immediately and swap to live data without touching component code. Corresponds to `UI.md` §2.2, §9.

**Implement exactly:**
1. `packages/frontend-api` implementing exactly the surface in `UI.md` §9: `listMarkets`, `listStrategies`, `getStrategy`, `quoteSwap`, `buildSwapRoute`, `listOpenAuctions`, `previewRebalance`, `buildSettleRebalance`, `buildShipStrategy`, `buildDockStrategy`, `getControllerState`, `getRecaptureStats`, `streamEvents`, `getFreshness`.
2. Every `TxPlan`-returning function carries a `sendable: boolean` flag.
3. **Live implementation** — wires to `packages/contracts` (Phase 13), the solver-api (Phase 14), the subgraph (Phase 17), and `RiptideLens`/`RiptideQuoter` directly for read paths that don't need indexing latency.
4. **Deterministic mock implementation** — same interface, fixture data, every `TxPlan.sendable` hard-coded `false` so UI work never accidentally sends a real transaction against mock data.
5. Stable typed errors mapping 1:1 to the `RiptideErrors` custom errors from `CONTRACTS.md` §3 (e.g. `RiptideStaleVersion`, `RiptideSlippageExceeded`, `RiptideNoSurplus`, `RiptideStaleOracleRound`) — `UI.md` §8.
6. The web composition root talks to the live deployment; unit tests may stub `/api/riptide`. No component imports a transport directly.

**Output.** Two interchangeable implementations of one interface, both fully typed, both independently testable.

**Test.**
- Contract test: both implementations satisfy the same TypeScript interface (compile-time) and the same behavioral test suite run twice, once per implementation, with assertions scoped to what's implementation-appropriate (mock: fixture correctness + `sendable:false` always; live: matches on-chain ground truth from Phase 11/17).
- Error-mapping test: every `RiptideErrors` entry has a corresponding typed error case, exercised via a forced-failure fixture (mock) and a forced on-chain revert (live, via a crafted bad call on the fork).

**Exit criteria.** A component built purely against `frontend-api`'s mock could be pointed at the live implementation with a single flag flip and behave identically in shape (loading/empty/error/data), differing only in actual values.

---

## Phase 20 — Web application, all seven pages (Gate 10)

**Summary.** The four-persona interface. Built entirely against `frontend-api` (Phase 19); this phase is UI composition, not new data logic. Delivers Gate 10 ("Ship the UI — all seven pages without console intervention").

**Implement exactly**, per `UI.md` §2–§3, §10:
1. Shared infrastructure: `WalletConnectButton`, `NetworkGuard`, `ChainBanner`, `TokenBalanceReadout`, `AllowanceManager`, `TransactionStepper`; `RiptideThemeProvider`, `Card`/`StatTile`/`Meter`/`DataTable`/`Sparkline`/`Toast`/`Modal`, `FreshnessBadge`, `HonestyBadge`.
2. **`/` Landing** — `HeroExplainer`, `MechanismDiagram`, `PersonaCards`, `LiveProtocolStats` (from subgraph), `SponsorFooter`.
3. **`/make` Maker Studio** — `TokenPairSelector`, `ReserveInput`, `FeePolicyPanel`, `AuctionPolicyPanel`, `OracleConfigPanel`, `FeeCurvePreview`, `RecapturePreview`, `StrategyBytesInspector` (surfacing the Phase 4 hash-parity check), `ApproveAndShipStepper`.
4. **`/swap` Swap Terminal** — `MarketSelector`, `DirectionToggle`, `AmountInput`, `SlippageControl`, `RecipientField`, `DeadlineField`, `QuotePanel` (fee + σ transparency), `RouteBreakdown`, `FreshnessBadge`, `SimulationResult` (`eth_call` before signing), `ExecuteButton` (signs calldata targeting `RiptideBatchExecutor` only).
5. **`/resolve` Resolver Console** — `AuctionBoard`, `SurplusEstimator`, `RebalancePreview`, `AntiSandwichNotice`, `SettleButton` (surfaces `RiptideNoSurplus` on `S<0` before signing), `ResolverPnLLog`.
6. **`/positions` Strategy Manager** — `StrategyList`, `StrategyDetail`, `ControllerTelemetry`, `DockButton`, `RepublishFlow` (dock + ship a new salted strategy — no in-place edit).
7. **`/analytics` Recapture Dashboard** — `RecaptureHeadline`, `FeeVsLvrChart`, `LoopVisualizer` (reuses the Phase 9 loop trace), `MarketTable`, `EventFeed` (linked to tx + indexed block), `HonestyPanel` (renders the `SOURCES.md` ledger status, including that the K2 β-retention bound is simulation-validated, not an on-chain theorem).
8. **`/*` Not-Found/Unsupported** — `UnsupportedChainState`, `StrategyNotFoundState`, `EmptyState`.
9. Deep links carry `?market=<base>-<quote>` and `?strategy=<strategyHash>`.
10. Enforce `UI.md` §8 everywhere: explicit loading/empty/error states (never a blank component); typed-error → human message + machine code; freshness labelling with degraded-path offering, never silently claiming best execution from a stale snapshot; `HonestyBadge` wherever provenance matters.

**Output.** A deployable Next.js (or equivalent) app, all seven routes live, switchable between mock and live `frontend-api`.

**Test.**
- Per-page component tests against the Phase 19 mock (fast, deterministic CI).
- E2E (Playwright/Cypress) against the **live** Phase 12 local deployment, covering the exact `SYSTEM.md` §13 "Web" row: maker publish, taker route/execute, resolver settle, dock/replace, wrong network, stale route.
- Walk every user story in `UI.md` §4–§7 as a scripted E2E scenario (Maker stories 1–8, Taker 1–5, Resolver 1–5, Analyst 1–4) — each story must have a passing test, not just a plausible UI.
- Manual accessibility/responsive pass (not spec-mandated, but required for a judged demo to read cleanly).

**Exit criteria.** Gate 10: all seven pages function against the live local deployment with zero console/devtools intervention required, and every numbered user story in `UI.md` §4–§7 has a passing scripted test.

---

## Phase 21 — Deployment manifests & network profiles

**Summary.** Formalizes what Phase 12 did locally for the real target network(s) chosen in Prerequisites. Corresponds to `SYSTEM.md` §14.

**Implement exactly:**
1. **14.1 Dependency pinning gate** — re-run Phase 1's provenance check against the actual target network's official Aqua/SwapVM deployment (not just a generic fork); confirm `DEPENDENCY_LOCK.md` is still accurate.
2. **14.2 Network profiles** — finalize the integration profile (local fork with official Aqua) and the public demo profile (Graph-supported chain); a deployment spike proves Aqua/SwapVM/RPC/explorer/wallet/faucet/The Graph all work on the chosen chain before the profile is locked.
3. **14.3 Deployment manifest** — populate `deployments/<chainId>.json` for the real target chain: chain, block, commit, every contract address, subgraph URL, RPC/explorer/verification links. Every consumer (web/SDK/solver/resolver/scripts/subgraph) reads this **one** validated schema — no hardcoded addresses anywhere else in the codebase (grep-audit this).
4. **14.4 Runtime ops** — solver/resolver/MCP health endpoints wired to real uptime checks; RPC fallback/timeout configuration; subgraph lag surfaced in the UI (already built in Phase 20, now pointed at real lag); seeded wallets + a repeatable demo-reset script; deterministic tx-link generation; local-fork fallback recording if the public network is unavailable during a demo; audit that no key/secret is committed to git.

**Output.** A verified, addressed, health-checked deployment on the real target network(s), with a one-command demo-reset.

**Test.**
- Grep audit: zero hardcoded contract addresses outside `deployments/`.
- Full redeploy-from-manifest dry run on a fresh environment.
- Demo-reset script run twice back-to-back produces a usable, identical starting state both times.
- Explorer verification: every contract's source is verified on the target chain's explorer.

**Exit criteria.** The manifest is the single source of truth for every address in the system; a fresh machine with only the repo + `.env` can redeploy and reset the demo without any manual address-copying.

---

## Phase 22 — Hardening, full test-matrix closure, and demo rehearsal (Gate 12, final)

**Summary.** The last gate in `SYSTEM.md` §17: "Harden & rehearse." This phase does not add features — it closes every remaining row of the verification tables in `LVR_MATH.md` §8, `CONTRACTS.md` §16, and `SYSTEM.md` §13, and proves the full demo definition of done end to end, twice, without console intervention.

**Implement exactly (verification closure, not new code):**
1. Confirm every row of `SYSTEM.md` §13's verification table has a passing test: Math, Differential, Fuzz/invariants, SwapVM, Stateful invariants (V1–V5), Aqua, Runtime, Batch, Economic (L2, simulation), Subgraph, Web.
2. **Economic (L2) simulation** (`CONTRACTS.md` §16 "Honest edges", `LVR_MATH.md` §8 "Recapture"): run the β-recapture bound as a **statistical** simulation across many synthetic price paths; assert average leaked LVR `≤ (1−β)·L`; label this result honestly as simulation-validated, not an on-chain theorem, everywhere it's surfaced (contracts docstrings, the `HonestyPanel`, any README).
3. Complete `docs/` cross-references: confirm every `[confirm at build]` tag across all nine spec docs now has a resolved counterpart recorded somewhere (`RESOLUTIONS.md` from Phase 1, `DEPENDENCY_LOCK.md`, or inline contract comments) — a full-repo grep for `[confirm at build]` should return zero *unresolved* items (resolved ones may remain as historical citations, but each must point to its resolution).
4. Full CI: every job from Phase 0 (`forge build`, `pnpm -w build`, `python3 -m unittest`) plus every test suite added in Phases 3–20, green in one pipeline run.
5. **Demo script**: a written, timed runbook walking the exact `PROTOCOL.md` §20 demo definition of done:
   - Three seeded strategies with different volatility/auction policies.
   - Mechanism 1: a taker swap shows the quoted fee reflecting current volatility; a volatility spike raises the next quote's fee.
   - Mechanism 2: an injected price gap → resolver wins the declining auction → dashboard shows `β·surplus` credited to the maker and `(1−β)` paid to the resolver → a reverse swap is penalized by `Decay`.
   - Loop: the auction's revealed price updates the oracle and the next fee quote (reuses the Phase 9 trace).
   - Subgraph shows indexed fills, rebalances, fee/recapture events.
   - **The entire flow runs twice, back to back, from the Phase 21 demo-reset script, without console intervention.**
6. Submission obligations checklist (licenses, `DEPENDENCY_LOCK.md`, README, sponsor mapping write-up per `SYSTEM.md` §15) completed.

**Output.** A green CI pipeline covering the entire test matrix; a rehearsed, scripted, twice-repeatable demo; a complete, honest `docs/` + `DEPENDENCY_LOCK.md` + `RESOLUTIONS.md` paper trail with zero unresolved `[confirm at build]` tags.

**Test.** Run the full CI pipeline once from a clean checkout. Run the demo script twice in a row from a fresh `demo-reset` with a third party (someone who did not write the code) following the runbook and confirming each numbered demo item actually appears on screen.

**Exit criteria (project done, per `PROTOCOL.md` §20 / `SYSTEM.md` §18 "MVP Definition Of Done").** All seven numbered items in `SYSTEM.md` §18 are independently observable via real contract calls:
1. ≥3 makers publish distinct CPMM strategies with fee + auction policies through official Aqua/SwapVM.
2. The Graph discovers all live strategies.
3. A taker swaps and sees the volatility-indexed fee actually applied and the σ that produced it, split across makers, settled atomically.
4. Price drifts; a resolver wins the rebalancing auction; settlement rebates `(1−β)S` and retains `≥βS` for the LP via Aqua.
5. The next taker fee visibly changes because the revealed price re-calibrated the controller (the loop).
6. The Recapture Dashboard + MCP show cumulative LVR recaptured vs paid, each linked to on-chain evidence with the indexed block.
7. Exact-in/out, dynamic-fee, rebalance-split, no-surplus-revert, loop, stale-route, and atomic-revert tests pass; Foundry invariants V1–V5 pass with negative controls.

Anything less is, in the spec's own words, **"a useful prototype, not the complete RIPTIDE product described here"** — do not sign off this phase until all seven items are true simultaneously against the real deployed system.

---

## Appendix A — Phase dependency graph

```text
0 (bootstrap)
 └─ 1 (pin deps, resolve confirm-at-build items)
     └─ 2 (types/errors/events)
         └─ 3 (math libs + Python oracle)          ── Gate 2: math frozen
             └─ 4 (codec / wire format)             ── Gate 3: encoding frozen
                 ├─ 5 (volatility oracle)
                 ├─ 6 (fee provider, Mechanism 1 math)
                 └─ 7 (rebalance kernel, Mechanism 2 math)
                     └─ 8 (rebalance instruction + router)   ── Gate 4/5: mechanisms proven
                         └─ 9 (the loop)                     ── Gate 6: loop proven
                             └─ 10 (full V1–V5 + fuzz + invariant + fork suite)
                                 └─ 11 (periphery: settler/quoter/lens/batch)   ── Gate 7: atomic routing
                                     └─ 12 (demo token + local deploy scripts)
                                         ├─ 13 (packages/contracts codegen)
                                         │   ├─ 14 (solver-core + solver-api)
                                         │   ├─ 15 (resolver-core + resolver-bot)
                                         │   └─ 16 (vol-indexer)
                                         ├─ 17 (subgraph)                      ── Gate 9: live data
                                         │   └─ 18 (liquidity-mcp)             ── Gate 11: reusable Graph tool
                                         └─ 19 (frontend-api gateway + mock)
                                             └─ 20 (web app, 7 pages)          ── Gate 10: UI shipped
                                                 └─ 21 (deployment manifests, real network)
                                                     └─ 22 (hardening + demo rehearsal)  ── Gate 12: DONE
```

## Appendix B — Where each `[confirm at build]` item is closed

| Item | Raised in | Closed in |
| --- | --- | --- |
| `aqua*` fee-opcode variant existence | `SWAPVM_INTEGRATION.md` §11 | Phase 1 |
| Custom rebalance opcode slot value | `SWAPVM_INTEGRATION.md` §3.1, §11 | Phase 1 |
| `MakerTraits` program-slice bit packing | `SWAPVM_INTEGRATION.md` §6, §11 | Phase 1 (decision), Phase 4 (frozen vector) |
| Official Aqua/SwapVM addresses & commits | `INDEX.md` Open Items #2 | Phase 1, re-verified Phase 21 |
| EIP-170 fit / two-router split | `CONTRACTS.md` §11, `SWAPVM_INTEGRATION.md` §3.1 | Phase 8 |
| Toolchain version reconciliation | `SOURCES.md` §6 | Phase 1 |
| Fee-curve constant calibration | `INDEX.md` Open Items #3 | Ongoing governance parameter, not a one-time build gate — tuned during Phase 8/10 testing and documented as a governed value, never claimed as universal (`PROTOCOL.md` §13) |

## Appendix C — Non-goals reminder (do not build these)

Per `PROTOCOL.md` §18, the following are deliberately **out of scope** for every phase above — if a phase's implementation starts drifting toward one of these, stop and re-read `SOURCES.md` §4 for the scrap justification:

- Batch/uniform-price auctions or function-maximizing AMMs.
- An actively-managed or hedged vault; hedging the LP position; synthesizing exotic payoffs.
- A derivatives venue (power perpetuals, options on LP positions).
- A claimed-optimal, closed-form fee constant — the fee is always a tuned, governed controller, never a universal formula.
- A protocol custody vault, LP shares, an upgradeable proxy, a privileged price/parameter administrator, or in-place strategy editing — RIPTIDE has none of these by design (`SYSTEM.md` §1).
