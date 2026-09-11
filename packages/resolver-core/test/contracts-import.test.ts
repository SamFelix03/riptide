import { describe, expect, it } from "vitest";

import { loadResolverManifest } from "../src/index.js";

describe("resolver-core contracts import", () => {
  it("loads manifest and settler getter symbol", () => {
    const manifest = loadResolverManifest(31337);
    expect(manifest.settler).toMatch(/^0x/);
  });
});
