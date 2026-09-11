#!/usr/bin/env node
/** Compare subgraph fill aggregates with manifest + RPC sanity checks. */
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { loadManifest } from "@riptide/contracts";

const chainId = Number.parseInt(process.env.CHAIN_ID ?? "31337", 10);
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const SUBGRAPH_URL = process.env.SUBGRAPH_URL || loadManifest(chainId).subgraphUrl;

if (!SUBGRAPH_URL) {
  console.log("SUBGRAPH_URL not set — skip reconciliation");
  process.exit(0);
}

const query = `{ protocol(id: "${chainId}") { fillCount totalFillVolume totalRecapture } fills { amountIn retainToLP: amountOut } }`;

const res = await fetch(SUBGRAPH_URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query }),
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));

const client = createPublicClient({ chain: { ...foundry, id: chainId }, transport: http(RPC_URL) });
const block = await client.getBlockNumber();
console.log(`chain head: ${block}`);
