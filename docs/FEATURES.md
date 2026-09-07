# RIPTIDE Feature Traceability Matrix

Status: **the completeness gate.** Every feature and functionality of RIPTIDE appears in
exactly one row below with a concrete reference. The rule from
[`SOURCES.md`](SOURCES.md) §7 is enforced here: a feature is in scope **only** if its
reference is one of

- **[REF]** — a 1inch source file under [`refs/`](../../refs) (opened and cited by path);
- **[K1]/[K2]/[K3]** — a kept paper ([`SOURCES.md`](SOURCES.md) §3);
- **[STD]** — a flagged standard technique, estimation/control only
  ([`SOURCES.md`](SOURCES.md) §5);
- **[DESIGN]** — a RIPTIDE decision that *composes* the above (the composed primitives
  are named in the same row).

If a feature cannot be placed in one of those buckets, it is out of scope until it can.
"Reference" columns link to a `refs/` file or a sibling doc section; papers are cited by
their [`SOURCES.md`](SOURCES.md) key so bibliographic confirmation lives in one place
(now **[verified]** against the downloaded PDFs, [`SOURCES.md`](SOURCES.md) §6).

Legend for status: **[verified]** read from the pinned source; **[confirm at build]**
must be re-checked against the pinned commit; **[STD]/[DESIGN]** as above.

---

## 1. Mechanism 1 — volatility-indexed LVR fee

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 1.1 | Dynamic taker fee resolved by `staticcall` to an external provider | [REF] | [`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol) line ~181; [`IProtocolFeeProvider.sol`](../../refs/swap-vm/src/instructions/interfaces/IProtocolFeeProvider.sol) | [SWAPVM §4](SWAPVM_INTEGRATION.md) |
| 1.2 | **No new fee opcode** — fee lives inside `FeeProtocol` (0x80) | [REF] | same as 1.1 | [SOURCES §1](SOURCES.md) |
| 1.3 | `RiptideLvrFeeProvider implements IProtocolFeeProvider` | [DESIGN] | composes 1.1 + [`FeeFlat.sol`](../../refs/swap-vm/src/instructions/FeeFlat.sol) template | [CONTRACTS §8](CONTRACTS.md) |
| 1.4 | Break-even fee target `phi* = (σ²/8)/λ_Q` | [K1] | LVR `ell/V = σ²/8` (arXiv:2208.06046) | [LVR_MATH §2.1, §4](LVR_MATH.md) |
| 1.5 | Fee band clamp `[feeMin,feeMax] ⊂ (0,BPS)` | [REF] | guard `totalFeeBps<BPS` [`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol) line 217 | [LVR_MATH §4.2](LVR_MATH.md) |
| 1.6 | Clamped PI controller w/ anti-windup | [STD] | Åström–Murray *Feedback Systems* | [LVR_MATH §4.3](LVR_MATH.md), [SOURCES §5](SOURCES.md) |
| 1.7 | Fee determinism across quote/swap (advance state only when `!isStaticContext`) | [REF] | [`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) lines ~76–79 | [LVR_MATH §4.4](LVR_MATH.md) |
| 1.8 | Optional maker-paid **surplus fee** channel for recapture accounting | [REF] | `surplusBps` in [`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol) | [SWAPVM §4](SWAPVM_INTEGRATION.md) |
| 1.9 | Wrapping fee flow (adjust→runLoop→finalize, floor div) preserved | [REF] | [`FeeProtocol.sol`](../../refs/swap-vm/src/instructions/FeeProtocol.sol) lines 225–251 | [SWAPVM §4](SWAPVM_INTEGRATION.md) |

