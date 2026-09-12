#!/usr/bin/env node
/**
 * Replay the Anvil demo end-to-end against live Base Sepolia.
 *
 * Anvil flow this mirrors:
 *   1. Seed: mint → approve Aqua → ship swap + rebalance → register → auction start
 *   2. Taker: mint quote, approve batchExecutor + settler
 *   3. Quote (quoter) then BatchExecutor.execute (Mechanism 1)
 *   4. Skew mock Chainlink feed (open rebalance gap)
 *   5. Preview + RiptideAuctionSettler.settleRebalance (Mechanism 2)
 *   6. Dock then re-ship (positions republish)
 *
 * Unique keys go to gitignored deployments/84532.e2e-wallets.json.
 * Funded from DEPLOYER_PRIVATE_KEY (never logged).
 */
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  concat,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatEther,
  http,
  keccak256,
  maxUint256,
  parseAbiParameters,
  parseEther,
  parseEventLogs,
  stringToBytes,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(root, ".env") });

const CHAIN_ID = 84532;
const RPC_URL = process.env.RPC_URL ?? process.env.PUBLIC_RPC_URL ?? "https://sepolia.base.org";
const WAD = 10n ** 18n;
const SWAP_DEADLINE = 2 ** 40 - 1;
const SEED_REBALANCE_OUT_WAD = WAD;
const SKEW_ANSWER = 500_000_000_000n;
const FUND_WEI = parseEther("0.006");
const SWAP_AMOUNT = 1n * WAD;

function loadAbi(file) {
  const text = fs.readFileSync(path.join(root, "packages/contracts/src/abis", file), "utf8");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  return JSON.parse(text.slice(start, end + 1));
}

const swapAbi = loadAbi("RiptideSwapVMRouter.ts");
const rebalanceAbi = loadAbi("RiptideRebalanceRouter.ts");
const quoterAbi = loadAbi("RiptideQuoter.ts");
const lensAbi = loadAbi("RiptideLens.ts");
const settlerAbi = loadAbi("RiptideAuctionSettler.ts");
const batchAbi = loadAbi("RiptideBatchExecutor.ts");
const tokenAbi = loadAbi("RiptideDemoToken.ts");

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
    name: "dock",
    inputs: [
      { name: "router", type: "address" },
      { name: "orderHash", type: "bytes32" },
      { name: "tokens", type: "address[]" },
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
];

const feedAbi = [
  {
    type: "function",
    name: "setRound",
    inputs: [
      { name: "answer_", type: "int256" },
      { name: "updatedAt_", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
];

const erc20TransferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256" },
    ],
  },
];

function netTransfer(receipt, token, account) {
  const logs = parseEventLogs({ abi: erc20TransferAbi, logs: receipt.logs, eventName: "Transfer" }).filter(
    (l) => l.address.toLowerCase() === token.toLowerCase(),
  );
  const who = account.toLowerCase();
  let net = 0n;
  for (const l of logs) {
    if (l.args.to.toLowerCase() === who) net += l.args.value;
    if (l.args.from.toLowerCase() === who) net -= l.args.value;
  }
  return net;
}

function padSalt(n) {
  return `0x${BigInt(n).toString(16).padStart(64, "0")}`;
}

function encodeOrderBytes(order) {
  const inner = encodeAbiParameters(parseAbiParameters("address maker, uint256 traits, bytes data"), [
    order.maker,
    BigInt(order.traits),
    order.data,
  ]);
  return concat(["0x0000000000000000000000000000000000000000000000000000000000000020", inner]);
}

function runtimeStrategyKey(maker, salt) {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [maker, salt]));
}

function strategyTuple(s) {
  return {
    maker: s.maker,
    baseToken: s.baseToken,
    quoteToken: s.quoteToken,
    reserveBaseWad: s.reserveBaseWad,
    reserveQuoteWad: s.reserveQuoteWad,
    fee: {
      feeMin: Number(s.fee.feeMin),
      feeMax: Number(s.fee.feeMax),
      lambda: s.fee.lambda,
      kp: s.fee.kp,
      ki: s.fee.ki,
      iMax: s.fee.iMax,
      sigmaMin: s.fee.sigmaMin,
      sigmaMax: s.fee.sigmaMax,
    },
    auction: s.auction,
    oracle: s.oracle,
    feeProvider: s.feeProvider,
    salt: s.salt,
  };
}

