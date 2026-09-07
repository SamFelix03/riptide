# Deployment manifests

Each `deployments/<chainId>.json` file is the single source of truth for contract
addresses on a given network. All consumers (web app, SDK, solver, resolver, scripts,
subgraph) read from this manifest — no hardcoded addresses elsewhere in the codebase.

## Schema (`deployments/<chainId>.json`)

```json
{
  "chainId": 1,
  "name": "ethereum",
  "blockNumber": 0,
  "commit": "git-sha",
  "aqua": "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a",
  "router": "0x111111338c5091e8440b67b168bae16a668ac0de",
  "settler": "",
  "kernel": "",
  "oracle": "",
  "feeProvider": "",
  "quoter": "",
  "lens": "",
  "batchExecutor": "",
  "demoTokens": {
    "base": "",
    "quote": ""
  },
  "subgraphUrl": "",
  "rpcUrl": "",
  "explorerUrl": ""
}
```

Populated in later phases (local Anvil, then the public demo network).
