import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createPublicClient } from "viem";
import { foundry } from "viem/chains";

import { createRpcTransport, loadManifest } from "@riptide/contracts";
import { assertChainSeeded } from "@riptide/solver-core";

import type { VolIndexerConfig } from "./config.js";

export function createHealthApp(config: VolIndexerConfig): Hono {
  const chain = { ...foundry, id: config.chainId };
  const client = createPublicClient({
    chain,
    transport: createRpcTransport({
      rpcUrl: config.rpcUrl,
      rpcUrlFallback: config.rpcUrlFallback,
    }),
  });

  const app = new Hono();
  app.get("/livez", (c) => c.json({ status: "ok", service: "vol-indexer" }));
  app.get("/readyz", async (c) => {
    try {
      const manifest = loadManifest(config.chainId);
      await client.getBlockNumber();
      await assertChainSeeded(client, manifest);
      return c.json({ status: "ready", service: "vol-indexer" });
    } catch (err) {
      return c.json({ status: "not ready", reason: err instanceof Error ? err.message : String(err) }, 503);
    }
  });
  return app;
}

export function startHealthServer(config: VolIndexerConfig): void {
  const app = createHealthApp(config);
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`vol-indexer health on :${info.port}`);
  });
}
