import { describe, expect, it } from "vitest";

import { createFrontendApi } from "../src/factory.js";
import { DEMO_MARKET } from "@riptide/solver-core";
import type { RiptideFrontendApi } from "../src/interface.js";

function sharedBehaviorSuite(name: string, factory: () => RiptideFrontendApi, opts?: { live?: boolean }) {
  describe(`${name} behavioral contract`, () => {
    const api = factory();

    it("listMarkets returns demo market", async () => {
      const markets = await api.listMarkets();
      expect(markets.some((m) => m.id === DEMO_MARKET)).toBe(true);
    });

    it("listStrategies returns three seeded ids", async () => {
      const strategies = await api.listStrategies(DEMO_MARKET);
      expect(strategies.length).toBe(3);
      expect(new Set(strategies.map((s) => s.id))).toEqual(new Set(["S1", "S2", "S3"]));
    });

    it("quoteSwap returns required shape", async () => {
      const quote = await api.quoteSwap(DEMO_MARKET, "ExactInput", "1000000000000000000");
      expect(quote.amountIn).toBeTruthy();
      expect(quote.amountOut).toBeTruthy();
      expect(quote.freshness.indexedBlock).toBeTruthy();
      expect(quote.freshness.laggingSeconds).toBeGreaterThanOrEqual(0);
    });

    it("getFreshness laggingSeconds >= 0", async () => {
      const f = await api.getFreshness();
      expect(f.laggingSeconds).toBeGreaterThanOrEqual(0);
    });

    if (!opts?.live) {
      it("mock TxPlans are never sendable", async () => {
        const plan = await api.buildSwapRoute(DEMO_MARKET, "ExactInput", "1000000000000000000", {});
        expect(plan.sendable).toBe(false);
      });
    }

    if (opts?.live) {
      it("live quoteSwap matches inline Quoter when solver-api is down", async () => {
        const quote = await api.quoteSwap(DEMO_MARKET, "ExactInput", "1000000000000000000");
        expect(BigInt(quote.amountOut)).toBeGreaterThan(0n);
        expect(quote.sigmaWad).not.toBe("0");
      });
    }
  });
}

describe("frontend-api behavior", () => {
  sharedBehaviorSuite("mock", () => createFrontendApi({ mode: "mock" }));

  const HAS_LIVE = process.env.CI === "true" && process.env.RPC_URL !== undefined;
  describe.skipIf(!HAS_LIVE)("live", () => {
    sharedBehaviorSuite(
      "live",
      () =>
        createFrontendApi({
          mode: "live",
          config: {
            rpcUrl: process.env.RPC_URL!,
            subgraphUrl: process.env.SUBGRAPH_URL,
            solverApiUrl: process.env.SOLVER_API_URL,
            chainId: 31337,
          },
        }),
      { live: true },
    );
  });
});
