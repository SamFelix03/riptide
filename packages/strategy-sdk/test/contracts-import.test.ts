import type { DeploymentManifest } from "@riptide/contracts";
import { getRiptideSwapVMRouter, loadManifest } from "@riptide/contracts";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

describe("strategy-sdk contracts import", () => {
  it("imports DeploymentManifest and a contract getter", async () => {
    const manifest: DeploymentManifest = loadManifest(31337);
    const client = createPublicClient({
      chain: { ...foundry, id: manifest.chainId },
      transport: http(manifest.rpcUrl),
    });
    const router = getRiptideSwapVMRouter(client, manifest.swapRouter);
    expect(router.address).toBe(manifest.swapRouter);
  });
});
