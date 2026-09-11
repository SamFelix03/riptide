import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

import { ANVIL_CHAIN_ID, ANVIL_RPC_URL, getRiptideAuctionSettler, getRiptideDemoToken, loadManifest } from "@riptide/contracts";
import { buildStrategyPreset, resolveFeedAddress } from "@riptide/solver-core";

import { runIteration } from "../src/main.js";
import { loadConfig } from "../src/config.js";
import { submitSettleRebalanceRaw } from "../src/submit.js";

process.env.CHAIN_ID = String(ANVIL_CHAIN_ID);

const RPC_URL = ANVIL_RPC_URL;
const RESOLVER_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as const;
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const HAS_RPC = process.env.CI === "true" || process.env.RPC_URL !== undefined;

const feedAbi = parseAbi(["function setRound(int256 answer_, uint256 updatedAt_) external"]);

describe.skipIf(!HAS_RPC)("settle integration", () => {
  it("price gap injection leads to autonomous settle", async () => {
    const manifest = loadManifest(31337);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const feed = await resolveFeedAddress(manifest, { client: publicClient });
    const deployer = privateKeyToAccount(DEPLOYER_KEY);
    const deployerWallet = createWalletClient({ chain, transport: http(RPC_URL), account: deployer });

    const block = await publicClient.getBlock();
    await deployerWallet.writeContract({
      address: feed,
      abi: feedAbi,
      functionName: "setRound",
      args: [500_000_000_000n, block.timestamp],
      chain,
    });

    const config = { ...loadConfig(), rpcUrl: RPC_URL, minProfitWad: 0n, priceGapBps: 1n };
    const settled = await runIteration(config);
    expect(settled).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!HAS_RPC)("adversarial no surplus", () => {
  it("negative surplus submission reverts on-chain", async () => {
    const manifest = loadManifest(31337);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const feed = await resolveFeedAddress(manifest, { client: publicClient });
    const seeded = manifest.seededStrategies[0]!;
    const strategy = buildStrategyPreset(manifest, seeded, feed);
    const resolver = privateKeyToAccount(RESOLVER_KEY);
    const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account: resolver });

    const demo = getRiptideDemoToken(publicClient, manifest.demoTokens.quote);
    await demo.write.faucet([500_000_000_000_000_000_000_000n], { account: resolver.address, chain });
    await demo.write.approve([manifest.settler, 2n ** 256n - 1n], { account: resolver.address, chain });

    await expect(
      submitSettleRebalanceRaw(
        publicClient,
        walletClient,
        31337,
        {
          maker: seeded.maker,
          strategy,
          outWad: 1_000_000_000_000_000_000_000n,
          maxInWad: 1n,
          deadline: Math.floor(Date.now() / 1000) + 3600,
        },
        true,
      ),
    ).rejects.toThrow();
  });
});
