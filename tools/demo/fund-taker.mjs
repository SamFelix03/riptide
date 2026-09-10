#!/usr/bin/env node
/**
 * Fund the demo taker with quote tokens + BatchExecutor allowance.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, maxUint256, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chainId = Number.parseInt(process.env.CHAIN_ID ?? "31337", 10);
if (chainId !== 31337) {
  console.error("fund-taker.mjs is Anvil-only. On testnet, mint RQUOTE from the connected wallet.");
  process.exit(1);
}
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const takerKey =
  process.env.TAKER_PRIVATE_KEY ??
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";
const deployerKey =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const mintAmount = 10_000_000_000_000_000_000_000n; // 10_000e18

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "deployments", `${chainId}.json`), "utf8"),
);

const chain = { ...foundry, id: chainId };
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain, transport });
const taker = privateKeyToAccount(takerKey);
const deployer = privateKeyToAccount(deployerKey);
const takerWallet = createWalletClient({ chain, transport, account: taker });
const deployerWallet = createWalletClient({ chain, transport, account: deployer });

const demoTokenAbi = parseAbi([
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const quote = manifest.demoTokens.quote;
const batchExecutor = manifest.batchExecutor;
const settler = manifest.settler;

await deployerWallet.writeContract({
  address: quote,
  abi: demoTokenAbi,
  functionName: "mint",
  args: [taker.address, mintAmount],
  chain,
});

await takerWallet.writeContract({
  address: quote,
  abi: demoTokenAbi,
  functionName: "approve",
  args: [batchExecutor, maxUint256],
  chain,
});

await takerWallet.writeContract({
  address: quote,
  abi: demoTokenAbi,
  functionName: "approve",
  args: [settler, maxUint256],
  chain,
});

const [balance, batchAllowance, settlerAllowance] = await Promise.all([
  publicClient.readContract({
    address: quote,
    abi: demoTokenAbi,
    functionName: "balanceOf",
    args: [taker.address],
  }),
  publicClient.readContract({
    address: quote,
    abi: demoTokenAbi,
    functionName: "allowance",
    args: [taker.address, batchExecutor],
  }),
  publicClient.readContract({
    address: quote,
    abi: demoTokenAbi,
    functionName: "allowance",
    args: [taker.address, settler],
  }),
]);

console.log(
  `Demo taker/resolver funded: ${taker.address} quoteBalance=${balance} batchAllowance=${batchAllowance} settlerAllowance=${settlerAllowance}`,
);
