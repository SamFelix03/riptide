import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  deploymentManifestSchema,
  getRiptideDemoToken,
  getRiptideLens,
  getRiptideQuoter,
  getRiptideSwapVMRouter,
  loadManifest,
  loadPublicDeploymentConfig,
  resolveChainId,
  resolveRpcUrl,
  resolveSubgraphUrl,
  riptideDemoTokenAbi,
  riptideSwapVMRouterAbi,
} from "../src/index.js";

describe("@riptide/contracts smoke", () => {
  it("exports typed ABIs and manifest schema", () => {
    expect(riptideSwapVMRouterAbi.length).toBeGreaterThan(0);
    expect(riptideDemoTokenAbi.length).toBeGreaterThan(0);
    expect(deploymentManifestSchema).toBeDefined();
  });

  it("loads Anvil manifest and instantiates viem contract clients", async () => {
    const manifest = loadManifest(31337);
    expect(manifest.swapRouter).not.toEqual(manifest.rebalanceRouter);

    const client = createPublicClient({
      chain: { ...foundry, id: manifest.chainId },
      transport: http(manifest.rpcUrl),
    });

    const swapRouter = getRiptideSwapVMRouter(client, manifest.swapRouter);
    const quoter = getRiptideQuoter(client, manifest.quoter);
    const lens = getRiptideLens(client, manifest.lens);
    const demoBase = getRiptideDemoToken(client, manifest.demoTokens.base);

    expect(swapRouter.address).toBe(manifest.swapRouter);
    expect(quoter.address).toBe(manifest.quoter);
    expect(lens.address).toBe(manifest.lens);
    expect(demoBase.address).toBe(manifest.demoTokens.base);
    expect(manifest.seededStrategies).toHaveLength(3);
  });

  it("resolves product chain to Base Sepolia and loads public config from the manifest", () => {
    expect(resolveChainId({})).toBe(BASE_SEPOLIA_CHAIN_ID);
    const manifest = loadManifest(BASE_SEPOLIA_CHAIN_ID);
    const pub = loadPublicDeploymentConfig(BASE_SEPOLIA_CHAIN_ID);
    expect(pub.chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(pub.swapRouter).toBe(manifest.swapRouter);
    expect(pub.rebalanceRouter).toBe(manifest.rebalanceRouter);
    expect(pub.batchExecutor).toBe(manifest.batchExecutor);
    expect(pub.lens).toBe(manifest.lens);
    expect(pub.rpcUrl).toBe("https://sepolia.base.org");
    expect(pub.subgraphUrl).toContain("api.studio.thegraph.com");
    expect(pub.seededStrategies).toHaveLength(3);
    expect(
      resolveRpcUrl(BASE_SEPOLIA_CHAIN_ID, {
        env: { RPC_URL: "http://127.0.0.1:8545" },
        manifestRpcUrl: manifest.rpcUrl,
      }),
    ).toBe("https://sepolia.base.org");
    expect(
      resolveSubgraphUrl(BASE_SEPOLIA_CHAIN_ID, {
        env: { SUBGRAPH_URL: "http://localhost:8000/subgraphs/name/riptide/riptide-anvil" },
        manifestSubgraphUrl: manifest.subgraphUrl,
      }),
    ).toBe(manifest.subgraphUrl);
  });
});
