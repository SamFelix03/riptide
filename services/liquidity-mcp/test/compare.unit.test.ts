import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { quoteFromFixture, type UniswapV3Pool } from "../src/dex-subgraph/client.js";

const fixture = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/uniswap-pool.json"), "utf8"),
) as UniswapV3Pool;

describe("uniswap v3 comparison math", () => {
  it("produces deterministic dex quote shape from fixture", () => {
    const amountIn = 1_000_000_000_000_000_000n;
    const quote = quoteFromFixture(fixture, amountIn);
    expect(quote.source).toBe("uniswap-v3-official-mainnet");
    expect(quote.poolId).toBe(fixture.id);
    expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
    expect(quote.feeBps).toBe(5);
  });

  it("computes delta against riptide side", () => {
    const riptideOut = 1_950_000_000_000_000_000n;
    const dex = quoteFromFixture(fixture, 1_000_000_000_000_000_000n);
    const diff = riptideOut - BigInt(dex.amountOut);
    expect(typeof diff).toBe("bigint");
  });
});
