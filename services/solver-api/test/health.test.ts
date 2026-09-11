import { describe, expect, it } from "vitest";

import { createApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("health", () => {
  it("/livez returns 200", async () => {
    const app = createApp({ ...loadConfig(), rpcUrl: "http://127.0.0.1:8545" });
    const res = await app.request("/livez");
    expect(res.status).toBe(200);
  });

  it("/readyz returns 503 when RPC unreachable", async () => {
    const app = createApp({
      ...loadConfig(),
      rpcUrl: "http://127.0.0.1:1",
      port: 8081,
    });
    const res = await app.request("/readyz");
    expect(res.status).toBe(503);
  });
});
