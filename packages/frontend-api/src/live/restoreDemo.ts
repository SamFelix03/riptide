import {
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  maxUint256,
  type Hash,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, foundry } from "viem/chains";
import { marketId } from "@riptide/strategy-sdk";
import fs from "node:fs";
import path from "node:path";

import {
  getRiptideLens,
  getRiptideRebalanceRouter,
  getRiptideSwapVMRouter,
  isLocalAnvil,
  riptideDemoTokenAbi,
  riptideRebalanceRouterAbi,
  riptideSwapVMRouterAbi,
  saveManifest,
  type DeploymentManifest,
  type SeededStrategy,
} from "@riptide/contracts";
import {
  buildStrategyPreset,
  encodeOrderBytes,
  isInactiveAquaStrategyError,
  isStrategyNotActiveError,
  resolveFeedAddress,
  strategyToContractTuple,
  SWAP_ORDER_PROGRAM_DEADLINE,
} from "@riptide/solver-core";

import type { RestoreDemoResult, OpenDemoAuctionsResult } from "../types.js";
import { buildSkewOracleCalldata, DEMO_ORACLE_SKEW_ANSWER } from "./encode.js";
import { redeployLocalSubgraph } from "./redeploySubgraph.js";

/** Demo mint/skew signer — Anvil #0 unless `DEPLOYER_PRIVATE_KEY` is set. */
export const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;

