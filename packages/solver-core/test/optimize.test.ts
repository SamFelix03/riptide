import { describe, expect, it } from "vitest";

import { cpmmExactIn, cpmmExactOut } from "@riptide/riptide-math";

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
  it("splits exact-in across two strategies and matches riptide-math", () => {
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, 200_000n * WAD);
    const c2 = candidate("S2", 200_000n * WAD, 100n * WAD, 30_000, 200_000n * WAD);
    const total = 1500n * WAD;
    const route = optimize({
      candidates: [c1, c2],
      kind: QuoteKind.ExactInput,
      totalAmount: total,
      indexedBlock: 1n,
      refreshedAt: Date.now(),
    });
    expect(route.fills.length).toBe(2);
    expect(route.totalAmountIn).toBe(total);
    verifyOptimizedRoute(route, [c1, c2]);

    let expectedOut = 0n;
    for (const fill of route.fills) {
      const c = fill.candidateId === "S1" ? c1 : c2;
      expectedOut += cpmmExactIn(c.reserveQuoteWad, c.reserveBaseWad, fill.amount, BigInt(c.feeBps));
    }
    expect(route.totalAmountOut).toBe(expectedOut);
  });

  it("exact-out split matches riptide-math amountIn", () => {
    const c1 = candidate("S1", 200_000n * WAD, 100n * WAD, 10_000, 200_000n * WAD);
    const c2 = candidate("S2", 200_000n * WAD, 100n * WAD, 30_000, 200_000n * WAD);
    const totalOut = 10_000n;
    const route = optimize({
      candidates: [c1, c2],
      kind: QuoteKind.ExactOutput,
      totalAmount: totalOut,
      indexedBlock: 1n,
      refreshedAt: Date.now(),
    });
    expect(route.totalAmountOut).toBe(totalOut);
    verifyOptimizedRoute(route, [c1, c2]);
    let expectedIn = 0n;
    for (const fill of route.fills) {
      const c = fill.candidateId === "S1" ? c1 : c2;
      expectedIn += cpmmExactOut(c.reserveQuoteWad, c.reserveBaseWad, fill.amount, BigInt(c.feeBps));
    }
    expect(route.totalAmountIn).toBe(expectedIn);
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
