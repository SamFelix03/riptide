#!/usr/bin/env node
/**
 * Re-open the rebalance auction window for every seeded strategy.
 *
 * A strategy's auction window is `auctionStart + duration`, and `auctionStart` is baked
 * into the rebalance order bytes AND stored on the router — the two must agree or the
 * order hash will not resolve. So "re-opening" means re-shipping the rebalance leg with a
 * fresh start and updating storage to match. Skewing the price alone does nothing once
 * the window has closed.
 *
 * Idempotent and safe to re-run before a demo. Touches only the rebalance leg; the swap
 * strategy, its Aqua inventory and all history are untouched.
 *
 *   CHAIN_ID=84532 RPC_URL=https://sepolia.base.org node tools/demo/reopen-auctions.mjs
 *
 * Maker keys come from deployments/<chainId>.e2e-wallets.json (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createPublicClient, createWalletClient, http, encodeAbiParameters, keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(root, ".env") });

const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID ?? "84532", 10);
const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";

const manifest = JSON.parse(fs.readFileSync(path.join(root, "deployments", `${CHAIN_ID}.json`), "utf8"));
const walletsPath = path.join(root, "deployments", `${CHAIN_ID}.e2e-wallets.json`);
if (!fs.existsSync(walletsPath)) {
  console.error(`Missing ${walletsPath}. Run tools/demo/testnet-e2e.mjs first to generate demo wallets.`);
  process.exit(1);
}
const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf8"));

function abiOf(name) {
  const src = fs.readFileSync(path.join(root, "packages/contracts/src/abis", `${name}.ts`), "utf8");
  return JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
}
const rebalanceAbi = abiOf("RiptideRebalanceRouter");
const aquaAbi = [
  {
    type: "function",
    name: "ship",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "nonpayable",
  },
];

const chain = { id: CHAIN_ID, name: `chain-${CHAIN_ID}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } };
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

const SWAP_DEADLINE = 2n ** 40n - 1n;
const SEED_OUT_WAD = 10n ** 18n;

/** Rebuild the exact strategy tuple the routers expect, from the seeded presets. */
function presetFor(id, maker) {
  const p = {
    S1: { feeMin: 10_000, feeMax: 50_000, lambda: 990000000000000000n, kp: 100000000000000000n, ki: 50000000000000000n, iMax: 500000000000000000n, sigmaMin: 5000000000000000n, sigmaMax: 500000000000000000n, beta: 970000000000000000n, duration: 7200, decay: 995000000000000000n, anti: 600 },
    S2: { feeMin: 30_000, feeMax: 500_000, lambda: 100000000000000000n, kp: 500000000000000000n, ki: 100000000000000000n, iMax: 1000000000000000000n, sigmaMin: 10000000000000000n, sigmaMax: 1000000000000000000n, beta: 950000000000000000n, duration: 3600, decay: 990000000000000000n, anti: 300 },
    S3: { feeMin: 50_000, feeMax: 800_000, lambda: 850000000000000000n, kp: 800000000000000000n, ki: 200000000000000000n, iMax: 2000000000000000000n, sigmaMin: 20000000000000000n, sigmaMax: 2000000000000000000n, beta: 900000000000000000n, duration: 1800, decay: 980000000000000000n, anti: 120 },
  }[id];
  if (!p) throw new Error(`unknown preset ${id}`);
  return p;
}

function tupleFor(id, maker, salt) {
  const p = presetFor(id, maker);
  return {
    maker,
    baseToken: manifest.demoTokens.base,
    quoteToken: manifest.demoTokens.quote,
    reserveBaseWad: 100n * 10n ** 18n,
    reserveQuoteWad: 200_000n * 10n ** 18n,
    fee: { feeMin: p.feeMin, feeMax: p.feeMax, lambda: p.lambda, kp: p.kp, ki: p.ki, iMax: p.iMax, sigmaMin: p.sigmaMin, sigmaMax: p.sigmaMax },
    auction: { beta: p.beta, duration: p.duration, decay: p.decay, antiSandwichPeriod: p.anti },
    oracle: { feed: manifest.chainlinkFeed, decimals: 8, maxStaleness: 3600 },
    feeProvider: manifest.feeProvider,
    salt,
  };
}

function makerKeyFor(addr) {
  for (const k of ["maker1", "maker2", "maker3"]) {
    if (wallets[k]?.address?.toLowerCase() === addr.toLowerCase()) return wallets[k].privateKey;
  }
  throw new Error(`no key for maker ${addr}`);
}

const marketId = keccak256(
  encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "address" }],
    [keccak256(stringToBytes("RIPTIDE.marketId.v1")), manifest.demoTokens.base, manifest.demoTokens.quote],
  ),
);

async function send(wallet, req, label) {
  const { request } = await publicClient.simulateContract({ ...req, account: wallet.account });
  const hash = await wallet.writeContract(request);
  const rec = await publicClient.waitForTransactionReceipt({ hash });
  if (rec.status !== "success") throw new Error(`${label} reverted`);
  console.log(`  ok ${label}`);
}

const resolver = manifest.demoResolver;

for (const seeded of manifest.seededStrategies) {
  const { id, maker, salt, strategyKey } = seeded;
  const start = Number((await publicClient.getBlock()).timestamp);
  const tuple = tupleFor(id, maker, salt);

  const open = Number(await publicClient.readContract({
    address: manifest.rebalanceRouter, abi: rebalanceAbi, functionName: "rebalanceAuctionStart", args: [strategyKey],
  }));
  const stillOpen = start <= open + tuple.auction.duration;
  console.log(`${id}: auctionStart=${open} ${stillOpen ? "(still open — refreshing anyway)" : "(expired)"}`);

  const wallet = createWalletClient({ account: privateKeyToAccount(makerKeyFor(maker)), chain, transport: http(RPC_URL) });

  const rebOrder = await publicClient.readContract({
    address: manifest.rebalanceRouter, abi: rebalanceAbi,
    functionName: "buildRebalanceOrderWithAuctionStart",
    args: [maker, tuple, SWAP_DEADLINE, SEED_OUT_WAD, resolver, true, start],
  });
  const rebHash = await publicClient.readContract({
    address: manifest.rebalanceRouter, abi: rebalanceAbi, functionName: "hash", args: [rebOrder],
  });

  const { encodeAbiParameters: enc } = await import("viem");
  const encodedOrder = enc(
    [{ type: "tuple", components: [{ name: "maker", type: "address" }, { name: "traits", type: "uint256" }, { name: "data", type: "bytes" }] }],
    [{ maker: rebOrder.maker, traits: rebOrder.traits, data: rebOrder.data }],
  );

  await send(wallet, {
    address: manifest.aqua, abi: aquaAbi, functionName: "ship",
    args: [manifest.rebalanceRouter, encodedOrder, [manifest.demoTokens.base, manifest.demoTokens.quote], [100n * 10n ** 18n, 200_000n * 10n ** 18n]],
  }, `${id} ship rebalance leg`);

  await send(wallet, {
    address: manifest.rebalanceRouter, abi: rebalanceAbi, functionName: "registerStrategy",
    args: [strategyKey, rebHash, marketId],
  }, `${id} register reb-hash`);

  await send(wallet, {
    address: manifest.rebalanceRouter, abi: rebalanceAbi, functionName: "setRebalanceAuctionStart",
    args: [strategyKey, start],
  }, `${id} setRebalanceAuctionStart=${start}`);
}

console.log("\nAuctions re-opened. Skew the feed (Resolve → Demo tools) to create surplus, then refresh.");
