import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeploymentManifest } from "@riptide/contracts";
import { getRiptideSwapVMRouter, parseManifestFile } from "@riptide/contracts";
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

const EXAMPLE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deployments/31337.example.json",
);

describe("strategy-sdk contracts import", () => {
  it("imports DeploymentManifest and a contract getter", () => {
    const manifest: DeploymentManifest = parseManifestFile(EXAMPLE_MANIFEST);
    const client = createPublicClient({
      chain: { ...foundry, id: manifest.chainId },
      transport: http(manifest.rpcUrl),
    });
    const router = getRiptideSwapVMRouter(client, manifest.swapRouter);
    expect(router.address).toBe(manifest.swapRouter);
  });
});
