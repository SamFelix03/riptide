import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeploymentManifest } from "@riptide/contracts";
import { describe, expect, it } from "vitest";

import { getRiptideLens, parseManifestFile } from "../src/index.js";

const EXAMPLE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deployments/31337.example.json",
);

describe("frontend-api contracts import", () => {
  it("loads the example manifest for frontend bootstrap", () => {
    const manifest: DeploymentManifest = parseManifestFile(EXAMPLE_MANIFEST);
    expect(manifest.lens).toMatch(/^0x/);
    expect(typeof getRiptideLens).toBe("function");
  });
});
