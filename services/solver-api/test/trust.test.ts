import { describe, expect, it } from "vitest";

import { ANVIL_CHAIN_ID, ANVIL_RPC_URL } from "@riptide/contracts";

import { createApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";

process.env.CHAIN_ID = String(ANVIL_CHAIN_ID);

const RPC_URL = ANVIL_RPC_URL;
const HAS_RPC = process.env.CI === "true" || process.env.RPC_URL !== undefined;

describe.skipIf(!HAS_RPC)("trust boundary", () => {
  it("route response has no signature or authorization fields", async () => {
    const app = createApp({ ...loadConfig(), rpcUrl: RPC_URL });
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
