#!/usr/bin/env node
/**
 * Skew the demo Chainlink feed so Resolve shows open rebalancing auctions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chainId = Number.parseInt(process.env.CHAIN_ID ?? "31337", 10);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const deployerKey =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const skewAnswer = BigInt(process.env.DEMO_ORACLE_SKEW ?? "500000000000");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "deployments", `${chainId}.json`), "utf8"),
);
const feed = manifest.chainlinkFeed;
if (!feed) {
  console.error("manifest missing chainlinkFeed");
  process.exit(1);
}

const chain = { ...foundry, id: chainId };
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain, transport });
const account = privateKeyToAccount(deployerKey);
const wallet = createWalletClient({ chain, transport, account });

const block = await publicClient.getBlock();
const hash = await wallet.writeContract({
  address: feed,
  abi: parseAbi(["function setRound(int256 answer_, uint256 updatedAt_) external"]),
  functionName: "setRound",
  args: [skewAnswer, block.timestamp],
  chain,
});

console.log(`Oracle skewed: feed=${feed} answer=${skewAnswer} tx=${hash}`);
