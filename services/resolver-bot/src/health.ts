import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createPublicClient } from "viem";
import { foundry } from "viem/chains";

import { createRpcTransport, loadManifest } from "@riptide/contracts";
import { assertChainSeeded, checkSubgraphReachable } from "@riptide/solver-core";

import type { ResolverConfig } from "./config.js";

export function createHealthApp(config: ResolverConfig): Hono {
  const chain = { ...foundry, id: config.chainId };
  const client = createPublicClient({
    chain,
    transport: createRpcTransport({
      rpcUrl: config.rpcUrl,
      rpcUrlFallback: config.rpcUrlFallback,
    }),
  });

  const app = new Hono();
  app.get("/livez", (c) => c.json({ status: "ok", service: "resolver-bot" }));
  app.get("/readyz", async (c) => {
    try {
      const manifest = loadManifest(config.chainId);
      await client.getBlockNumber();
      await assertChainSeeded(client, manifest);
      if (config.subgraphUrl) {
        const ok = await checkSubgraphReachable(config.subgraphUrl);
        if (!ok) return c.json({ status: "not ready", reason: "subgraph unreachable" }, 503);
      }
      return c.json({ status: "ready", service: "resolver-bot" });
    } catch (err) {
      return c.json({ status: "not ready", reason: err instanceof Error ? err.message : String(err) }, 503);
    }
  });
  return app;
}

export function startHealthServer(config: ResolverConfig): void {
  const app = createHealthApp(config);
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`resolver-bot health on :${info.port}`);
  });
}