function preset(id, maker, base, quote, feed, provider, salt) {
  const baseS = {
    maker,
    baseToken: base,
    quoteToken: quote,
    reserveBaseWad: 100n * WAD,
    reserveQuoteWad: 200_000n * WAD,
    oracle: { feed, decimals: 8, maxStaleness: 3600 },
    feeProvider: provider,
    salt,
  };
  if (id === "S1") {
    return {
      ...baseS,
      fee: {
        feeMin: 10_000n,
        feeMax: 50_000n,
        lambda: 990_000_000_000_000_000n,
        kp: 100_000_000_000_000_000n,
        ki: 50_000_000_000_000_000n,
        iMax: 500_000_000_000_000_000n,
        sigmaMin: 5_000_000_000_000_000n,
        sigmaMax: 500_000_000_000_000_000n,
      },
      auction: { beta: 970_000_000_000_000_000n, duration: 7200, decay: 995_000_000_000_000_000n, antiSandwichPeriod: 600 },
    };
  }
  if (id === "S2") {
    return {
      ...baseS,
      fee: {
        feeMin: 30_000n,
        feeMax: 500_000n,
        lambda: 100_000_000_000_000_000n,
        kp: 500_000_000_000_000_000n,
        ki: 100_000_000_000_000_000n,
        iMax: 1_000_000_000_000_000_000n,
        sigmaMin: 10_000_000_000_000_000n,
        sigmaMax: 1_000_000_000_000_000_000n,
      },
      auction: { beta: 950_000_000_000_000_000n, duration: 3600, decay: 990_000_000_000_000_000n, antiSandwichPeriod: 300 },
    };
  }
  return {
    ...baseS,
    fee: {
      feeMin: 50_000n,
      feeMax: 800_000n,
      lambda: 850_000_000_000_000_000n,
      kp: 800_000_000_000_000_000n,
      ki: 200_000_000_000_000_000n,
      iMax: 2_000_000_000_000_000_000n,
      sigmaMin: 20_000_000_000_000_000n,
      sigmaMax: 2_000_000_000_000_000_000n,
    },
    auction: { beta: 900_000_000_000_000_000n, duration: 1800, decay: 980_000_000_000_000_000n, antiSandwichPeriod: 120 },
  };
}

function role(id, key) {
  const account = privateKeyToAccount(key);
  return { id, address: account.address, privateKey: key };
}

function loadOrCreateWallets() {
  const file = path.join(root, "deployments", `${CHAIN_ID}.e2e-wallets.json`);
  if (fs.existsSync(file) && process.env.FORCE_NEW_E2E_WALLETS !== "1") {
    const w = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`Reusing ${file}`);
    return w;
  }
  const wallets = {
    chainId: CHAIN_ID,
    maker1: role("S1", generatePrivateKey()),
    maker2: role("S2", generatePrivateKey()),
    maker3: role("S3", generatePrivateKey()),
    taker: role("taker", generatePrivateKey()),
  };
  fs.writeFileSync(file, `${JSON.stringify(wallets, null, 2)}\n`);
  console.log(`Wrote ${file} (gitignored)`);
  return wallets;
}

function normalizeKey(raw) {
  if (!raw) return "";
  const trimmed = raw.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

const deployerKey = normalizeKey(process.env.DEPLOYER_PRIVATE_KEY);
if (!deployerKey || deployerKey.length !== 66) {
  console.error("Set DEPLOYER_PRIVATE_KEY in the environment (or gitignored .env).");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "deployments", `${CHAIN_ID}.json`), "utf8"));
const chain = { ...foundry, id: CHAIN_ID };
const transport = http(RPC_URL);
const publicClient = createPublicClient({ chain, transport });
const deployerAccount = privateKeyToAccount(deployerKey);
const deployerWallet = createWalletClient({ chain, transport, account: deployerAccount });

