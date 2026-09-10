import { describe, expect, it } from "vitest";

import { graphGatewaySubgraphUrl, loadConfig } from "../src/config.js";
import { queryDexPoolQuote } from "../src/dex-subgraph/client.js";

describe.skipIf(!process.env.GRAPH_API_KEY)("Uniswap V3 gateway live", () => {
  it("returns WETH/USDC pool quote via The Graph", async () => {
    const config = loadConfig();
    const url = graphGatewaySubgraphUrl(config.graphApiKey!, config.dexSubgraphId);
    const quote = await queryDexPoolQuote(url, 1_000_000_000_000_000_000n, config.dexPoolId);
    expect(quote.source).toBe("uniswap-v3-official-mainnet");
    expect(quote.poolId).toMatch(/^0x/i);
    expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
    expect(quote.feeBps).toBeGreaterThan(0);
    expect(Number.parseFloat(quote.tvlUsd)).toBeGreaterThan(0);
  });
});
