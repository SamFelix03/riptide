import { describe, expect, it } from "vitest";

import { ANVIL_CHAIN_ID, ANVIL_RPC_URL } from "@riptide/contracts";

import { createApp } from "../src/server.js";

const HAS_RPC = process.env.RPC_URL !== undefined;

describe.skipIf(!HAS_RPC)("trust boundary", () => {
  it("route response has no signature or authorization fields", async () => {
    const app = createApp({
      rpcUrl: process.env.RPC_URL ?? ANVIL_RPC_URL,
      port: 8081,
      chainId: ANVIL_CHAIN_ID,
      maxShortlist: 8,
    });
    const res = await app.request("/v1/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        market: "RBASE-RQUOTE",
        kind: "ExactInput",
        amount: "1000000000000000000",
      }),
    });
    if (res.status !== 200) return;
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("signature");
    expect(body).not.toHaveProperty("authorization");
    expect(body).not.toHaveProperty("auth");
    expect(body.sendable).toBe(true);
  });
});