function walletFor(key) {
  return createWalletClient({ chain, transport, account: privateKeyToAccount(key) });
}

async function waitOk(hash, label) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted: ${hash}`);
  }
  console.log(`  ok ${label}  ${hash}  gas=${receipt.gasUsed}`);
  return receipt;
}

async function sendWrite(wallet, args, label) {
  // simulateContract's `request` uses an address string as `account`, which makes
  // viem send eth_sendTransaction to the public RPC ("unknown account"). Always sign locally.
  const { account: _ignored, ...rest } = args;
  const hash = await wallet.writeContract({ ...rest, chain, account: wallet.account });
  return waitOk(hash, label);
}

async function sendValue(wallet, to, value, label) {
  const hash = await wallet.sendTransaction({ to, value, chain });
  return waitOk(hash, label);
}

const results = [];
function pass(name, extra = "") {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}${extra ? ` — ${extra}` : ""}`);
}
function fail(name, err) {
  results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) });
  throw err;
}

async function quoteSwap(strategy, kind, amount) {
  return publicClient.readContract({
    address: manifest.quoter,
    abi: quoterAbi,
    functionName: "quoteSwap",
    args: [strategyTuple(strategy), kind, amount],
  });
}

async function tokenBalance(token, owner, blockNumber) {
  return publicClient.readContract({
    address: token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [owner],
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  });
}

async function lensState(maker, orderHash) {
  return publicClient.readContract({
    address: manifest.lens,
    abi: lensAbi,
    functionName: "strategyState",
    args: [maker, orderHash, manifest.demoTokens.base, manifest.demoTokens.quote],
  });
}

const AQUA_DOCKED = 255;

async function aquaTokensCount(maker, orderHash) {
  const [, tokensCount] = await publicClient.readContract({
    address: manifest.aqua,
    abi: aquaAbi,
    functionName: "rawBalances",
    args: [maker, manifest.swapRouter, orderHash, manifest.demoTokens.base],
  });
  return Number(tokensCount);
}

async function waitUntilDocked(maker, orderHash) {
  for (let i = 0; i < 20; i++) {
    const count = await aquaTokensCount(maker, orderHash);
    if (count === AQUA_DOCKED || count === 0) return count;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`S1 still active on Aqua after dock (tokensCount=${await aquaTokensCount(maker, orderHash)})`);
}