## 2. Mechanism 2 — resolver rebalancing auction + β-recapture

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 2.1 | Declining-price (Dutch) rebalancing schedule | [REF] | [`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol) 0x94/0x95 | [SWAPVM §5](SWAPVM_INTEGRATION.md) |
| 2.2 | Anti-sandwich / backrun penalty on reverse swaps | [REF] | [`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) 0x9c | [SWAPVM §5](SWAPVM_INTEGRATION.md) |
| 2.3 | β-retention: winner gets `(1−β)`, LP retains `β` | [K2] | arXiv:2210.10601 (β-retention bound `E[LVR to arbers] ≤ (1−β)L`) | [LVR_MATH §5](LVR_MATH.md) |
| 2.4 | Surplus split `payToResolver=Down((1−β)S)`, `retainToLP=S−payToResolver` | [DESIGN] | composes K2 + invariant 5 rounding | [LVR_MATH §5.3](LVR_MATH.md), [CONTRACTS §5](CONTRACTS.md) |
| 2.5 | `RiptideRebalanceInstruction` (the one custom opcode) | [DESIGN] | composes SwapVM instruction pattern ([`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) / [`DutchAuction.sol`](../../refs/swap-vm/src/instructions/DutchAuction.sol) storage + Aqua `pull`) | [CONTRACTS §10](CONTRACTS.md), [SWAPVM §5](SWAPVM_INTEGRATION.md) |
| 2.6 | β rebate paid via Aqua `pull(maker,…,to=resolver)` | [REF] | [`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol) L117 | [SWAPVM §8](SWAPVM_INTEGRATION.md) |
| 2.7 | No-surplus guard: revert if `S<0` (no loss-making settlement) | [DESIGN] | composes invariants 5/6 | [CONTRACTS §10, §3](CONTRACTS.md) |
| 2.8 | Stale-baseline `staleIn` from pre-rebalance CPMM curve | [DESIGN] | composes CPMM (2208.06046 marginal `x*`) + [`OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol) staleness | [LVR_MATH §5.3](LVR_MATH.md) |
| 2.9 | Off-chain resolver auction is **advisory**; on-chain math decides payout | [DESIGN] | solver/bot proposes; kernel decides payout | [PROTOCOL §10](PROTOCOL.md) |

## 3. Self-reinforcing loop

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 3.1 | Auction revealed price → volatility oracle observation | [DESIGN] | composes 2.1 + [`OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol) | [LVR_MATH §6](LVR_MATH.md) |
| 3.2 | Updated σ → next fee target (fee tracks LVR, not a constant) | [K3] | arXiv:2305.14604 (interior optimum principle) | [LVR_MATH §6](LVR_MATH.md), [SOURCES §3](SOURCES.md) |
| 3.3 | Loop kept to committed on-chain state (deterministic) | [REF] | `!isStaticContext` discipline [`Decay.sol`](../../refs/swap-vm/src/instructions/Decay.sol) | [LVR_MATH §4.4](LVR_MATH.md) |

## 4. AMM leg & core math

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 4.1 | CPMM `x·y=k` swap (exact-in / exact-out) | [REF] | `XYCSwap` = **0x50** [verified] ([`OpcodeList.sol`](../../refs/swap-vm/src/libs/OpcodeList.sol) line 106); whitepaper §5.3 | [SWAPVM §3](SWAPVM_INTEGRATION.md) |
| 4.2 | Live-balance sourcing for the AMM leg (router-seeded via Aqua trait; no opcode) | [REF] | `AQUA.safeBalances` in [`SwapVM.sol`](../../refs/swap-vm/src/SwapVM.sol) L167–169/L221–222 (gated by `useAquaInsteadOfSignature`) | [SWAPVM §3](SWAPVM_INTEGRATION.md) |
| 4.3 | LVR closed form `ell=(σ²P²/2)|x*′(P)|`, `x*=V′`, `V″≤0` | [K1] | arXiv:2208.06046 | [LVR_MATH §2](LVR_MATH.md) |
| 4.4 | LP decomposition `LP−rebalancing = fees − LVR` | [K1] | arXiv:2208.06046 | [LVR_MATH §2.2](LVR_MATH.md) |
| 4.5 | 512-bit mulDiv, WAD, directional rounding | [DESIGN] | `WadMulDiv` 512-bit product; `Up`=ceil, `Down`=floor | [LVR_MATH §1.1](LVR_MATH.md), [CONTRACTS §5](CONTRACTS.md) |
| 4.6 | Checked `ln/exp/pow/sqrt` over declared domains | [REF] | Solady `FixedPointMathLib` behind `LnExpMath` | [LVR_MATH §1.2](LVR_MATH.md), [CONTRACTS §5](CONTRACTS.md) |

## 5. Volatility estimation

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 5.1 | EWMA variance `var_k=λ var_{k−1}+(1−λ)r_k²` | [STD] | RiskMetrics Technical Document (J.P. Morgan, 1996) | [LVR_MATH §3](LVR_MATH.md), [SOURCES §5](SOURCES.md) |
| 5.2 | Garman–Klass range term | [STD] | Garman & Klass, 1980 | [LVR_MATH §3](LVR_MATH.md), [SOURCES §5](SOURCES.md) |
| 5.3 | Chainlink read + staleness freeze | [REF] | [`OraclePriceAdjuster.sol`](../../refs/swap-vm/src/instructions/OraclePriceAdjuster.sol) 0xb2 | [CONTRACTS §7](CONTRACTS.md) |
| 5.4 | σ clamp `[sigmaMin,sigmaMax]`; no-mutation in static ctx | [DESIGN] | composes 5.1–5.3 + invariant 3 | [CONTRACTS §7](CONTRACTS.md) |

## 6. Contracts, libraries, encoding

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 6.1 | Custom instruction dispatched via `_runOpcode` override (EIP-170) | [REF] | [`AquaSwapVMRouter.sol`](../../refs/swap-vm/src/routers/AquaSwapVMRouter.sol) `_dispatch`→`_runOpcode` (L26–27); [`AquaOpcodes.sol`](../../refs/swap-vm/src/opcodes/AquaOpcodes.sol) L27 | [SWAPVM §3.1](SWAPVM_INTEGRATION.md), [CONTRACTS §11](CONTRACTS.md) |
| 6.2 | Two-router split contingency (swap vs rebalance) | [DESIGN] | composes 6.1 under EIP-170 **[confirm at build]** | [SWAPVM §3.1](SWAPVM_INTEGRATION.md), [CONTRACTS §11](CONTRACTS.md) |
| 6.3 | Router is the Aqua **app**; minimal app authority | [REF] | `AQUA.safeBalances(maker,address(this),…)` [`SwapVM.sol`](../../refs/swap-vm/src/SwapVM.sol); [`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol) L88 | [SWAPVM §8](SWAPVM_INTEGRATION.md) |
| 6.4 | Payload codec + `validateStructure` (never authorization) | [REF] | RIPTIDE payload v1 + [`MakerTraits.sol`](../../refs/swap-vm/src/libs/MakerTraits.sol) | [SWAPVM §7](SWAPVM_INTEGRATION.md), [CONTRACTS §6](CONTRACTS.md) |
| 6.5 | `policyHash` vs `strategyHash` distinction | [REF] | Aqua `keccak256(abi.encode(order))` pattern | [SWAPVM §1](SWAPVM_INTEGRATION.md) |
| 6.6 | Program-offset MakerTrait committing the payload | [REF] | `USE_AQUA_TRAIT=1<<254`, `PROGRAM_OFFSET_SHIFT=208` [`MakerTraits.sol`](../../refs/swap-vm/src/libs/MakerTraits.sol) | [SWAPVM §6](SWAPVM_INTEGRATION.md) |
| 6.7 | Canonical named custom errors (no silent truncation) | [DESIGN] | named custom errors; no silent truncation | [CONTRACTS §3](CONTRACTS.md) |
| 6.8 | Canonical events for the subgraph | [DESIGN] | `IRiptideEvents`; Aqua `Shipped/Docked/Pulled/Pushed` for lifecycle | [CONTRACTS §4](CONTRACTS.md) |
| 6.9 | Stateless kernel below EIP-170, immutable-linked to router | [DESIGN] | EIP-170 split; kernel linked immutable from the router | [CONTRACTS §9](CONTRACTS.md) |
| 6.10 | Atomic multi-strategy taker route, bounded fills, version/slippage/deadline | [DESIGN] | single-tx multi-fill; on-chain recompute | [CONTRACTS §14](CONTRACTS.md) |
| 6.11 | Read-only Quoter/Lens reconciling config/runtime/Aqua/wallet | [DESIGN] | view quoter matching settlement math | [CONTRACTS §13](CONTRACTS.md) |
| 6.12 | Demo ERC-20 w/ faucet (standard ERC-20 only) | [REF] | OpenZeppelin ERC-20 + faucet | [CONTRACTS §15](CONTRACTS.md) |

## 7. Aqua integration (all five primitives)

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 7.1 | `ship` — publish strategy, inventory enters Aqua (no vault) | [REF] | [`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol) L96 | [SWAPVM §8](SWAPVM_INTEGRATION.md) |
| 7.2 | `safeBalances` — live reserves every quote/swap/rebalance | [REF] | [`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol) L88 | [SWAPVM §8](SWAPVM_INTEGRATION.md) |
| 7.3 | `pull` — swap output to taker; β rebate to resolver | [REF] | [`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol) L117 | [SWAPVM §8](SWAPVM_INTEGRATION.md) |
| 7.4 | `push` — swap input credited to maker strategy | [REF] | [`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol) L126 | [SWAPVM §8](SWAPVM_INTEGRATION.md) |
| 7.5 | `dock` — maker cancels & releases balances | [REF] | [`IAqua.sol`](../../refs/aqua/src/interfaces/IAqua.sol) L108 | [SWAPVM §8](SWAPVM_INTEGRATION.md) |

## 8. SwapVM invariants and program encoding

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 8.1 | Preserve all seven core invariants | [REF] | whitepaper §4 | [SWAPVM §9](SWAPVM_INTEGRATION.md) |
| 8.2 | Instruction encoding `[opcode:1][argsLen:1][args:N]` | [REF] | whitepaper §3.2 / Fig 2 | [SWAPVM §1](SWAPVM_INTEGRATION.md) |
| 8.3 | Canonical Aqua ordering `aquaProtocolFee→[swap]→flatFee→swap→salt` | [REF] | whitepaper §5.5 | [SWAPVM §6](SWAPVM_INTEGRATION.md) |
| 8.4 | Conservation `pool bal + protocol fee = initial + total amountIn` | [REF] | whitepaper §5.5 | [SWAPVM §6](SWAPVM_INTEGRATION.md) |
| 8.5 | RIPTIDE payload v1 (magic `RPT1=0x52505431`) | [DESIGN] | RIPTIDE fixed-length payload v1 | [SWAPVM §7](SWAPVM_INTEGRATION.md) |
| 8.6 | `Deadline(0x20)` as program's **first** instruction (expired order reverts before any balance) | [REF] | [`Controls.sol`](../../refs/swap-vm/src/instructions/Controls.sol) (Deadline; [`OpcodeList.sol`](../../refs/swap-vm/src/libs/OpcodeList.sol) line 54) | [SWAPVM §5.1](SWAPVM_INTEGRATION.md) |

## 9. Off-chain services

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 9.1 | Untrusted taker solver (contracts recompute; no signature grants correctness) | [DESIGN] | solver proposes; contracts recompute | [PROTOCOL §9](PROTOCOL.md) |
| 9.2 | Resolver bot bidding the Dutch auction (off-chain, advisory) | [DESIGN] | composes 2.1 + 9.1 | [PROTOCOL §10](PROTOCOL.md) |
| 9.3 | Volatility indexer feeding `observe*` (governed key) | [DESIGN] | composes 5.1–5.3 | [CONTRACTS §7](CONTRACTS.md) |
| 9.4 | The Graph subgraph: discovery + history + analytics | [REF] | The Graph; Aqua `Shipped/Docked/Pulled/Pushed` | [SYSTEM §9](SYSTEM.md)* |
| 9.5 | Reusable Executable-Liquidity MCP tool | [REF] | The Graph Subgraph MCP | [SYSTEM §8.2](SYSTEM.md)* |
| 9.6 | Indexed-block freshness gating (no best-exec claim from stale snapshot) | [DESIGN] | Graph `_meta` block; no best-exec from a stale snapshot | [UI §8](UI.md) |

## 10. Frontend (every page + boundary)

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 10.1 | `frontend-api` gateway + deterministic mock (`sendable:false`) | [DESIGN] | gateway + `sendable:false` mock; composition root selects transport | [UI §9](UI.md) |
| 10.2 | Maker Studio (fee/auction/oracle config, ship) | [DESIGN] | composes 1.x/2.x/5.x + PROTOCOL maker role | [UI §3.2](UI.md) |
| 10.3 | Swap Terminal (dynamic-fee-transparent quotes) | [DESIGN] | composes 1.x + PROTOCOL taker role | [UI §3.3](UI.md) |
| 10.4 | Resolver Console (auction board, surplus/β preview, settle) | [DESIGN] | composes 2.x | [UI §3.4](UI.md) |
| 10.5 | Strategy Manager (live state, controller telemetry, dock/republish) | [DESIGN] | composes 6.11 + PROTOCOL maker lifecycle | [UI §3.5](UI.md) |
| 10.6 | Recapture Dashboard (recaptured vs paid, fee-vs-LVR, loop) | [DESIGN] | composes K1/K2/K3 + subgraph | [UI §3.6](UI.md) |
| 10.7 | Wallet/network layer, honesty & freshness badges | [DESIGN] | wallet/network layer + SOURCES honesty labels | [UI §2, §8](UI.md) |
| 10.8 | Per-persona user stories (Maker/Taker/Resolver/Analyst) | [DESIGN] | composes all above | [UI §4–§7](UI.md) |

## 11. Verification and differential oracle

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 11.1 | Python arbitrary-precision oracle (120-digit) + committed vectors | [DESIGN] | Python `Decimal` oracle + committed JSON vectors | [DIFF_ORACLE](DIFF_ORACLE.md) |
| 11.2 | Differential testing (Solidity/TS vs committed JSON) | [DESIGN] | Solidity/TS must match committed JSON bit-for-bit | [DIFF_ORACLE](DIFF_ORACLE.md) |
| 11.3 | Deadline-first revert invariant (V5) + negative control | [DESIGN] | composes 8.6 + Foundry stateful-invariant discipline | [CONTRACTS §16](CONTRACTS.md) |
| 11.4 | β-split conservation (V1): fuzz + differential + negative control | [DESIGN] | composes K2 + negative-control discipline | [CONTRACTS §16](CONTRACTS.md) |
| 11.5 | No-surplus safety (V2) + negative control | [DESIGN] | composes 2.7 | [CONTRACTS §16](CONTRACTS.md) |
| 11.6 | Layer-2 β-retention bound validated by **simulation**, not on-chain | [K2] | arXiv:2210.10601 (β-retention bound; β=0.95 sims) | [CONTRACTS §16](CONTRACTS.md), [SOURCES §3](SOURCES.md) |

## 12. Deployment & operations

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 12.1 | Dependency pinning gate — **official published** `@1inch/swap-vm`/`@1inch/aqua` + SDK/OZ/Graph versions + licenses | [REF] | official 1inch packages; [`DEPENDENCY_LOCK.md`](../DEPENDENCY_LOCK.md) | [SYSTEM §14.1](SYSTEM.md)* |
| 12.2 | Deployment manifest `deployments/<chainId>.json` | [DESIGN] | `deployments/<chainId>.json` | [SYSTEM §14.3](SYSTEM.md)* |
| 12.3 | Network profiles (fork + public Graph-supported demo) | [DESIGN] | fork profile + public Graph-supported demo | [SYSTEM §14.2](SYSTEM.md)* |
| 12.4 | Deterministic encoding vector committed (payload/hashes) | [DESIGN] | committed payload/hash vector | [SWAPVM §11](SWAPVM_INTEGRATION.md) |

## 13. Sponsor mapping

| # | Feature | Kind | Reference | Doc |
| --- | --- | --- | --- | --- |
| 13.1 | 1inch Aqua load-bearing (publish/settle/cancel/lifecycle) | [REF] | [`refs/aqua`](../../refs/aqua) | [PROTOCOL §19](PROTOCOL.md) |
| 13.2 | 1inch SwapVM load-bearing (program, provider fee, custom instr, invariants) | [REF] | [`refs/swap-vm`](../../refs/swap-vm) | [PROTOCOL §19](PROTOCOL.md) |
| 13.3 | The Graph load-bearing (subgraph discovery + MCP) | [REF] | The Graph subgraph + Subgraph MCP | [PROTOCOL §19](PROTOCOL.md) |

---

## 14. Explicit non-features (scope guard)

Documented here so their **absence** is intentional, not an omission
([`PROTOCOL.md`](PROTOCOL.md) §18, [`SOURCES.md`](SOURCES.md) §4):

| Not built | Why | Scrapped ref |
| --- | --- | --- |
| FM-AMM / batch-uniform-price market | would *replace* the CPMM primitive, not use it | arXiv:2307.02074 |
| General convex CFMM routing | heavier than bounded single-maker allocation | arXiv:2204.05238 |
| Payoff replication / exotic curves | RIPTIDE curve is plain CPMM | arXiv:2103.14769, 2111.13740 |
| LP hedging / managed vault | contradicts no-vault self-custody Aqua model | arXiv:2303.11118 |
| Options/perps on LP (Panoptic, power perps) | orthogonal separate product | arXiv:2204.14232 |
| Optimal-fee **constant** claim | fee is a *controller*, not a closed-form constant | K3 kept for principle only |

---

## 15. Gate statement

Every row above resolves to a `refs/` file, a kept paper (K1–K3), a flagged standard
technique ([STD], estimation/control only), or a [DESIGN] composition whose primitives
are named. There is **no feature without a reference**. Rows marked **[confirm at
build]** (EIP-170 fit §6.2, MakerTraits packing §6.6, RIPTIDE custom-opcode slot
[CONTRACTS §11](CONTRACTS.md)) are the only open items, tracked in [`INDEX.md`](INDEX.md)
and [`SOURCES.md`](SOURCES.md) §6 — none of them blocks the specification, only the
pinned implementation.

\* [`SYSTEM.md`](SYSTEM.md) sections are authored in the system map;
rows referencing it are complete once that doc lands.
