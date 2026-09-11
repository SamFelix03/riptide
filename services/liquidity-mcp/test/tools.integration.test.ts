import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

import { ANVIL_CHAIN_ID, ANVIL_RPC_URL, getRiptideQuoter, loadManifest } from "@riptide/contracts";
import {
  DEMO_MARKET,
  QuoteKind,
  assertChainSeeded,
  createDiscoveryProvider,
  strategyToContractTuple,
} from "@riptide/solver-core";

import { loadConfig } from "../src/config.js";
import {
  compareLiquidityVsDex,
  getRiptideExecutableLiquidity,
  getRiptideRecaptureStats,
} from "../src/tools.js";

process.env.CHAIN_ID = String(ANVIL_CHAIN_ID);

const RPC_URL = ANVIL_RPC_URL;
const SUBGRAPH_URL = process.env.SUBGRAPH_URL;
const HAS_INTEGRATION = process.env.CI === "true" && SUBGRAPH_URL !== undefined;

describe.skipIf(!HAS_INTEGRATION)("liquidity-mcp integration", () => {
  const config = { ...loadConfig(), rpcUrl: RPC_URL, subgraphUrl: SUBGRAPH_URL! };
  const chain = { ...foundry, id: config.chainId };
  const client = createPublicClient({ chain, transport: http(RPC_URL) });
  const manifest = loadManifest(config.chainId);
  const amount = 1_000_000_000_000_000_000n;

  it("get_riptide_executable_liquidity matches Quoter aggregate", async () => {
    await assertChainSeeded(client, manifest);
    const discovery = createDiscoveryProvider({ manifest, client, subgraphUrl: config.subgraphUrl });
    const { candidates } = await discovery.listCandidates(DEMO_MARKET);
    const quoter = getRiptideQuoter(client, manifest.quoter);

    let expectedOut = 0n;
    const per = candidates.length > 0 ? amount / BigInt(candidates.length) : amount;
    let remainder = amount - per * BigInt(Math.max(candidates.length, 1));

    for (const c of candidates) {
      const slice = per + (remainder > 0n ? 1n : 0n);
      if (remainder > 0n) remainder -= 1n;
      if (slice === 0n) continue;
      const [, out] = await quoter.read.quoteSwap([
        strategyToContractTuple({
          ...c.strategy,
          reserveBaseWad: c.reserveBaseWad,
          reserveQuoteWad: c.reserveQuoteWad,
        }),
        QuoteKind.ExactInput,
        slice,
      ]);
      expectedOut += BigInt(out);
    }

    const result = await getRiptideExecutableLiquidity(config, DEMO_MARKET, "ExactInput", amount);
    expect(BigInt(result.amountOut)).toBe(expectedOut);
  });

  it("get_riptide_recapture_stats returns protocol data", async () => {
    const stats = await getRiptideRecaptureStats(config);
    expect(stats.indexedBlock).toBeGreaterThan(0);
    expect(stats.perMarket.length).toBeGreaterThan(0);
  });

  it("compare_liquidity_vs_dex riptide branch matches tool 1", async () => {
    const direct = await getRiptideExecutableLiquidity(config, DEMO_MARKET, "ExactInput", amount);
    const compared = await compareLiquidityVsDex(config, DEMO_MARKET, "ExactInput", amount);
    expect(compared.riptide.amountOut).toBe(direct.amountOut);
    if (!process.env.GRAPH_API_KEY) {
      expect(compared.dex).toBeNull();
      expect(compared.reason).toContain("GRAPH_API_KEY");
    }
  });

  it.skipIf(!process.env.GRAPH_API_KEY)("compare_liquidity_vs_dex returns Uniswap V3 pool data", async () => {
    const compared = await compareLiquidityVsDex(config, DEMO_MARKET, "ExactInput", amount);
    expect(compared.dex).not.toBeNull();
    expect(compared.dex!.source).toBe("uniswap-v3-official-mainnet");
    expect(compared.dex!.poolId).toMatch(/^0x/i);
    expect(BigInt(compared.dex!.amountOut)).toBeGreaterThan(0n);
    expect(compared.delta).not.toBeNull();
    expect(compared.dexSource).toBe("uniswap-v3-official-mainnet");
  });
});
