import { describe, expect, it } from "vitest";

import type { ResolverConfig } from "../src/config.js";
import { createHealthApp } from "../src/health.js";

const baseConfig: ResolverConfig = {
  rpcUrl: "http://127.0.0.1:8545",
  chainId: 31337,
  resolverPrivateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  minProfitWad: 0n,
  pollIntervalMs: 5_000,
  priceGapBps: 100n,
  port: 8082,
};

describe("health", () => {
  it("/livez returns 200", async () => {
    const app = createHealthApp(baseConfig);
    const res = await app.request("/livez");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string };
    expect(body.service).toBe("resolver-bot");
  });

  it("/readyz returns 503 when RPC unreachable", async () => {
    const app = createHealthApp({
      ...baseConfig,
      rpcUrl: "http://127.0.0.1:1",
    });
    const res = await app.request("/readyz");
    expect(res.status).toBe(503);
  });

  it("/readyz returns 503 when subgraph is unreachable", async () => {
    const app = createHealthApp({
      ...baseConfig,
      rpcUrl: "http://127.0.0.1:1",
      subgraphUrl: "http://127.0.0.1:1/subgraphs/name/riptide",
    });
    const res = await app.request("/readyz");
    expect(res.status).toBe(503);
  });
});
