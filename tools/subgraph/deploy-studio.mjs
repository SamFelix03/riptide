#!/usr/bin/env node
/**
 * Deploy subgraph to Graph Studio and optionally patch manifest subgraphUrl.
 * Requires: GRAPH_DEPLOY_KEY, GRAPH_STUDIO_SLUG
 *
 * Patches subgraph.yaml / helpers.ts for the target chain, deploys, then restores
 * the previous files so matchstick tests keep the local Anvil sources.
 */
import { config as loadEnv } from "dotenv";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const subgraphDir = path.join(root, "subgraph");
const chainIdOverride = process.env.RIPTIDE_DEPLOY_CHAIN_ID || process.env.TESTNET_CHAIN_ID;
const manifestOverride = process.env.DEPLOYMENT_MANIFEST;
loadEnv({ path: path.join(subgraphDir, ".env"), override: false });
if (chainIdOverride) process.env.CHAIN_ID = chainIdOverride;
if (manifestOverride) process.env.DEPLOYMENT_MANIFEST = manifestOverride;

const chainId = 84532;
process.env.CHAIN_ID = "84532";
const manifestPath = path.join(root, "deployments", "84532.json");
console.log(`Graph Studio deploy chainId=${chainId} manifest=${manifestPath}`);

function graphNetworkName(id) {
  if (id === 31337) return "anvil";
  if (id === 84532) return "base-sepolia";
  return `chain-${id}`;
}

const deployKey = process.env.GRAPH_DEPLOY_KEY;
const slug = process.env.GRAPH_STUDIO_SLUG;
const rpcRaw = process.env.RPC_URL ?? process.env.PUBLIC_RPC_URL ?? "https://sepolia.base.org";
const rpcUrl =
  chainId === 84532 && (rpcRaw.includes("127.0.0.1") || rpcRaw.includes("localhost"))
    ? "https://sepolia.base.org"
    : rpcRaw;
const network = graphNetworkName(chainId);

if (!deployKey || !slug) {
  console.error("Set GRAPH_DEPLOY_KEY and GRAPH_STUDIO_SLUG");
  process.exit(1);
}

const yamlPath = path.join(subgraphDir, "subgraph.yaml");
const helpersPath = path.join(subgraphDir, "src/helpers.ts");
const yamlBackup = fs.readFileSync(yamlPath);
const helpersBackup = fs.readFileSync(helpersPath);

function restoreSources() {
  fs.writeFileSync(yamlPath, yamlBackup);
  fs.writeFileSync(helpersPath, helpersBackup);
}

try {
  execSync("node tools/subgraph/sync-from-manifest.mjs", {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      CHAIN_ID: "84532",
      DEPLOYMENT_MANIFEST: manifestPath,
      DOTENV_CONFIG_OVERRIDE: "false",
    },
  });

  process.chdir(subgraphDir);
  execSync("pnpm run codegen", { stdio: "inherit" });
  execSync("pnpm run build", { stdio: "inherit" });

  const graphBin = path.join(subgraphDir, "node_modules/.bin/graph");
  // Studio rejects a label it has already seen, so a pinned label (the default, or one
  // left in subgraph/.env) makes every redeploy fail. Treat the configured value as a
  // prefix and suffix the manifest's deploy block: unique per stack, stable across
  // retries of the same stack.
  const deployBlock = JSON.parse(fs.readFileSync(manifestPath, "utf8")).blockNumber ?? Date.now();
  const labelPrefix = process.env.GRAPH_VERSION_LABEL ?? "v0.0.1";
  const versionLabel = labelPrefix.endsWith(`-${deployBlock}`) ? labelPrefix : `${labelPrefix}-${deployBlock}`;
  console.log(`Deploying subgraph network=${network} slug=${slug} (RPC must be reachable by Graph Studio indexers)`);
  try {
    execFileSync(
      graphBin,
      [
        "deploy",
        slug,
        "--deploy-key",
        deployKey,
        "--node",
        "https://api.studio.thegraph.com/deploy/",
        "--version-label",
        versionLabel,
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          ETHEREUM_RPC: rpcUrl,
          PATH: `${path.join(subgraphDir, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    );
  } catch {
    throw new Error(`graph deploy failed for slug=${slug} network=${network} version=${versionLabel}`);
  }
} finally {
  restoreSources();
  console.log("Restored subgraph.yaml and helpers.ts to pre-deploy sources.");
}

function isLoopbackUrl(url) {
  return Boolean(url && (url.includes("localhost") || url.includes("127.0.0.1")));
}

function studioQueryUrl(previous) {
  const fromEnv = process.env.GRAPH_QUERY_URL;
  if (fromEnv && !isLoopbackUrl(fromEnv)) return fromEnv;
  if (previous && !isLoopbackUrl(previous)) return previous;
  if (slug.includes("/")) return `https://api.studio.thegraph.com/query/${slug}/version/latest`;
  return `https://api.studio.thegraph.com/query/1758400/${slug}/version/latest`;
}

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const queryUrl = studioQueryUrl(manifest.subgraphUrl);
  manifest.subgraphUrl = queryUrl;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated ${manifestPath} subgraphUrl=${queryUrl}`);
} else {
  const queryUrl = studioQueryUrl();
  console.log(`Subgraph query URL: ${queryUrl}`);
  console.log(`Set SUBGRAPH_URL=${queryUrl} in solver-api and resolver-bot .env`);
}
