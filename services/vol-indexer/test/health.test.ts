import { describe, expect, it } from "vitest";

import type { VolIndexerConfig } from "../src/config.js";
import { createHealthApp } from "../src/health.js";

const baseConfig: VolIndexerConfig = {
  rpcUrl: "http://127.0.0.1:8545",
  chainId: 31337,
  governedIndexerKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  pollIntervalMs: 60_000,
  port: 8083,
};

describe("health", () => {
  it("/livez returns 200", async () => {
    const app = createHealthApp(baseConfig);
    const res = await app.request("/livez");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string };
    expect(body.service).toBe("vol-indexer");
  });

  it("/readyz returns 503 when RPC unreachable", async () => {
    const app = createHealthApp({
      ...baseConfig,
      rpcUrl: "http://127.0.0.1:1",
    });
    const res = await app.request("/readyz");
    expect(res.status).toBe(503);
  });
});
