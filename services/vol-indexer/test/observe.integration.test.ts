import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

import { ANVIL_CHAIN_ID, ANVIL_RPC_URL, getRiptideVolatilityOracle, loadManifest } from "@riptide/contracts";
import { buildStrategyPreset, resolveFeedAddress } from "@riptide/solver-core";

import { loadConfig } from "../src/config.js";
import { observeAllStrategies, observeStrategyRaw } from "../src/observe.js";

process.env.CHAIN_ID = String(ANVIL_CHAIN_ID);

const RPC_URL = process.env.RPC_URL ?? ANVIL_RPC_URL;
const INDEXER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const BAD_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const HAS_RPC = process.env.RPC_URL !== undefined;

const WAD = 1_000_000_000_000_000_000n;

describe.skipIf(!HAS_RPC)("vol-indexer integration", () => {
  function wallet(key: `0x${string}`) {
    const chain = { ...foundry, id: 31337 };
    const account = privateKeyToAccount(key);
    return createWalletClient({ chain, transport: http(RPC_URL), account });
  }

  it("observations move sigmaWad per EWMA", async () => {
    const manifest = loadManifest(31337);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const config = { ...loadConfig(), rpcUrl: RPC_URL, governedIndexerKey: INDEXER_KEY };
    const seeded = manifest.seededStrategies[0]!;
    const strategyKey = seeded.strategyKey as `0x${string}`;
    const feed = await resolveFeedAddress(manifest, { client: publicClient });
    const strategy = buildStrategyPreset(manifest, seeded, feed);
    const oracle = getRiptideVolatilityOracle(publicClient, manifest.oracle);

    const t0 = Number((await publicClient.getBlock()).timestamp);
    await observeStrategyRaw(publicClient, wallet(INDEXER_KEY), config, strategyKey, 1_000n * WAD, t0);
    const sigma0 = await oracle.read.sigmaWad([strategyKey]);

    const t1 = t0 + 3600;
    await observeStrategyRaw(publicClient, wallet(INDEXER_KEY), config, strategyKey, 2_500n * WAD, t1);
    const sigma1 = await oracle.read.sigmaWad([strategyKey]);

    expect(sigma0).toBeGreaterThanOrEqual(strategy.fee.sigmaMin);
    expect(sigma1).toBeGreaterThanOrEqual(strategy.fee.sigmaMin);
    expect(sigma1).toBeLessThanOrEqual(strategy.fee.sigmaMax);
    expect(sigma0 !== sigma1 || sigma0 > 0n).toBe(true);
  });

  it("observeAllStrategies updates every seeded strategy", async () => {
    const manifest = loadManifest(31337);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const config = { ...loadConfig(), rpcUrl: RPC_URL, governedIndexerKey: INDEXER_KEY };
    const results = await observeAllStrategies(publicClient, wallet(INDEXER_KEY), config);
    expect(results.length).toBe(manifest.seededStrategies.length);
  });

  it("adversarial extreme price is clamped on-chain", async () => {
    const manifest = loadManifest(31337);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const config = { ...loadConfig(), rpcUrl: RPC_URL, governedIndexerKey: INDEXER_KEY };
    const seeded = manifest.seededStrategies[0]!;
    const strategyKey = seeded.strategyKey as `0x${string}`;
    const feed = await resolveFeedAddress(manifest, { client: publicClient });
    const strategy = buildStrategyPreset(manifest, seeded, feed);
    const ts = Number((await publicClient.getBlock()).timestamp);

    const sigma = await observeStrategyRaw(
      publicClient,
      wallet(INDEXER_KEY),
      config,
      strategyKey,
      (1n << 128n) - 1n,
      ts,
    );

    expect(sigma).toBeGreaterThanOrEqual(strategy.fee.sigmaMin);
    expect(sigma).toBeLessThanOrEqual(strategy.fee.sigmaMax);
  });

  it("unauthorized key reverts on observe", async () => {
    const manifest = loadManifest(31337);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const config = { ...loadConfig(), rpcUrl: RPC_URL, governedIndexerKey: BAD_KEY };
    const seeded = manifest.seededStrategies[0]!;
    const strategyKey = seeded.strategyKey as `0x${string}`;
    const ts = Number((await publicClient.getBlock()).timestamp);

    await expect(
      observeStrategyRaw(publicClient, wallet(BAD_KEY), config, strategyKey, 2_000n * WAD, ts),
    ).rejects.toThrow();
  });

  it("stale timestamp freezes sigma", async () => {
    const manifest = loadManifest(31337);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const config = { ...loadConfig(), rpcUrl: RPC_URL, governedIndexerKey: INDEXER_KEY };
    const seeded = manifest.seededStrategies[0]!;
    const strategyKey = seeded.strategyKey as `0x${string}`;
    const oracle = getRiptideVolatilityOracle(publicClient, manifest.oracle);
    const block = await publicClient.getBlock();
    const freshTs = Number(block.timestamp);

    await observeStrategyRaw(publicClient, wallet(INDEXER_KEY), config, strategyKey, 2_000n * WAD, freshTs);
    const sigmaBefore = await oracle.read.sigmaWad([strategyKey]);

    const staleTs = freshTs - 7200;
    await observeStrategyRaw(publicClient, wallet(INDEXER_KEY), config, strategyKey, 3_000n * WAD, staleTs);
    const sigmaAfter = await oracle.read.sigmaWad([strategyKey]);

    expect(sigmaAfter).toBe(sigmaBefore);
  });
});
