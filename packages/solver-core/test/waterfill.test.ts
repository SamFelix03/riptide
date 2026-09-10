import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

import { loadManifest } from "@riptide/contracts";
import { getRiptideQuoter } from "@riptide/contracts";

import { RpcDiscoveryProvider, resolveFeedAddress } from "../src/index.js";
import { optimize } from "../src/optimize.js";
import { QuoteKind } from "../src/types.js";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const HAS_RPC = process.env.RPC_URL !== undefined;

describe.skipIf(!HAS_RPC)("waterfill vs quoter", () => {
  it("matches RiptideQuoter on Anvil", async () => {
    const manifest = loadManifest(31337);
    const client = createPublicClient({ chain: foundry, transport: http(RPC_URL) });
    try {
      await resolveFeedAddress(manifest, { client });
    } catch {
      return;
    }
    const discovery = new RpcDiscoveryProvider({ manifest, client });
    let candidates;
    try {
      ({ candidates } = await discovery.listCandidates("RBASE-RQUOTE"));
    } catch {
      return;
    }
    if (candidates.length < 2) return;

    const route = optimize({
      candidates: candidates.slice(0, 2),
      kind: QuoteKind.ExactInput,
      totalAmount: 1_000_000_000_000_000_000n,
      indexedBlock: 1n,
      refreshedAt: Date.now(),
    });

    const quoter = getRiptideQuoter(client, manifest.quoter);
    for (const fill of route.fills) {
      const c = candidates.find((x) => x.id === fill.candidateId)!;
      const [amountIn, amountOut] = await quoter.read.quoteSwap([
        {
          maker: c.strategy.maker,
          baseToken: c.strategy.baseToken,
          quoteToken: c.strategy.quoteToken,
          reserveBaseWad: c.reserveBaseWad,
          reserveQuoteWad: c.reserveQuoteWad,
          fee: {
            feeMin: Number(c.strategy.fee.feeMin),
            feeMax: Number(c.strategy.fee.feeMax),
            lambda: c.strategy.fee.lambda,
            kp: c.strategy.fee.kp,
            ki: c.strategy.fee.ki,
            iMax: c.strategy.fee.iMax,
            sigmaMin: c.strategy.fee.sigmaMin,
            sigmaMax: c.strategy.fee.sigmaMax,
          },
          auction: c.strategy.auction,
          oracle: c.strategy.oracle,
          feeProvider: c.strategy.feeProvider,
          salt: c.strategy.salt,
        },
        QuoteKind.ExactInput,
        fill.amount,
      ]);
      expect(amountIn).toBe(fill.amountIn);
      const diff = amountOut > fill.amountOut ? amountOut - fill.amountOut : fill.amountOut - amountOut;
      expect(diff * 100n).toBeLessThanOrEqual(fill.amountOut);
    }
  });
});
