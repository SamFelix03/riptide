import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeploymentManifest } from "@riptide/contracts";
import { parseManifestFile } from "@riptide/contracts";
import { describe, expect, it } from "vitest";

import { createFrontendApi } from "../src/factory.js";

const EXAMPLE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deployments/31337.example.json",
);

describe("frontend-api contracts import", () => {
  it("loads the example manifest for frontend bootstrap", () => {
    const manifest: DeploymentManifest = parseManifestFile(EXAMPLE_MANIFEST);
    expect(manifest.lens).toMatch(/^0x/);
  });
});

describe("frontend-api mock factory", () => {
  it("creates a mock implementation without a live manifest", async () => {
    const api = createFrontendApi({ mode: "mock" });
    const markets = await api.listMarkets();
    expect(markets.length).toBeGreaterThan(0);
  });
});
