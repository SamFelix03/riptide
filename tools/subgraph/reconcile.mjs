#!/usr/bin/env node
/** Compare subgraph fill/recapture aggregates with an independent Lens/RPC head. */
import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";

import { getRiptideLens, loadManifest } from "@riptide/contracts";

const chainId = Number.parseInt(process.env.CHAIN_ID ?? "31337", 10);
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const HAS_RPC = process.env.RPC_URL !== undefined;

let subgraphUrl = process.env.SUBGRAPH_URL;
let manifest;
try {
  manifest = loadManifest(chainId);
  subgraphUrl = subgraphUrl || manifest.subgraphUrl;
} catch {
  // no live manifest — skip
}

if (!subgraphUrl) {
  console.log("SUBGRAPH_URL not set — skip reconciliation");
  process.exit(0);
}

const query = `{
  _meta { block { number timestamp } }
  protocol(id: "${chainId}") { fillCount totalFillVolume totalRecapture }
}`;

const res = await fetch(subgraphUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query }),
});
const body = await res.json();
if (body.errors?.length) {
  console.error(JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

const metaBlock = body.data?._meta?.block?.number;
console.log(JSON.stringify(body.data, null, 2));

if (!HAS_RPC) {
  console.log("RPC_URL not set — skip chain-head freshness check");
  process.exit(0);
}

const client = createPublicClient({ chain: { ...foundry, id: chainId }, transport: http(RPC_URL) });
const head = await client.getBlockNumber();
console.log(`chain head: ${head}`);
console.log(`indexed block: ${metaBlock}`);
if (metaBlock !== undefined) {
  const lag = Number(head) - Number(metaBlock);
  console.log(`index lag: ${lag} blocks`);
}

if (manifest?.lens && manifest.seededStrategies?.length) {
  const lens = getRiptideLens(client, manifest.lens);
  const seeded = manifest.seededStrategies[0];
  const state = await lens.read.strategyState([
    seeded.maker,
    seeded.orderHash,
    manifest.demoTokens.base,
    manifest.demoTokens.quote,
  ]);
  console.log(`lens aquaBase=${state.aquaBase} aquaQuote=${state.aquaQuote}`);
}
