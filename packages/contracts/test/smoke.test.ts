import path from "node:path";
import { fileURLToPath } from "node:url";

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
  parseManifestFile,
  resolveChainId,
  resolveRpcUrl,
  resolveSubgraphUrl,
  riptideDemoTokenAbi,
  riptideErrorsAbi,
  riptideSwapVMRouterAbi,
} from "../src/index.js";

const EXAMPLE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deployments/31337.example.json",
);

describe("@riptide/contracts smoke", () => {
  it("exports typed ABIs and manifest schema", () => {
    expect(riptideSwapVMRouterAbi.length).toBeGreaterThan(0);
    expect(riptideDemoTokenAbi.length).toBeGreaterThan(0);
    expect(riptideErrorsAbi.length).toBeGreaterThan(0);
    expect(deploymentManifestSchema).toBeDefined();
  });

  it("parses the Anvil example fixture and instantiates viem contract clients", () => {
    const manifest = parseManifestFile(EXAMPLE_MANIFEST);
    expect(manifest.chainId).toBe(31337);
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
  });

  it("resolves product chain to Base Sepolia and ignores loopback RPC on public chains", () => {
    expect(resolveChainId({})).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(
      resolveRpcUrl(BASE_SEPOLIA_CHAIN_ID, {
        env: { RPC_URL: "http://127.0.0.1:8545" },
        manifestRpcUrl: "https://sepolia.base.org",
      }),
    ).toBe("https://sepolia.base.org");
    expect(
      resolveSubgraphUrl(BASE_SEPOLIA_CHAIN_ID, {
        env: { SUBGRAPH_URL: "http://localhost:8000/subgraphs/name/riptide/riptide-anvil" },
        manifestSubgraphUrl: "https://api.studio.thegraph.com/query/riptide",
      }),
    ).toBe("https://api.studio.thegraph.com/query/riptide");
  });
});
