import { describe, expect, it } from "vitest";

import { loadFrontendManifest } from "../src/index.js";

describe("frontend-api contracts import", () => {
  it("loads manifest for frontend bootstrap", () => {
    const manifest = loadFrontendManifest(31337);
    expect(manifest.lens).toMatch(/^0x/);
  });
});
