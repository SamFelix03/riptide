import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

import { loadManifest } from "@riptide/contracts";

import { RpcDiscoveryProvider, SubgraphDiscoveryProvider } from "../src/discovery.js";
import { DEMO_MARKET } from "../src/presets.js";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const SUBGRAPH_URL = process.env.SUBGRAPH_URL;
const HAS_RPC = process.env.CI === "true" || process.env.RPC_URL !== undefined;
const HAS_SUBGRAPH = Boolean(SUBGRAPH_URL);

describe.skipIf(!HAS_RPC)("discovery parity", () => {
  it("RPC discovery returns seeded strategies on Anvil", async () => {
    const manifest = loadManifest(31337);
    const client = createPublicClient({ chain: { ...foundry, id: 31337 }, transport: http(RPC_URL) });
    const rpc = new RpcDiscoveryProvider({ manifest, client });
    const { candidates } = await rpc.listCandidates(DEMO_MARKET);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates[0]!.strategyKey).toMatch(/^0x/);
  });
});

describe.skipIf(!HAS_RPC || !HAS_SUBGRAPH)("subgraph vs rpc parity", () => {
  it("SubgraphDiscoveryProvider matches RpcDiscoveryProvider candidates", async () => {
    const manifest = loadManifest(31337);
    const client = createPublicClient({ chain: { ...foundry, id: 31337 }, transport: http(RPC_URL) });
    const rpc = new RpcDiscoveryProvider({ manifest, client });
    const sub = new SubgraphDiscoveryProvider({ subgraphUrl: SUBGRAPH_URL!, manifest, client });

    const rpcResult = await rpc.listCandidates(DEMO_MARKET);
    const subResult = await sub.listCandidates(DEMO_MARKET);

    expect(subResult.freshness.source).toBe("subgraph");
    expect(subResult.candidates.map((c) => c.id).sort()).toEqual(rpcResult.candidates.map((c) => c.id).sort());

    for (const id of rpcResult.candidates.map((c) => c.id)) {
      const a = rpcResult.candidates.find((c) => c.id === id)!;
      const b = subResult.candidates.find((c) => c.id === id)!;
      expect(b.strategyKey).toBe(a.strategyKey);
      expect(b.orderHash).toBe(a.orderHash);
      expect(b.reserveBaseWad).toBe(a.reserveBaseWad);
      expect(b.reserveQuoteWad).toBe(a.reserveQuoteWad);
    }
  });
});
