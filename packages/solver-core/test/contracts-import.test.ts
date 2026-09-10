import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeploymentManifest } from "@riptide/contracts";
import { describe, expect, it } from "vitest";

import { getRiptideLens, parseManifestFile } from "../src/index.js";

const EXAMPLE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deployments/31337.example.json",
);

describe("solver-core contracts import", () => {
  it("loads the example manifest without any", () => {
    const manifest: DeploymentManifest = parseManifestFile(EXAMPLE_MANIFEST);
    expect(manifest.chainId).toBe(31337);
    expect(typeof getRiptideLens).toBe("function");
  });
});
