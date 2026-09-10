#!/usr/bin/env node
/**
 * Re-ship demo strategies S1–S3 against the current Base Sepolia manifest.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { loadManifest } from "@riptide/contracts";
import { restoreDemoStrategiesLive } from "../dist/live/restoreDemo.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(root, ".env") });

const chainId = Number.parseInt(process.env.TESTNET_CHAIN_ID ?? "84532", 10);
if (chainId === 31337) {
  console.error("Use pnpm demo:reset for Anvil.");
  process.exit(1);
}

process.env.RIPTIDE_REPO_ROOT = root;
process.env.CHAIN_ID = String(chainId);

const manifest = loadManifest(chainId);
const rpcRaw = process.env.RPC_URL ?? process.env.PUBLIC_RPC_URL ?? manifest.rpcUrl;
const rpcUrl =
  rpcRaw.includes("127.0.0.1") || rpcRaw.includes("localhost")
    ? "https://sepolia.base.org"
    : rpcRaw;
const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

const result = await restoreDemoStrategiesLive(
  client,
  manifest,
  rpcUrl,
  chainId,
  process.env.CHAINLINK_FEED_ADDRESS ?? manifest.chainlinkFeed,
);
console.log("restored", result.restored);
console.log("skipped", result.skipped);
console.log("txs", result.txHashes.length);
