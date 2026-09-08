# Pinned dependencies

Status: **populated** (Phase 1, Gate 1). Re-verify before any production deployment
(`SYSTEM.md` §14.1).

Date verified: 2026-09-08.

---

## Foundry / Solidity dependencies (`contracts/lib/`)

| Package | Version / Tag | Commit | License | Source |
| --- | --- | --- | --- | --- |
| `1inch/swap-vm` | `v1.0.2` | `32c687c2b73101fc26549e48fa1ff8a4d73afbac` | LicenseRef-Degensoft-SwapVM-1.1 | https://github.com/1inch/swap-vm |
| `1inch/aqua` | `v1.0.0` | `81c26e4619ce21556ab02b3284ee2685de21fb18` | LicenseRef-Degensoft-Aqua-Source-1.1 | https://github.com/1inch/aqua |
| `1inch/solidity-utils` | `6.9.14` | `b8e7fd4299d5d6c63ce6be07e6a44b55c68bc7ff` | MIT | https://github.com/1inch/solidity-utils |
| `OpenZeppelin/openzeppelin-contracts` | `v5.4.0` | `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` | MIT | https://github.com/OpenZeppelin/openzeppelin-contracts |
| `Vectorized/solady` | `v0.1.26` | `acd959aa4bd04720d640bf4e6a5c71037510cc4b` | MIT | https://github.com/Vectorized/solady |
| `foundry-rs/forge-std` | `v1.16.2` | `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` | MIT | https://github.com/foundry-rs/forge-std |

Install command (reproducible):

```bash
cd contracts
forge install foundry-rs/forge-std@v1.16.2
forge install 1inch/swap-vm@v1.0.2
forge install 1inch/aqua@v1.0.0
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0
forge install Vectorized/solady@v0.1.26
forge install 1inch/solidity-utils@6.9.14
```

Remappings: see `contracts/remappings.txt`.

---

## TypeScript dependencies (`packages/strategy-sdk/`)

| Package | Version | License | Source |
| --- | --- | --- | --- |
| `@1inch/swap-vm-sdk` | `0.4.1` | LicenseRef-Degensoft-SwapVM-1.1 | https://www.npmjs.com/package/@1inch/swap-vm-sdk |
| `@1inch/aqua-sdk` | `0.3.1` | (see package) | https://www.npmjs.com/package/@1inch/aqua-sdk |
| `viem` | `2.48.4` | MIT | https://www.npmjs.com/package/viem |

---

## Deployed contract addresses (Ethereum mainnet, canonical vanity redeploy)

| Contract | Address |
| --- | --- |
| Aqua registry | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` |
| AquaSwapVMRouter v1.0.2 | `0x111111338c5091e8440b67b168bae16a668ac0de` |

Verified via fork smoke test `contracts/test/fork/Provenance.t.sol` (ship + safeBalances).

---

## Toolchain

| Tool | Version |
| --- | --- |
| Solidity | `0.8.30` |
| Foundry | `1.2.3-stable` (commit `a813a2cee7dd4926e7c56fd8a785b54f32e0d10f`) |
| Node.js | `>=20` (engines); CI uses 22 |
| pnpm | `9.15.0` |
| Python | `3.11+` |

Compiler settings mirror `1inch/swap-vm` `foundry.toml`: `via_ir = true`, `optimizer_runs = 700`, `evm_version = "cancun"`.

---

## Build decisions

See [`RESOLUTIONS.md`](RESOLUTIONS.md) for `[confirm at build]` resolutions.