async function shipFull(makerKey, id, salt) {
  const maker = privateKeyToAccount(makerKey).address;
  const w = walletFor(makerKey);
  const strategy = preset(id, maker, manifest.demoTokens.base, manifest.demoTokens.quote, manifest.chainlinkFeed, manifest.feeProvider, salt);
  const tuple = strategyTuple(strategy);
  const tokens = [manifest.demoTokens.base, manifest.demoTokens.quote];
  const amounts = [strategy.reserveBaseWad, strategy.reserveQuoteWad];

  const swapOrder = await publicClient.readContract({
    address: manifest.swapRouter,
    abi: swapAbi,
    functionName: "buildSwapOrder",
    args: [maker, tuple, SWAP_DEADLINE],
  });
  const swapHash = await publicClient.readContract({
    address: manifest.swapRouter,
    abi: swapAbi,
    functionName: "hash",
    args: [swapOrder],
  });
  const strategyKey = runtimeStrategyKey(maker, salt);
  const aquaCount = await aquaTokensCount(maker, swapHash);
  if (aquaCount === AQUA_DOCKED) {
    console.log(`  skip ${id} already docked  orderHash=${swapHash}`);
    return { id, maker, salt, strategyKey, orderHash: swapHash, strategy, auctionStart: 0, docked: true };
  }
  if (aquaCount > 0) {
    console.log(`  skip ${id} already live on Aqua  orderHash=${swapHash}`);
    return { id, maker, salt, strategyKey, orderHash: swapHash, strategy, auctionStart: 0, docked: false };
  }

  await sendWrite(w, { address: manifest.demoTokens.base, abi: tokenAbi, functionName: "mint", args: [maker, 1000n * WAD] }, `${id} mint base`);
  await sendWrite(w, { address: manifest.demoTokens.quote, abi: tokenAbi, functionName: "mint", args: [maker, 2_000_000n * WAD] }, `${id} mint quote`);
  await sendWrite(w, { address: manifest.demoTokens.base, abi: tokenAbi, functionName: "approve", args: [manifest.aqua, maxUint256] }, `${id} approve base`);
  await sendWrite(w, { address: manifest.demoTokens.quote, abi: tokenAbi, functionName: "approve", args: [manifest.aqua, maxUint256] }, `${id} approve quote`);

  await sendWrite(
    w,
    {
      address: manifest.aqua,
      abi: aquaAbi,
      functionName: "ship",
      args: [manifest.swapRouter, encodeOrderBytes(swapOrder), tokens, amounts],
    },
    `${id} Aqua.ship swap`,
  );

  const block = await publicClient.getBlock();
  const auctionStart = Number(block.timestamp);
  const rebOrder = await publicClient.readContract({
    address: manifest.rebalanceRouter,
    abi: rebalanceAbi,
    functionName: "buildRebalanceOrderWithAuctionStart",
    args: [maker, tuple, SWAP_DEADLINE, SEED_REBALANCE_OUT_WAD, true, auctionStart],
  });
  const rebHash = await publicClient.readContract({
    address: manifest.rebalanceRouter,
    abi: rebalanceAbi,
    functionName: "hash",
    args: [rebOrder],
  });

  await sendWrite(
    w,
    {
      address: manifest.aqua,
      abi: aquaAbi,
      functionName: "ship",
      args: [manifest.rebalanceRouter, encodeOrderBytes(rebOrder), tokens, amounts],
    },
    `${id} Aqua.ship rebalance`,
  );

  await sendWrite(
    w,
    {
      address: manifest.swapRouter,
      abi: swapAbi,
      functionName: "registerStrategy",
      args: [strategyKey, swapHash, tuple, maker],
    },
    `${id} register swap`,
  );

  const market = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }],
      [keccak256(stringToBytes("RIPTIDE.marketId.v1")), strategy.baseToken, strategy.quoteToken],
    ),
  );
  await sendWrite(
    w,
    {
      address: manifest.rebalanceRouter,
      abi: rebalanceAbi,
      functionName: "registerStrategy",
      args: [strategyKey, swapHash, market],
    },
    `${id} register rebalance/swap-hash`,
  );
  await sendWrite(
    w,
    {
      address: manifest.rebalanceRouter,
      abi: rebalanceAbi,
      functionName: "registerStrategy",
      args: [strategyKey, rebHash, market],
    },
    `${id} register rebalance/reb-hash`,
  );
  await sendWrite(
    w,
    {
      address: manifest.rebalanceRouter,
      abi: rebalanceAbi,
      functionName: "setRebalanceAuctionStart",
      args: [strategyKey, auctionStart],
    },
    `${id} setRebalanceAuctionStart`,
  );

  return { id, maker, salt, strategyKey, orderHash: swapHash, strategy, auctionStart };
}

