#!/usr/bin/env node
/**
 * Deploy the RIPTIDE stack on Base Sepolia (84532).
 * Contracts + demo tokens + Chainlink mock feed only — no persona funding, no seed.
 * Never logs or writes the deployer key into tracked files.
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  (0x-prefixed or raw hex)
 * Optional:
 *   RPC_URL / PUBLIC_RPC_URL  (default https://sepolia.base.org)
 *   GRAPH_DEPLOY_KEY + GRAPH_STUDIO_SLUG  (optional subgraph)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, "subgraph/.env") });
const CHAIN_ID = Number.parseInt(process.env.TESTNET_CHAIN_ID ?? "84532", 10);
const RPC_URL_RAW = process.env.RPC_URL ?? process.env.PUBLIC_RPC_URL ?? "https://sepolia.base.org";
const RPC_URL =
  RPC_URL_RAW.includes("127.0.0.1") || RPC_URL_RAW.includes("localhost")
    ? "https://sepolia.base.org"
    : RPC_URL_RAW;
const PUBLIC_RPC_URL = "https://sepolia.base.org";
const EXPLORER_URL = process.env.EXPLORER_URL ?? "https://sepolia.basescan.org";

function normalizeKey(raw) {
  if (!raw) return "";
  const trimmed = raw.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

const deployerKey = normalizeKey(process.env.DEPLOYER_PRIVATE_KEY);
if (!deployerKey || deployerKey.length !== 66) {
  console.error("Set DEPLOYER_PRIVATE_KEY to a 32-byte hex key (with or without 0x).");
  process.exit(1);
}

if (CHAIN_ID === 31337) {
  console.error("This script is for public testnet. For Anvil use: pnpm demo:reset");
  process.exit(1);
}

const env = {
  ...process.env,
  CHAIN_ID: String(CHAIN_ID),
  RPC_URL,
  PUBLIC_RPC_URL,
  EXPLORER_URL,
  DEPLOYER_PRIVATE_KEY: deployerKey,
  FORCE_PROTOCOL_REDEPLOY: process.env.FORCE_PROTOCOL_REDEPLOY ?? "1",
  GIT_COMMIT: process.env.GIT_COMMIT ?? execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim(),
};

function copySubgraphAbis() {
  const names = [
    "RiptideSwapVMRouter",
    "RiptideRebalanceRouter",
    "RiptideLvrFeeProvider",
    "RiptideBatchExecutor",
  ];
  for (const name of names) {
    const src = path.join(root, "contracts/out", `${name}.sol`, `${name}.json`);
    const dst = path.join(root, "subgraph/abis", `${name}.json`);
    const art = JSON.parse(fs.readFileSync(src, "utf8"));
    fs.writeFileSync(dst, `${JSON.stringify(art.abi, null, 2)}\n`);
  }
  console.log("Copied subgraph ABIs from forge artifacts.");
}

function run(cmd, opts = {}) {
  const printable = cmd.replaceAll(deployerKey, "<deployer-key>");
  console.log(`\n> ${printable}`);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd ?? root, env: { ...env, ...opts.env } });
}

function cast(cmd) {
  return execSync(`cast ${cmd}`, { encoding: "utf8", env }).trim();
}

const deployer = cast(`wallet address --private-key ${deployerKey}`);
const balanceWei = BigInt(cast(`balance ${deployer} --rpc-url ${RPC_URL}`));
const minWei = 8_000_000_000_000_000n;
console.log(`Deployer ${deployer}`);
console.log(`Balance  ${balanceWei} wei on chain ${CHAIN_ID}`);
if (balanceWei < minWei) {
  console.error(
    `Deployer needs testnet ETH on Base Sepolia. Have ${balanceWei} wei, want at least ${minWei} plus gas.`,
  );
  process.exit(1);
}

run(`forge script script/deploy.s.sol:DeployScript --broadcast --slow --rpc-url ${RPC_URL} -vvv`, {
  cwd: path.join(root, "contracts"),
});

run(`pnpm --filter @riptide/contracts codegen`);
run(`pnpm --filter @riptide/contracts build`);
run(`pnpm --filter @riptide/frontend-api build`);
copySubgraphAbis();

run(`pnpm --filter @riptide/contracts validate-manifest deployments/${CHAIN_ID}.json`);
run("pnpm --filter @riptide/frontend-api exec node scripts/seed-testnet.mjs", {
  env: { ...env, RIPTIDE_REPO_ROOT: root, CHAIN_ID: String(CHAIN_ID) },
});

if (process.env.GRAPH_DEPLOY_KEY && process.env.GRAPH_STUDIO_SLUG) {
  try {
    run("node tools/subgraph/sync-from-manifest.mjs", { env: { ...process.env, ...env, CHAIN_ID: String(CHAIN_ID) } });
    run("node tools/subgraph/deploy-studio.mjs", { env: { ...process.env, ...env, CHAIN_ID: String(CHAIN_ID) } });
  } catch {
    console.warn("Graph Studio deploy failed — quotes/swaps/analytics continue via RPC logs.");
  }
} else {
  console.log("Skipping Graph Studio (set GRAPH_DEPLOY_KEY + GRAPH_STUDIO_SLUG to enable).");
}

const manifestPath = path.join(root, "deployments", `${CHAIN_ID}.json`);
if (!fs.existsSync(manifestPath)) {
  console.error(`Expected ${manifestPath} after deploy`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
console.log("\n=== Testnet deploy complete ===");
console.log(`chainId:          ${manifest.chainId}`);
console.log(`name:             ${manifest.name}`);
console.log(`rpcUrl:           ${manifest.rpcUrl}`);
console.log(`explorerUrl:     ${manifest.explorerUrl}`);
console.log(`swapRouter:      ${manifest.swapRouter}`);
console.log(`rebalanceRouter: ${manifest.rebalanceRouter}`);
console.log(`chainlinkFeed:   ${manifest.chainlinkFeed ?? "(none)"}`);
console.log(`subgraphUrl:     ${manifest.subgraphUrl || "(empty — RPC fallback)"}`);
console.log("\nFrontend: connect an injected wallet on Base Sepolia. Makers mint RBASE/RQUOTE from the UI.");
console.log("Do not commit DEPLOYER_PRIVATE_KEY. GOVERNED_INDEXER_KEY must be the same key (oracle owner).");
