import fs from "node:fs";
import path from "node:path";

import { diamondSplit, dutchAuctionBalanceIn } from "@riptide/riptide-math";
import { describe, expect, it } from "vitest";

import { evaluate } from "../src/evaluate.js";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const vectors = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "test/vectors/diamond_split_v1.json"), "utf8")) as {
  cases: Array<{
    id: string;
    inputs: { beta: string; surplusWad: string };
    outputs: {
      payToResolver: { floor: string; ceiling: string };
      retainToLP: { floor: string; ceiling: string };
      surplus: { floor: string; ceiling: string };
      dutchBalanceIn: { floor: string; ceiling: string };
    };
  }>;
};

function inRange(value: bigint, floor: bigint, ceiling: bigint): void {
  expect(value >= floor && value <= ceiling).toBe(true);
}

describe("evaluate diamond_split_v1 vectors", () => {
  for (const c of vectors.cases) {
    it(c.id, () => {
      const beta = BigInt(c.inputs.beta);
      const surplusWad = BigInt(c.inputs.surplusWad);
      const split = diamondSplit(surplusWad, beta);

      inRange(split.payToResolver, BigInt(c.outputs.payToResolver.floor), BigInt(c.outputs.payToResolver.ceiling));
      inRange(split.retainToLP, BigInt(c.outputs.retainToLP.floor), BigInt(c.outputs.retainToLP.ceiling));
      inRange(surplusWad, BigInt(c.outputs.surplus.floor), BigInt(c.outputs.surplus.ceiling));

      const dutch = dutchAuctionBalanceIn(1_000_000_000_000_000_000_000n, 990_000_000_000_000_000n, 100);
      inRange(dutch, BigInt(c.outputs.dutchBalanceIn.floor), BigInt(c.outputs.dutchBalanceIn.ceiling));

      const staleIn = surplusWad > 0n ? 0n : 1n;
      const executedIn = staleIn + surplusWad;
      const result = evaluate({
        auction: {
          strategyId: "S1",
          beta,
          decay: 990_000_000_000_000_000n,
          duration: 7200,
          antiSandwichPeriod: 0,
          auctionStartTs: 1_000,
          initialBalanceIn: executedIn,
          executedInWad: executedIn,
          staleInWad: staleIn,
        },
        nowTs: 1_000,
      });

      if (surplusWad > 0n) {
        inRange(result.payToResolver, BigInt(c.outputs.payToResolver.floor), BigInt(c.outputs.payToResolver.ceiling));
        expect(result.profitable).toBe(result.payToResolver > 0n);
      } else {
        expect(result.profitable).toBe(false);
      }
    });
  }
});

describe("bestSettleTs", () => {
  it("prefers later settle when dutch decay increases surplus capture", () => {
    const result = evaluate({
      auction: {
        strategyId: "S1",
        beta: 950_000_000_000_000_000n,
        decay: 990_000_000_000_000_000n,
        duration: 3600,
        antiSandwichPeriod: 0,
        auctionStartTs: 1000,
        initialBalanceIn: 1_000_000_000_000_000_000_000n,
        executedInWad: 500_000_000_000_000_000_000n,
        staleInWad: 400_000_000_000_000_000_000n,
      },
      nowTs: 1000,
    });
    expect(result.bestSettleTs).toBeGreaterThanOrEqual(1000);
    expect(result.payToResolver).toBeGreaterThan(0n);
  });

  it("is not profitable when executedIn is below staleIn", () => {
    const result = evaluate({
      auction: {
        strategyId: "S1",
        beta: 950_000_000_000_000_000n,
        decay: 990_000_000_000_000_000n,
        duration: 3600,
        antiSandwichPeriod: 0,
        auctionStartTs: 1000,
        initialBalanceIn: 1n,
        executedInWad: 1n,
        staleInWad: 2n,
      },
      nowTs: 1000,
    });
    expect(result.profitable).toBe(false);
    expect(result.payToResolver).toBe(0n);
  });
});
