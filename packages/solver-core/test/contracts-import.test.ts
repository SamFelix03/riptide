import { describe, expect, it } from "vitest";

import { loadSolverManifest } from "../src/manifest.js";

describe("solver-core contracts import", () => {
  it("loads manifest without any", () => {
    const manifest = loadSolverManifest(31337);
    expect(manifest.chainId).toBe(31337);
  });
});
