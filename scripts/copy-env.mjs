#!/usr/bin/env node
/**
 * Copy all .env.example templates to local .env (never committed).
 * Fill secrets after running deploy / Graph Studio. See ENV.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  "contracts/.env.example",
  "services/solver-api/.env.example",
  "services/resolver-bot/.env.example",
  "services/vol-indexer/.env.example",
  "subgraph/.env.example",
  "services/liquidity-mcp/.env.example",
  "packages/frontend-api/.env.example",
  "apps/web/.env.example",
];

for (const rel of targets) {
  const src = path.join(root, rel);
  const dest = src.replace(".env.example", ".env");
  if (!fs.existsSync(src)) {
    console.warn(`skip (missing): ${rel}`);
    continue;
  }
  if (fs.existsSync(dest)) {
    console.log(`exists: ${path.relative(root, dest)}`);
    continue;
  }
  fs.copyFileSync(src, dest);
  console.log(`created: ${path.relative(root, dest)}`);
}

console.log("\nFill secrets only (see ENV.md). Addresses and public RPC come from deployments/<chainId>.json.");
console.log("  - DEPLOYER_PRIVATE_KEY, GOVERNED_INDEXER_KEY, RESOLVER_PRIVATE_KEY (testnet)");
console.log("  - ETHERSCAN_API_KEY, GRAPH_DEPLOY_KEY, GRAPH_STUDIO_SLUG, GRAPH_API_KEY");
