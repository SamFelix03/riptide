import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeploymentManifest } from "@riptide/contracts";
import { describe, expect, it } from "vitest";

import { getRiptideAuctionSettler, parseManifestFile } from "../src/index.js";

const EXAMPLE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deployments/31337.example.json",
);

describe("resolver-core contracts import", () => {
  it("loads the example manifest and settler getter", () => {
    const manifest: DeploymentManifest = parseManifestFile(EXAMPLE_MANIFEST);
    expect(manifest.settler).toMatch(/^0x/);
    expect(typeof getRiptideAuctionSettler).toBe("function");
  });
});