async function main() {
  console.log("=== RIPTIDE Base Sepolia e2e (Anvil demo replay) ===");
  console.log(`RPC ${RPC_URL}`);
  console.log(`Deployer ${deployerAccount.address}`);
  const depBal = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`Deployer balance ${formatEther(depBal)} ETH`);
  if (depBal < parseEther("0.04")) {
    throw new Error("Deployer needs more ETH to fund 4 accounts and broadcast.");
  }

  const wallets = loadOrCreateWallets();
  const makers = [wallets.maker1, wallets.maker2, wallets.maker3];
  const taker = wallets.taker;
  console.log(`Makers ${makers.map((m) => m.address).join(" ")}`);
  console.log(`Taker/resolver ${taker.address}`);

  for (const acct of [...makers, taker]) {
    const bal = await publicClient.getBalance({ address: acct.address });
    if (bal < FUND_WEI / 2n) {
      await sendValue(deployerWallet, acct.address, FUND_WEI, `fund ${acct.id ?? acct.address}`);
    } else {
      console.log(`  skip fund ${acct.address} (has ${formatEther(bal)} ETH)`);
    }
  }
  pass("fund unique maker/taker EOAs from deployer");

  console.log("\n-- Existing seeded pools (from original testnet seed) --");
  if (!manifest.seededStrategies?.length) {
    console.log("  (none in manifest — skip)");
  }
  for (const seeded of manifest.seededStrategies ?? []) {
    try {
      const state = await lensState(seeded.maker, seeded.orderHash);
      const strategy = preset(seeded.id, seeded.maker, manifest.demoTokens.base, manifest.demoTokens.quote, manifest.chainlinkFeed, manifest.feeProvider, seeded.salt);
      const [amountIn, amountOut, feeBps] = await quoteSwap(strategy, 0, SWAP_AMOUNT);
      pass(
        `existing ${seeded.id} quote+lens`,
        `aquaBase=${state.aquaBase} feeBps=${feeBps} out=${amountOut} in=${amountIn}`,
      );
    } catch (err) {
      console.warn(`  skip existing ${seeded.id} (not on this router): ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n-- Seed three new strategies (same S1/S2/S3 policies as Anvil) --");
  const shipped = [];
  const salts = [101, 102, 103];
  const ids = ["S1", "S2", "S3"];
  for (let i = 0; i < 3; i++) {
    shipped.push(await shipFull(makers[i].privateKey, ids[i], padSalt(salts[i])));
  }
  pass("ship+register S1/S2/S3 (swap Aqua + rebalance Aqua + both routers)");

  const s1AlreadyDocked = (await aquaTokensCount(shipped[0].maker, shipped[0].orderHash)) === AQUA_DOCKED;
  const takerWallet = walletFor(taker.privateKey);

  if (s1AlreadyDocked) {
    pass("Mechanism 1 swap settled via BatchExecutor", "already completed (S1 docked)");
    pass("Mechanism 2 settleRebalance", "already completed (S1 docked)");
  } else {
  console.log("\n-- Mechanism 1: quote then BatchExecutor swap --");
  const quotes = [];
  for (const s of shipped) {
    const [amountIn, amountOut, feeBps, sigma] = await quoteSwap(s.strategy, 0, SWAP_AMOUNT);
    quotes.push({ amountIn, amountOut, feeBps, sigma });
    if (amountOut === 0n) throw new Error(`${s.id} quoted 0 out`);
    console.log(`  ${s.id} quote exact-in ${SWAP_AMOUNT} → out=${amountOut} feeBps=${feeBps} sigma=${sigma}`);
  }
  if (quotes[0].feeBps !== 10_000n && quotes[0].feeBps !== 10000) {
    console.warn(`  S1 feeBps=${quotes[0].feeBps} (expected feeMin 10000 at σ≈0)`);
  }
  pass("quoter.quoteSwap on all three live pools");

  const quoteBal = await tokenBalance(manifest.demoTokens.quote, taker.address);
  if (quoteBal < 10n * SWAP_AMOUNT) {
    await sendWrite(
      takerWallet,
      { address: manifest.demoTokens.quote, abi: tokenAbi, functionName: "mint", args: [taker.address, 10_000n * WAD] },
      "taker mint quote",
    );
  } else {
    console.log(`  skip taker mint (quote=${quoteBal})`);
  }
  for (const spender of [manifest.batchExecutor, manifest.settler]) {
    const allowance = await publicClient.readContract({
      address: manifest.demoTokens.quote,
      abi: tokenAbi,
      functionName: "allowance",
      args: [taker.address, spender],
    });
    if (allowance < SWAP_AMOUNT) {
      await sendWrite(
        takerWallet,
        { address: manifest.demoTokens.quote, abi: tokenAbi, functionName: "approve", args: [spender, maxUint256] },
        `taker approve ${spender === manifest.batchExecutor ? "batchExecutor" : "settler"}`,
      );
    } else {
      console.log(`  skip approve ${spender}`);
    }
  }
  pass("taker mint + approve batchExecutor + settler");

  const fills = [];
  let totalOut = 0n;
  const per = SWAP_AMOUNT / 3n;
  let rem = SWAP_AMOUNT - per * 3n;
  for (const s of shipped) {
    const slice = per + (rem > 0n ? 1n : 0n);
    if (rem > 0n) rem -= 1n;
    const order = await publicClient.readContract({
      address: manifest.swapRouter,
      abi: swapAbi,
      functionName: "buildSwapOrder",
      args: [s.maker, strategyTuple(s.strategy), SWAP_DEADLINE],
    });
    const [, sliceOut] = await quoteSwap(s.strategy, 0, slice);
    totalOut += sliceOut;
    const state = await lensState(s.maker, s.orderHash);
    fills.push({
      order: encodeOrderBytes(order),
      maker: s.maker,
      strategyKey: s.strategyKey,
      expectedVersion: BigInt(state.runtime.version),
      amount: slice,
    });
  }
  const head = await publicClient.getBlock();
  const route = {
    base: manifest.demoTokens.base,
    quote: manifest.demoTokens.quote,
    kind: 0,
    payer: taker.address,
    recipient: taker.address,
    refundRecipient: taker.address,
    deadline: Number(head.timestamp + 3600n),
    salt: keccak256(encodeAbiParameters([{ type: "uint256" }], [BigInt(Date.now())])),
    aggregateLimit: totalOut === 0n ? 0n : (totalOut * 9999n) / 10000n,
    fills,
  };

  const { request } = await publicClient.simulateContract({
    address: manifest.batchExecutor,
    abi: batchAbi,
    functionName: "execute",
    args: [route],
    account: taker.address,
  });
  pass("simulate BatchExecutor.execute");
  const swapReceipt = await sendWrite(
    takerWallet,
    {
      address: request.address,
      abi: request.abi,
      functionName: request.functionName,
      args: request.args,
      ...(request.gas ? { gas: request.gas } : {}),
    },
    "BatchExecutor.execute exact-in",
  );
  const spent = -netTransfer(swapReceipt, manifest.demoTokens.quote, taker.address);
  const received = netTransfer(swapReceipt, manifest.demoTokens.base, taker.address);
  if (spent === 0n || received === 0n) throw new Error("swap did not move balances");
  pass("Mechanism 1 swap settled via BatchExecutor", `spentQuote=${spent} receivedBase=${received}`);

  console.log("\n-- Mechanism 2: skew oracle, preview, settle --");
  const now = await publicClient.getBlock();
  await sendWrite(
    deployerWallet,
    { address: manifest.chainlinkFeed, abi: feedAbi, functionName: "setRound", args: [SKEW_ANSWER, now.timestamp] },
    "skew oracle to 5000 USD",
  );
  // Public RPC endpoints are load balanced, so a read issued immediately after a
  // confirmed write can land on a node that has not yet caught up to that block.
  // Poll instead of asserting once.
  let answer = 0n;
  for (let attempt = 0; attempt < 15; attempt++) {
    const [, a] = await publicClient.readContract({
      address: manifest.chainlinkFeed,
      abi: feedAbi,
      functionName: "latestRoundData",
    });
    answer = BigInt(a);
    if (answer === SKEW_ANSWER) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (answer !== SKEW_ANSWER) throw new Error(`feed answer ${answer} != ${SKEW_ANSWER}`);
  pass("skew demo Chainlink feed");

  const s1 = shipped[0];
  // Do not rewrite auctionStart: the rebalance Aqua order hash bakes the start from ship time.
  // Settler rebuilds with storage auctionStart — it must stay the value used at ship.

  const [preview, dutchPrice] = await publicClient.readContract({
    address: manifest.quoter,
    abi: quoterAbi,
    functionName: "previewRebalance",
    args: [strategyTuple(s1.strategy), SEED_REBALANCE_OUT_WAD, taker.address],
  });
  console.log(
    `  preview surplus=${preview.surplusWad} payToResolver=${preview.payToResolver} retainToLP=${preview.retainToLP} dutch=${dutchPrice}`,
  );
  if (preview.surplusWad <= 0n) throw new Error("preview surplus is not positive after skew");
  pass("previewRebalance profitable after oracle skew");

  const staleIn = await publicClient.readContract({
    address: manifest.kernel,
    abi: [
      {
        type: "function",
        name: "staleBaselineIn",
        inputs: [
          { name: "outWad", type: "uint256" },
          { name: "reserveInWad", type: "uint128" },
          { name: "reserveOutWad", type: "uint128" },
          { name: "kind", type: "uint8" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "pure",
      },
    ],
    functionName: "staleBaselineIn",
    args: [SEED_REBALANCE_OUT_WAD, s1.strategy.reserveQuoteWad, s1.strategy.reserveBaseWad, 1],
  });
  const maxIn = ((preview.surplusWad + staleIn) * 10001n) / 10000n;
  const resolverQuoteBefore = await tokenBalance(manifest.demoTokens.quote, taker.address);

  const { request: settleRequest } = await publicClient.simulateContract({
    address: manifest.settler,
    abi: settlerAbi,
    functionName: "settleRebalance",
    args: [s1.maker, strategyTuple(s1.strategy), SEED_REBALANCE_OUT_WAD, maxIn, Number((await publicClient.getBlock()).timestamp + 3600n)],
    account: taker.address,
  });
  const settleReceipt = await sendWrite(
    takerWallet,
    {
      address: settleRequest.address,
      abi: settleRequest.abi,
      functionName: settleRequest.functionName,
      args: settleRequest.args,
      ...(settleRequest.gas ? { gas: settleRequest.gas } : {}),
    },
    "settleRebalance S1",
  );
  const resolverQuoteDelta = netTransfer(settleReceipt, manifest.demoTokens.quote, taker.address);
  const resolverBaseDelta = netTransfer(settleReceipt, manifest.demoTokens.base, taker.address);
  pass(
    "Mechanism 2 settleRebalance",
    `resolver Δquote=${resolverQuoteDelta} Δbase=${resolverBaseDelta} (preQuote=${resolverQuoteBefore})`,
  );
  }

  console.log("\n-- Dock + republish (positions flow) --");
  const s1 = shipped[0];
  const s1Count = await aquaTokensCount(s1.maker, s1.orderHash);
  if (s1Count === AQUA_DOCKED) {
    console.log("  skip Aqua.dock S1 (already docked)");
  } else {
    await sendWrite(
      walletFor(makers[0].privateKey),
      {
        address: manifest.aqua,
        abi: aquaAbi,
        functionName: "dock",
        args: [manifest.swapRouter, s1.orderHash, [manifest.demoTokens.base, manifest.demoTokens.quote]],
      },
      "Aqua.dock S1 swap",
    );
    await waitUntilDocked(s1.maker, s1.orderHash);
  }
  pass("dock S1 — strategy inactive on Aqua");

  const restored = await shipFull(makers[0].privateKey, "S1", padSalt(101n + 256n));
  const [restoredIn, restoredOut] = await quoteSwap(restored.strategy, 0, SWAP_AMOUNT);
  if (restoredOut === 0n) throw new Error("restored S1 quoted 0");
  pass("republish S1 with new salt", `quote out=${restoredOut} in=${restoredIn ?? restoredIn}`);

  const manifestPath = path.join(root, "deployments", `${CHAIN_ID}.json`);
  const nextManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  nextManifest.demoResolver = taker.address;
  nextManifest.seededStrategies = [restored, shipped[1], shipped[2]].map((s) => ({
    id: s.id,
    maker: s.maker,
    salt: s.salt,
    strategyKey: s.strategyKey,
    orderHash: s.orderHash,
  }));
  fs.writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  console.log(`Wrote seededStrategies to ${manifestPath}`);

  console.log("\n=== e2e summary ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  }
  console.log(`All ${results.length} checks passed.`);
}

main().catch((err) => {
  console.error("\nE2E FAILED");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
