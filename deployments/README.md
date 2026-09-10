# Deployment manifests

Each `deployments/<chainId>.json` file is the single source of truth for contract
addresses on a given network. All consumers (web app, SDK, solver, resolver, scripts,
subgraph) read from this manifest — no hardcoded addresses elsewhere in the codebase.

## Local Anvil

1. Start Anvil: `anvil --host 0.0.0.0 --chain-id 31337`
2. Deploy: `forge script script/deploy.s.sol:DeployScript --broadcast --rpc-url http://127.0.0.1:8545`
3. Seed S1–S3: `forge script script/seed.s.sol:SeedScript --broadcast --rpc-url http://127.0.0.1:8545`
4. Validate: `pnpm --filter @riptide/contracts validate-manifest deployments/31337.json`

`deployments/31337.json` is written by the scripts and is gitignored. The committed
fixture [`31337.example.json`](31337.example.json) is the schema sample CI checks.

## Schema (`deployments/<chainId>.json`)

```json
{
  "chainId": 31337,
  "name": "anvil",
  "blockNumber": 0,
  "commit": "git-sha",
  "aqua": "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a",
  "swapRouter": "0x111111338c5091e8440b67b168bae16a668ac0de",
  "rebalanceRouter": "0x111111338c5091e8440b67b168bae16a668ac0df",
  "kernel": "0x0000000000000000000000000000000000000001",
  "oracle": "0x0000000000000000000000000000000000000002",
  "feeProvider": "0x0000000000000000000000000000000000000003",
  "settler": "0x0000000000000000000000000000000000000004",
  "quoter": "0x0000000000000000000000000000000000000005",
  "lens": "0x0000000000000000000000000000000000000006",
  "batchExecutor": "0x0000000000000000000000000000000000000007",
  "demoTokens": {
    "base": "0x0000000000000000000000000000000000000011",
    "quote": "0x0000000000000000000000000000000000000012"
  },
  "chainlinkFeed": "0x0000000000000000000000000000000000000013",
  "demoResolver": "0x0000000000000000000000000000000000000014",
  "seededStrategies": [
    {
      "id": "S1",
      "maker": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "salt": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "strategyKey": "0x0000000000000000000000000000000000000000000000000000000000000001",
      "orderHash": "0x0000000000000000000000000000000000000000000000000000000000000002"
    }
  ],
  "subgraphUrl": "",
  "rpcUrl": "http://127.0.0.1:8545",
  "explorerUrl": ""
}
```

`seededStrategies` is empty after `deploy.s.sol` and filled by `seed.s.sol` with
three demo markets (S1–S3) that use distinct fee/auction policies.