export const MAKER_PRIVATE_KEYS: Record<string, `0x${string}`> = {
  S1: (process.env.MAKER1_PRIVATE_KEY ??
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as `0x${string}`,
  S2: (process.env.MAKER2_PRIVATE_KEY ??
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as `0x${string}`,
  S3: (process.env.MAKER3_PRIVATE_KEY ??
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6") as `0x${string}`,
};

function repoRoot(): string {
  return (
    process.env.RIPTIDE_REPO_ROOT ||
    (fs.existsSync(path.join(process.cwd(), "deployments"))
      ? process.cwd()
      : path.resolve(process.cwd(), "../.."))
  );
}

type WalletSlot = { address?: string; privateKey: `0x${string}` };

function walletFileKeys(file: string): `0x${string}`[] {
  if (!fs.existsSync(file)) return [];
  const w = JSON.parse(fs.readFileSync(file, "utf8")) as {
    maker1?: WalletSlot;
    maker2?: WalletSlot;
    maker3?: WalletSlot;
  };
  return [w.maker1?.privateKey, w.maker2?.privateKey, w.maker3?.privateKey].filter(
    (k): k is `0x${string}` => Boolean(k),
  );
}

/** Resolve a maker key whose address matches the manifest. Never sign as a different EOA. */
function makerKeyForStrategy(chainId: number, seeded: SeededStrategy): `0x${string}` {
  const want = seeded.maker.toLowerCase();
  const candidates: `0x${string}`[] = [];
  if (!isLocalAnvil(chainId)) {
    const root = repoRoot();
    candidates.push(
      ...walletFileKeys(path.join(root, "deployments", `${chainId}.e2e-wallets.json`)),
      ...walletFileKeys(path.join(root, "deployments", `${chainId}.wallets.json`)),
    );
  }
  const envKey = MAKER_PRIVATE_KEYS[seeded.id];
  if (envKey) candidates.push(envKey);

  for (const key of candidates) {
    if (privateKeyToAccount(key).address.toLowerCase() === want) return key;
  }
  throw new Error(
    `No private key derives ${seeded.id} maker ${seeded.maker}. Seed signing must match the strategy maker.`,
  );
}

function walletChain(chainId: number) {
  if (chainId === 84532) return baseSepolia;
  return { ...foundry, id: chainId };
}

const WAD = 1_000_000_000_000_000_000n;
const SEED_REBALANCE_OUT_WAD = WAD;
const AQUA_DOCKED = 255;

const aquaAbi = [
  {
    type: "function",
    name: "ship",
    inputs: [
      { name: "router", type: "address" },
      { name: "order", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rawBalances",
    inputs: [
      { name: "maker", type: "address" },
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "token", type: "address" },
    ],
    outputs: [
      { name: "balance", type: "uint248" },
      { name: "tokensCount", type: "uint8" },
    ],
    stateMutability: "view",
  },
] as const;

function runtimeStrategyKey(maker: `0x${string}`, salt: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [maker, salt]));
}

function padSalt(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}` as `0x${string}`;
}

async function sendTx(
  client: PublicClient,
  rpcUrl: string,
  chainId: number,
  privateKey: `0x${string}`,
  to: `0x${string}`,
  data: `0x${string}`,
  expectedFrom?: `0x${string}`,
): Promise<Hash> {
  const account = privateKeyToAccount(privateKey);
  if (expectedFrom && account.address.toLowerCase() !== expectedFrom.toLowerCase()) {
    throw new Error(`Refusing to sign as ${account.address}; expected ${expectedFrom}`);
  }
  const wallet = createWalletClient({
    chain: walletChain(chainId),
    transport: http(rpcUrl),
    account,
  });
  const hash = await wallet.sendTransaction({ to, data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
  return hash;
}

async function isManifestStrategyActive(
  client: PublicClient,
  manifest: DeploymentManifest,
  seeded: SeededStrategy,
): Promise<boolean> {
  const lens = getRiptideLens(client, manifest.lens);
  try {
    const state = await lens.read.strategyState([
      seeded.maker as `0x${string}`,
      seeded.orderHash as `0x${string}`,
      manifest.demoTokens.base,
      manifest.demoTokens.quote,
    ]);
    return BigInt(state.aquaBase) > 0n && BigInt(state.aquaQuote) > 0n;
  } catch (err) {
    if (isStrategyNotActiveError(err) || isInactiveAquaStrategyError(err)) return false;
    throw err;
  }
}

async function aquaTokensCount(
  client: PublicClient,
  manifest: DeploymentManifest,
  maker: `0x${string}`,
  orderHash: `0x${string}`,
  app: `0x${string}` = manifest.swapRouter as `0x${string}`,
): Promise<number> {
  const [, tokensCount] = await client.readContract({
    address: manifest.aqua,
    abi: aquaAbi,
    functionName: "rawBalances",
    args: [maker, app, orderHash, manifest.demoTokens.base],
  });
  return Number(tokensCount);
}

async function pickRestoreSalt(
  client: PublicClient,
  manifest: DeploymentManifest,
  seeded: SeededStrategy,
  feed: `0x${string}`,
): Promise<{
  salt: `0x${string}`;
  strategyKey: `0x${string}`;
  swapOrderHash: `0x${string}`;
  swapOrderBytes: `0x${string}`;
  alreadyShipped: boolean;
}> {
  const maker = seeded.maker as `0x${string}`;
  const swapRouter = getRiptideSwapVMRouter(client, manifest.swapRouter);
  let saltBig = BigInt(seeded.salt);

  for (let attempt = 0; attempt < 32; attempt++) {
    if (attempt > 0) saltBig += 256n;
    const salt = padSalt(saltBig);
    const strategy = buildStrategyPreset(manifest, { ...seeded, salt }, feed);
    const strategyTuple = strategyToContractTuple(strategy);
    const swapOrder = await swapRouter.read.buildSwapOrder([maker, strategyTuple, SWAP_ORDER_PROGRAM_DEADLINE]);
    const swapOrderHash = (await swapRouter.read.hash([swapOrder])) as `0x${string}`;
    const swapOrderBytes = encodeOrderBytes(swapOrder);
    const tokensCount = await aquaTokensCount(client, manifest, maker, swapOrderHash);

    if (tokensCount === AQUA_DOCKED) {
      continue;
    }
    return {
      salt,
      strategyKey: runtimeStrategyKey(maker, salt),
      swapOrderHash,
      swapOrderBytes,
      alreadyShipped: tokensCount > 0,
    };
  }

  throw new Error(`Could not find an open salt for ${seeded.id}`);
}

async function restoreOneStrategy(
  client: PublicClient,
  manifest: DeploymentManifest,
  rpcUrl: string,
  chainId: number,
  feed: `0x${string}`,
  seeded: SeededStrategy,
  txHashes: Hash[],
): Promise<SeededStrategy> {
  const maker = seeded.maker as `0x${string}`;
  const makerKey = makerKeyForStrategy(chainId, seeded);

  const picked = await pickRestoreSalt(client, manifest, seeded, feed);
  const skipShip = picked.alreadyShipped;
  const strategy = buildStrategyPreset(manifest, { ...seeded, salt: picked.salt }, feed);
  const tokens = [manifest.demoTokens.base, manifest.demoTokens.quote] as const;
  const shipAmounts = [strategy.reserveBaseWad, strategy.reserveQuoteWad] as const;
  const strategyTuple = strategyToContractTuple(strategy);

  if (!skipShip) {
    const mintBase = encodeFunctionData({
      abi: riptideDemoTokenAbi,
      functionName: "mint",
      args: [maker, 1000n * WAD],
    });
    txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, manifest.demoTokens.base, mintBase));

    const mintQuote = encodeFunctionData({
      abi: riptideDemoTokenAbi,
      functionName: "mint",
      args: [maker, 2_000_000n * WAD],
    });
    txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, manifest.demoTokens.quote, mintQuote));

    const approveBase = encodeFunctionData({
      abi: riptideDemoTokenAbi,
      functionName: "approve",
      args: [manifest.aqua, maxUint256],
    });
    txHashes.push(
      await sendTx(client, rpcUrl, chainId, makerKey, manifest.demoTokens.base, approveBase, maker),
    );

    const approveQuote = encodeFunctionData({
      abi: riptideDemoTokenAbi,
      functionName: "approve",
      args: [manifest.aqua, maxUint256],
    });
    txHashes.push(
      await sendTx(client, rpcUrl, chainId, makerKey, manifest.demoTokens.quote, approveQuote, maker),
    );

    const shipSwap = encodeFunctionData({
      abi: aquaAbi,
      functionName: "ship",
      args: [manifest.swapRouter, picked.swapOrderBytes, [...tokens], [...shipAmounts]],
    });
    txHashes.push(await sendTx(client, rpcUrl, chainId, makerKey, manifest.aqua, shipSwap, maker));
  }

  const rebalanceRouter = getRiptideRebalanceRouter(client, manifest.rebalanceRouter);
  const block = await client.getBlock();
  const rebOrder = await rebalanceRouter.read.buildRebalanceOrderWithAuctionStart([
    maker,
    strategyTuple,
    SWAP_ORDER_PROGRAM_DEADLINE,
    SEED_REBALANCE_OUT_WAD,
    true,
    Number(block.timestamp),
  ]);
  const rebOrderHash = (await rebalanceRouter.read.hash([rebOrder])) as `0x${string}`;
  const rebOrderBytes = encodeOrderBytes(rebOrder);
  const rebTokensCount = await aquaTokensCount(
    client,
    manifest,
    maker,
    rebOrderHash,
    manifest.rebalanceRouter as `0x${string}`,
  );

  if (rebTokensCount === 0) {
    if (skipShip) {
      const mintBase = encodeFunctionData({
        abi: riptideDemoTokenAbi,
        functionName: "mint",
        args: [maker, 1000n * WAD],
      });
      txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, manifest.demoTokens.base, mintBase));
      const mintQuote = encodeFunctionData({
        abi: riptideDemoTokenAbi,
        functionName: "mint",
        args: [maker, 2_000_000n * WAD],
      });
      txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, manifest.demoTokens.quote, mintQuote));
      for (const token of [manifest.demoTokens.base, manifest.demoTokens.quote] as const) {
        const approve = encodeFunctionData({
          abi: riptideDemoTokenAbi,
          functionName: "approve",
          args: [manifest.aqua, maxUint256],
        });
        txHashes.push(await sendTx(client, rpcUrl, chainId, makerKey, token, approve, maker));
      }
    }
    const shipReb = encodeFunctionData({
      abi: aquaAbi,
      functionName: "ship",
      args: [manifest.rebalanceRouter, rebOrderBytes, [...tokens], [...shipAmounts]],
    });
    txHashes.push(await sendTx(client, rpcUrl, chainId, makerKey, manifest.aqua, shipReb, maker));
  }

  const registerSwap = encodeFunctionData({
    abi: riptideSwapVMRouterAbi,
    functionName: "registerStrategy",
    args: [picked.strategyKey, picked.swapOrderHash, strategyTuple, maker],
  });
  txHashes.push(await sendTx(client, rpcUrl, chainId, makerKey, manifest.swapRouter, registerSwap, maker));

  const mkt = marketId(strategy.baseToken, strategy.quoteToken);
  const registerRebSwapHash = encodeFunctionData({
    abi: riptideRebalanceRouterAbi,
    functionName: "registerStrategy",
    args: [picked.strategyKey, picked.swapOrderHash, mkt],
  });
  txHashes.push(
    await sendTx(client, rpcUrl, chainId, makerKey, manifest.rebalanceRouter, registerRebSwapHash, maker),
  );

  const registerRebRebHash = encodeFunctionData({
    abi: riptideRebalanceRouterAbi,
    functionName: "registerStrategy",
    args: [picked.strategyKey, rebOrderHash, mkt],
  });
  txHashes.push(
    await sendTx(client, rpcUrl, chainId, makerKey, manifest.rebalanceRouter, registerRebRebHash, maker),
  );

  const setAuctionStart = encodeFunctionData({
    abi: riptideRebalanceRouterAbi,
    functionName: "setRebalanceAuctionStart",
    args: [picked.strategyKey, Number(block.timestamp)],
  });
  txHashes.push(
    await sendTx(client, rpcUrl, chainId, makerKey, manifest.rebalanceRouter, setAuctionStart, maker),
  );

  return {
    id: seeded.id,
    maker: seeded.maker,
    salt: picked.salt,
    strategyKey: picked.strategyKey,
    orderHash: picked.swapOrderHash,
  };
}

async function refreshRebalanceAquaOrder(
  client: PublicClient,
  manifest: DeploymentManifest,
  rpcUrl: string,
  chainId: number,
  feed: `0x${string}`,
  seeded: SeededStrategy,
  txHashes: Hash[],
): Promise<void> {
  const makerKey = makerKeyForStrategy(chainId, seeded);
  const maker = seeded.maker as `0x${string}`;
  const strategy = buildStrategyPreset(manifest, seeded, feed);
  const strategyTuple = strategyToContractTuple(strategy);
  const strategyKey = seeded.strategyKey as `0x${string}`;
  const tokens = [manifest.demoTokens.base, manifest.demoTokens.quote] as const;
  const shipAmounts = [strategy.reserveBaseWad, strategy.reserveQuoteWad] as const;

  const mintBase = encodeFunctionData({
    abi: riptideDemoTokenAbi,
    functionName: "mint",
    args: [maker, 1000n * WAD],
  });
  txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, manifest.demoTokens.base, mintBase));

  const mintQuote = encodeFunctionData({
    abi: riptideDemoTokenAbi,
    functionName: "mint",
    args: [maker, 2_000_000n * WAD],
  });
  txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, manifest.demoTokens.quote, mintQuote));

  for (const [token] of [[manifest.demoTokens.base], [manifest.demoTokens.quote]] as const) {
    const approve = encodeFunctionData({
      abi: riptideDemoTokenAbi,
      functionName: "approve",
      args: [manifest.aqua, maxUint256],
    });
    txHashes.push(await sendTx(client, rpcUrl, chainId, makerKey, token, approve, maker));
  }

  const rebalanceRouter = getRiptideRebalanceRouter(client, manifest.rebalanceRouter);
  const block = await client.getBlock();
  const auctionStart = Number(block.timestamp);

  const rebOrder = await rebalanceRouter.read.buildRebalanceOrderWithAuctionStart([
    maker,
    strategyTuple,
    SWAP_ORDER_PROGRAM_DEADLINE,
    SEED_REBALANCE_OUT_WAD,
    true,
    auctionStart,
  ]);
  const rebOrderHash = (await rebalanceRouter.read.hash([rebOrder])) as `0x${string}`;
  const rebOrderBytes = encodeOrderBytes(rebOrder);

  const rebTokensCount = await aquaTokensCount(
    client,
    manifest,
    maker,
    rebOrderHash,
    manifest.rebalanceRouter as `0x${string}`,
  );
  if (rebTokensCount === 0) {
    const shipReb = encodeFunctionData({
      abi: aquaAbi,
      functionName: "ship",
      args: [manifest.rebalanceRouter, rebOrderBytes, [...tokens], [...shipAmounts]],
    });
    txHashes.push(await sendTx(client, rpcUrl, chainId, makerKey, manifest.aqua, shipReb, maker));

    const mkt = marketId(strategy.baseToken, strategy.quoteToken);
    const registerRebRebHash = encodeFunctionData({
      abi: riptideRebalanceRouterAbi,
      functionName: "registerStrategy",
      args: [strategyKey, rebOrderHash, mkt],
    });
    txHashes.push(
      await sendTx(client, rpcUrl, chainId, makerKey, manifest.rebalanceRouter, registerRebRebHash, maker),
    );
  }

  const setAuctionStart = encodeFunctionData({
    abi: riptideRebalanceRouterAbi,
    functionName: "setRebalanceAuctionStart",
    args: [strategyKey, auctionStart],
  });
  txHashes.push(
    await sendTx(client, rpcUrl, chainId, makerKey, manifest.rebalanceRouter, setAuctionStart, maker),
  );
}

export async function restoreDemoStrategiesLive(
  client: PublicClient,
  manifest: DeploymentManifest,
  rpcUrl: string,
  chainId: number,
  chainlinkFeed?: string,
): Promise<RestoreDemoResult> {
  if (!manifest.seededStrategies.length) {
    throw new Error("manifest has no seededStrategies — run deploy first");
  }

  const feed = await resolveFeedAddress(manifest, { envFeed: chainlinkFeed, client });
  const restored: string[] = [];
  const skipped: string[] = [];
  const txHashes: Hash[] = [];
  let manifestDirty = false;

  for (let i = 0; i < manifest.seededStrategies.length; i++) {
    const seeded = manifest.seededStrategies[i]!;
    const active = await isManifestStrategyActive(client, manifest, seeded);
    if (active) {
      skipped.push(seeded.id);
      continue;
    }

    const updated = await restoreOneStrategy(client, manifest, rpcUrl, chainId, feed, seeded, txHashes);
    manifest.seededStrategies[i] = updated;
    manifestDirty = true;
    restored.push(seeded.id);
  }

  let subgraphRedeployed = false;
  let subgraphIndexedBlock: string | undefined;

  if (manifestDirty) {
    saveManifest(manifest);
    if (isLocalAnvil(chainId)) {
      const redeploy = await redeployLocalSubgraph(chainId);
      subgraphRedeployed = true;
      subgraphIndexedBlock = redeploy.indexedBlock;
    }
  }

  if (restored.length > 0) {
    const block = await client.getBlock();
    const skewData = buildSkewOracleCalldata(DEMO_ORACLE_SKEW_ANSWER, block.timestamp);
    txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, feed, skewData));
  }

  return { restored, skipped, txHashes, subgraphRedeployed, subgraphIndexedBlock };
}

export async function openDemoAuctionsLive(
  client: PublicClient,
  manifest: DeploymentManifest,
  rpcUrl: string,
  chainId: number,
  chainlinkFeed?: string,
): Promise<OpenDemoAuctionsResult> {
  if (!manifest.seededStrategies.length) {
    throw new Error("manifest has no seededStrategies — run deploy first");
  }

  const feed = await resolveFeedAddress(manifest, { envFeed: chainlinkFeed, client });
  const txHashes: Hash[] = [];
  const auctionWindowsReset: string[] = [];

  const block = await client.getBlock();
  const skewData = buildSkewOracleCalldata(DEMO_ORACLE_SKEW_ANSWER, block.timestamp);
  txHashes.push(await sendTx(client, rpcUrl, chainId, DEPLOYER_PRIVATE_KEY, feed, skewData));

  for (const seeded of manifest.seededStrategies) {
    const active = await isManifestStrategyActive(client, manifest, seeded);
    if (!active) continue;

    await refreshRebalanceAquaOrder(client, manifest, rpcUrl, chainId, feed, seeded, txHashes);
    auctionWindowsReset.push(seeded.id);
  }

  return { auctionWindowsReset, txHashes };
}
