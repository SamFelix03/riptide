# RIPTIDE document map

Catalog of every RIPTIDE specification: **which files exist**, **what each one
owns**, and **what depends on what**. If a topic is not owned by exactly one
document below, it is a gap — record it here rather than duplicating prose.

This bootstrap commit includes the core specification set. Implementation-phase
companions (walkthrough, env, resolutions, ln/exp bounds) land later.

## Reading order

For a first pass, read in this order. Each builds on the previous.

1. [`SOURCES.md`](SOURCES.md) — what is real, what we verified, what we kept vs scrapped.
2. [`PROTOCOL.md`](PROTOCOL.md) — the product and protocol, end to end.
3. [`LVR_MATH.md`](LVR_MATH.md) — the normative mathematics.
4. [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) — how the math becomes SwapVM bytecode over Aqua.
5. [`CONTRACTS.md`](CONTRACTS.md) — every contract, interface, event, error, invariant.
6. [`SYSTEM.md`](SYSTEM.md) — every component (on- and off-chain), flows, deployment.
7. [`UI.md`](UI.md) — every page, its components, and the user stories.
8. [`DIFF_ORACLE.md`](DIFF_ORACLE.md) — the independent high-precision oracle and differential tests.
9. [`FEATURES.md`](FEATURES.md) — the master feature → reference traceability matrix.

## Documents

| Document | Owns (authoritative for) | Must not contain |
| --- | --- | --- |
| [`SOURCES.md`](SOURCES.md) | The research audit: every paper/source, verified-vs-flagged status, the keep/scrap triage with justification, and the exact `refs/` files RIPTIDE relies on. | Product decisions, contract APIs. |
| [`PROTOCOL.md`](PROTOCOL.md) | What RIPTIDE is; the two mechanisms as product; strategy lifecycle; roles; scope and non-goals; sponsor mapping; demo definition of done. | Equation derivations, Solidity signatures. |
| [`LVR_MATH.md`](LVR_MATH.md) | All normative math: LVR, CPMM specialization, Diamond β recapture bound, volatility estimation, the fee controller, WAD/transcendental arithmetic contract, required math tests. | Contract wiring, UI. |
| [`SWAPVM_INTEGRATION.md`](SWAPVM_INTEGRATION.md) | Opcode selection and program encoding, the canonical RIPTIDE instruction order, preservation of the 7 SwapVM invariants, and the Aqua primitive mapping (`ship/dock/pull/push/safeBalances`). | Off-chain services, UI. |
| [`CONTRACTS.md`](CONTRACTS.md) | Every contract and library: responsibility, external interface, events, custom errors, and per-contract invariants; the verification and testing plan (Foundry unit/fuzz/invariant + Python differential model). | Economic rationale (lives in PROTOCOL / LVR_MATH). |
| [`SYSTEM.md`](SYSTEM.md) | The full component inventory (on-chain, TS packages, services, subgraph, web), system diagrams, end-to-end flows, workspace tree, build order, deployment, security surface. | Line-level math or UI component lists. |
| [`UI.md`](UI.md) | Every page/screen, the component list per page, the data contract, UI state machines, error surface, and the **user stories for every persona** (LP/maker, taker, resolver, analyst). | Solidity, solver internals. |
| [`DIFF_ORACLE.md`](DIFF_ORACLE.md) | The Python arbitrary-precision oracle, the rounding contract, the committed test vectors, and the differential-testing rule. | On-chain code. |
| [`FEATURES.md`](FEATURES.md) | The master list of **every feature** with a reference for each (paper, `refs/` file path, or doc section). The completeness gate: no feature without a reference. | New requirements (features must already be specified elsewhere). |

## Cross-cutting conventions

These hold across all documents and are defined once, where noted:

- **Units and rounding.** WAD (1e18) fixed point; directional rounding "favors the
  maker". Defined in [`LVR_MATH.md`](LVR_MATH.md) §Integer Arithmetic Contract.
  SwapVM fee units are `BPS = 1e7 = 100%`.
- **Orientation.** Native SwapVM registers are output-per-input; the UI displays
  quote-per-base. Conversion happens only at the market boundary. Defined in
  [`LVR_MATH.md`](LVR_MATH.md) §Units and Orientation.
- **Trust boundary.** Off-chain components (solver, resolver auction, vol indexer,
  subgraph) are **untrusted for correctness**: they can propose a poor route or a
  losing bid but cannot bypass on-chain reserve, price, version, deadline, β-split,
  or slippage checks. Defined in [`PROTOCOL.md`](PROTOCOL.md) §Trust Model.
- **Honesty labels.** Any statement that we could not confirm from the pulled
  sources is tagged `[UNVERIFIED]` or `[STANDARD-REFERENCE, OUTSIDE SURVEY]` and is
  catalogued in [`SOURCES.md`](SOURCES.md).

## Status legend

- **Normative** — the document defines required behavior; implementations must match.
- **Draft** — structurally complete, open items listed at the end of the document.

| Document | Status |
| --- | --- |
| `INDEX.md` | Normative |
| `SOURCES.md` | Normative |
| `PROTOCOL.md` | Normative |
| `LVR_MATH.md` | Normative |
| `SWAPVM_INTEGRATION.md` | Normative |
| `CONTRACTS.md` | Normative |
| `SYSTEM.md` | Normative |
| `UI.md` | Normative |
| `DIFF_ORACLE.md` | Normative |
| `FEATURES.md` | Normative |

Root companions (not in `docs/`):

| Document | Owns |
| --- | --- |
| [`../DEPENDENCY_LOCK.md`](../DEPENDENCY_LOCK.md) | Pinned Foundry/npm versions, commits, licenses |
| [`../RESOLUTIONS.md`](../RESOLUTIONS.md) | `[confirm at build]` resolutions from the pinned SwapVM/Aqua commits |

## Open items (whole project)

Tracked centrally so no single document silently owns an unresolved question:

1. **Bibliographic metadata — resolved.** Paper titles, authors, and arXiv IDs for
   the LVR, Diamond, and fee papers were verified directly from the downloaded PDFs
   (title pages + page self-stamps, [`SOURCES.md`](SOURCES.md) §6); the *equations*
   were verified from full text. No residual action.
2. **Official address/commit pinning — resolved.** Aqua registry and AquaSwapVMRouter
   v1.0.2 addresses and commits are recorded in [`DEPENDENCY_LOCK.md`](../DEPENDENCY_LOCK.md)
   and [`RESOLUTIONS.md`](../RESOLUTIONS.md) §4, and exercised by
   `contracts/test/fork/Provenance.t.sol`.
3. **Fee-curve constant.** The exact constant mapping estimated volatility to
   `feeBps` is a governed/tuned controller parameter, not a claimed universal
   formula; its calibration procedure is in [`LVR_MATH.md`](LVR_MATH.md) §Fee Controller.
