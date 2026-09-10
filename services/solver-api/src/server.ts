import { fileURLToPath } from "node:url";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createPublicClient } from "viem";
import { foundry } from "viem/chains";

import { createRpcTransport, loadManifest } from "@riptide/contracts";
import { assertChainSeeded, checkSubgraphReachable } from "@riptide/solver-core";

import { loadConfig } from "./config.js";
import { handleQuote } from "./handlers/quote.js";
import { handleRoute } from "./handlers/route.js";
import { renderPrometheus } from "./metrics.js";

export function createApp(config = loadConfig()) {
  const client = createPublicClient({
    chain: { ...foundry, id: config.chainId },
    transport: createRpcTransport({
      rpcUrl: config.rpcUrl,
      rpcUrlFallback: config.rpcUrlFallback,
    }),
  });

  const app = new Hono();

  app.get("/livez", (c) => c.json({ status: "ok" }));

  app.get("/readyz", async (c) => {
    try {
      const manifest = loadManifest(config.chainId);
      await client.getBlockNumber();
      await assertChainSeeded(client, manifest);
      if (config.subgraphUrl) {
        const ok = await checkSubgraphReachable(config.subgraphUrl);
        if (!ok) {
          return c.json({ status: "not ready", reason: "subgraph unreachable" }, 503);
        }
      }
      return c.json({ status: "ready" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ status: "not ready", reason: message }, 503);
    }
  });

  app.get("/metrics", (c) => c.text(renderPrometheus()));

  app.post("/v1/quote", async (c) => {
    try {
      const body = await c.req.json();
      const result = await handleQuote(config, client, body);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/v1/route", async (c) => {
    try {
      const body = await c.req.json();
      const result = await handleRoute(config, client, body);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  return app;
}

export function startServer(config = loadConfig()) {
  const app = createApp(config);
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`solver-api listening on :${info.port}`);
  });
  return app;
}

const isEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntry) {
  startServer();
}
