import { describe, expect, it } from "vitest";

import { detectStaleCertificate } from "../src/certificate.js";
import { optimize, verifyOptimizedRoute } from "../src/optimize.js";
import { QuoteKind, type StrategyCandidate } from "../src/types.js";

const WAD = 1_000_000_000_000_000_000n;

function candidate(id: string, reserveQuote: bigint, reserveBase: bigint, feeBps: number, aquaQuote: bigint): StrategyCandidate {
  return {
    id,
    strategy: {
      maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      baseToken: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
      quoteToken: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
      reserveBaseWad: 100n * WAD,
      reserveQuoteWad: 200_000n * WAD,
      fee: {
        feeMin: 10_000n,
        feeMax: 50_000n,
        lambda: 990_000_000_000_000_000n,
        kp: 100_000_000_000_000_000n,
        ki: 50_000_000_000_000_000n,
        iMax: 500_000_000_000_000_000n,
        sigmaMin: 5_000_000_000_000_000n,
        sigmaMax: 500_000_000_000_000_000n,
      },
      auction: { beta: 970_000_000_000_000_000n, duration: 7200, decay: 995_000_000_000_000_000n, antiSandwichPeriod: 600 },
      oracle: { feed: "0x0000000000000000000000000000000000000001", decimals: 8, maxStaleness: 3600 },
      feeProvider: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
      salt: "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
    strategyKey: "0x3c8e904cdb19937d60d41c8d984b1a8803ad6e0891b4f9e032dcec2a22c2c7f5",
    orderHash: "0xac9ade18ec201802d1a81534f92ce4ac2674057aeeeafc6844a8e8d7bf1ac99a",
    reserveBaseWad: reserveBase,
    reserveQuoteWad: reserveQuote,
    feeBps,
    sigmaWad: 50_000_000_000_000_000n,
    aquaBase: reserveBase,
    aquaQuote,
    swapVersion: 0n,
  };
}

describe("optimize", () => {
  it("splits exact-in across two strategies", () => {
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, 200_000n * WAD);
    const c2 = candidate("S2", 200_000n * WAD, 100n * WAD, 30_000, 200_000n * WAD);
    const route = optimize({
      candidates: [c1, c2],
      kind: QuoteKind.ExactInput,
      totalAmount: 1500n * WAD,
      indexedBlock: 1n,
      refreshedAt: Date.now(),
    });
    expect(route.fills.length).toBe(2);
    expect(route.totalAmountIn).toBe(1500n * WAD);
    verifyOptimizedRoute(route, [c1, c2]);
  });

  it("respects per-strategy liquidity caps", () => {
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, 500n * WAD);
    expect(() =>
      optimize({
        candidates: [c1],
        kind: QuoteKind.ExactInput,
        totalAmount: 1000n * WAD,
        indexedBlock: 1n,
        refreshedAt: Date.now(),
      }),
    ).toThrow("insufficient liquidity");
  });
});

describe("optimize exact-output", () => {
  // Regression: the selection loop used to seed its comparison with
  // Number.MAX_SAFE_INTEGER (~9.0e15, below one WAD). Real wei-denominated marginals
  // exceeded it immediately, so no candidate was ever selected and the loop broke
  // early WITHOUT error, delivering only 1 - (3/4)^n of the request.
  it("delivers the full requested output across multiple candidates", () => {
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, 200_000n * WAD);
    const c2 = candidate("S2", 200_000n * WAD, 100n * WAD, 30_000, 200_000n * WAD);
    const c3 = candidate("S3", 200_000n * WAD, 100n * WAD, 50_000, 200_000n * WAD);

    for (const requested of [WAD / 10n, WAD, 10n * WAD]) {
      const route = optimize({
        candidates: [c1, c2, c3],
        kind: QuoteKind.ExactOutput,
        totalAmount: requested,
        indexedBlock: 1n,
        refreshedAt: Date.now(),
      });
      const delivered = route.fills.reduce((a, f) => a + f.amountOut, 0n);
      expect(delivered).toBe(requested);
      expect(route.totalAmountOut).toBe(requested);
    }
  });

  it("delivers the full output for a single candidate", () => {
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, 200_000n * WAD);
    const route = optimize({
      candidates: [c1],
      kind: QuoteKind.ExactOutput,
      totalAmount: WAD,
      indexedBlock: 1n,
      refreshedAt: Date.now(),
    });
    expect(route.totalAmountOut).toBe(WAD);
  });

  it("prefers the cheaper candidate when fees differ", () => {
    const cheap = candidate("CHEAP", 200_000n * WAD, 100n * WAD, 10_000, 200_000n * WAD);
    const dear = candidate("DEAR", 200_000n * WAD, 100n * WAD, 500_000, 200_000n * WAD);
    const route = optimize({
      candidates: [cheap, dear],
      kind: QuoteKind.ExactOutput,
      totalAmount: WAD,
      indexedBlock: 1n,
      refreshedAt: Date.now(),
    });
    const cheapFill = route.fills.find((f) => f.candidateId === "CHEAP");
    const dearFill = route.fills.find((f) => f.candidateId === "DEAR");
    expect(cheapFill).toBeDefined();
    expect(cheapFill!.amountOut).toBeGreaterThan(dearFill?.amountOut ?? 0n);
    expect(route.totalAmountOut).toBe(WAD);
  });

  it("throws rather than under-delivering when capacity is short", () => {
    // maxOutput per candidate is bounded by aquaQuote; ask for far more than exists.
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, WAD);
    expect(() =>
      optimize({
        candidates: [c1],
        kind: QuoteKind.ExactOutput,
        totalAmount: 99n * WAD,
        indexedBlock: 1n,
        refreshedAt: Date.now(),
      }),
    ).toThrow("insufficient liquidity");
  });
});

describe("certificate", () => {
  it("detects stale version", () => {
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, 200_000n * WAD);
    const cert = {
      fills: [
        {
          candidateId: "S1",
          strategyKey: c1.strategyKey,
          maker: c1.strategy.maker,
          amount: WAD,
          amountIn: WAD,
          amountOut: 1n,
          feeBps: 10_000,
          expectedVersion: 0n,
        },
      ],
      indexedBlock: 1n,
      refreshedAt: Date.now(),
    };
    const stale = detectStaleCertificate(cert, [{ ...c1, swapVersion: 1n }]);
    expect(stale).toEqual(["S1"]);
  });
});
