#!/usr/bin/env node
/**
 * Local Anvil demo reset: redeploy, seed S1–S3 with well-known keys, sync subgraph, patch env.
 * Public testnet uses `pnpm deploy:testnet` (contracts only) and a connected wallet in the frontend.
 */
import { config as loadEnv } from "dotenv";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(root, ".env") });

const chainId = Number.parseInt(process.env.CHAIN_ID ?? "31337", 10);
if (chainId !== 31337) {
  console.error("pnpm demo:reset is Anvil-only. For Base Sepolia: pnpm deploy:testnet");
  process.exit(1);
}

const manifestPath = path.join(root, "deployments", `${chainId}.json`);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const deployerKey =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd.replace(deployerKey, "<deployer-key>")}`);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function patchEnvFile(envPath, key, value) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(envPath, `${next.filter((l, i) => i < next.length - 1 || l !== "").join("\n")}\n`);
}

console.log(`RIPTIDE demo reset — Anvil on ${rpcUrl}`);

run(
  `forge script script/deploy.s.sol:DeployScript --broadcast --rpc-url ${rpcUrl} --code-size-limit 100000 --legacy`.trim(),
  {
    cwd: path.join(root, "contracts"),
    env: { ...process.env, DEPLOYER_PRIVATE_KEY: deployerKey, RPC_URL: rpcUrl, CHAIN_ID: "31337" },
  },
);

run(
  `forge script script/seed.s.sol:SeedScript --broadcast --rpc-url ${rpcUrl} --unlocked --code-size-limit 100000 --legacy`.trim(),
  {
    cwd: path.join(root, "contracts"),
    env: { ...process.env, DEPLOYER_PRIVATE_KEY: deployerKey, RPC_URL: rpcUrl, CHAIN_ID: "31337" },
  },
);

run("node tools/subgraph/sync-from-manifest.mjs", { env: { ...process.env, CHAIN_ID: "31337" } });
try {
  run("node tools/subgraph/deploy-local.mjs", { env: { ...process.env, DEPLOYMENT_MANIFEST: manifestPath } });
} catch {
  console.warn("Subgraph deploy skipped (Graph Node may not be running). Manifest + contracts are fresh.");
}

run(`pnpm --filter @riptide/contracts validate-manifest deployments/31337.json`);

run("node tools/demo/skew-oracle.mjs", {
  env: { ...process.env, CHAIN_ID: "31337", RPC_URL: rpcUrl, DEPLOYER_PRIVATE_KEY: deployerKey },
});

run("node tools/demo/fund-taker.mjs", {
  env: { ...process.env, CHAIN_ID: "31337", RPC_URL: rpcUrl, DEPLOYER_PRIVATE_KEY: deployerKey },
});

const manifest = readManifest();
const envTargets = [
  path.join(root, "services/vol-indexer/.env"),
  path.join(root, "packages/frontend-api/.env"),
  path.join(root, "services/solver-api/.env"),
  path.join(root, "services/resolver-bot/.env"),
  path.join(root, "services/liquidity-mcp/.env"),
];
for (const envPath of envTargets) {
  patchEnvFile(envPath, "CHAIN_ID", "31337");
}

console.log("\n=== Demo reset complete ===");
console.log(`Chain ID:    ${manifest.chainId}`);
console.log(`Subgraph:    ${manifest.subgraphUrl || "(RPC fallback — no subgraph URL)"}`);
console.log(`Strategies:  ${manifest.seededStrategies?.length ?? 0} seeded`);
console.log("\nThe web app always targets Base Sepolia. Anvil services are for local scripts/tests only.");
console.log("  solver-api:    http://127.0.0.1:8081/livez");
console.log("  resolver-bot:  http://127.0.0.1:8082/livez");
console.log("  vol-indexer:   http://127.0.0.1:8083/livez");
console.log("  liquidity-mcp: http://127.0.0.1:8084/livez");
console.log("  web app:       http://127.0.0.1:3000");
