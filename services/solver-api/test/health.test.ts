import { describe, expect, it } from "vitest";

import { createApp } from "../src/server.js";
import type { SolverConfig } from "../src/config.js";

const baseConfig: SolverConfig = {
  rpcUrl: "http://127.0.0.1:8545",
  port: 8081,
  chainId: 31337,
  maxShortlist: 8,
};

describe("health", () => {
  it("/livez returns 200", async () => {
    const app = createApp(baseConfig);
    const res = await app.request("/livez");
    expect(res.status).toBe(200);
  });

  it("/readyz returns 503 when RPC unreachable", async () => {
    const app = createApp({
      ...baseConfig,
      rpcUrl: "http://127.0.0.1:1",
    });
    const res = await app.request("/readyz");
    expect(res.status).toBe(503);
  });

  it("/readyz returns 503 when subgraph is unreachable", async () => {
    const app = createApp({
      ...baseConfig,
      rpcUrl: "http://127.0.0.1:1",
      subgraphUrl: "http://127.0.0.1:1/subgraphs/name/riptide",
    });
    const res = await app.request("/readyz");
    expect(res.status).toBe(503);
  });

  it("/metrics returns prometheus text", async () => {
    const app = createApp(baseConfig);
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("solver_requests_total");
  });
});
