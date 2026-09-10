import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createPublicClient } from "viem";
import { foundry } from "viem/chains";

import { createRpcTransport, loadManifest } from "@riptide/contracts";
import { assertChainSeeded, checkSubgraphReachable } from "@riptide/solver-core";

import type { LiquidityMcpConfig } from "./config.js";

export function startHealthServer(config: LiquidityMcpConfig): void {
  const chain = { ...foundry, id: config.chainId };
  const client = createPublicClient({
    chain,
    transport: createRpcTransport({
      rpcUrl: config.rpcUrl,
      rpcUrlFallback: config.rpcUrlFallback,
    }),
  });

  const app = new Hono();
  app.get("/livez", (c) => c.json({ status: "ok", service: "liquidity-mcp" }));
  app.get("/readyz", async (c) => {
    try {
      const manifest = loadManifest(config.chainId);
      await client.getBlockNumber();
      await assertChainSeeded(client, manifest);
      if (config.subgraphUrl) {
        const ok = await checkSubgraphReachable(config.subgraphUrl);
        if (!ok) return c.json({ status: "not ready", reason: "subgraph unreachable" }, 503);
      }
      return c.json({ status: "ready", service: "liquidity-mcp" });
    } catch (err) {
      return c.json({ status: "not ready", reason: err instanceof Error ? err.message : String(err) }, 503);
    }
  });

  serve({ fetch: app.fetch, port: config.healthPort }, (info) => {
    console.log(`liquidity-mcp health on :${info.port}`);
  });
}
