import fs from "node:fs";
import path from "node:path";

import { applyStaleFreeze, ewmaVar, sigmaFromVar } from "@riptide/riptide-math";
import { describe, expect, it } from "vitest";

import { parsePriceSourceBody } from "../src/feed.js";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const vectors = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "test/vectors/volatility_v1.json"), "utf8")) as {
  cases: Array<{
    id: string;
    inputs: {
      dt?: string;
      lambda?: string;
      logReturn?: string;
      prevVar?: string;
      sigmaMin?: string;
      sigmaMax?: string;
      sigmaPrev?: string;
      sigmaCandidate?: string;
      isStale?: string;
    };
    outputs: {
      sigmaWad: { floor: string; ceiling: string };
    };
  }>;
};

function inRange(value: bigint, floor: bigint, ceiling: bigint): void {
  expect(value >= floor && value <= ceiling).toBe(true);
}

describe("parsePriceSourceBody", () => {
  it("reads priceWad", () => {
    const obs = parsePriceSourceBody({ priceWad: "1000000000000000000" }, 99);
    expect(obs.priceWad).toBe(1_000_000_000_000_000_000n);
    expect(obs.timestamp).toBe(99);
  });

  it("prefers explicit timestamp over fallback", () => {
    const obs = parsePriceSourceBody({ price: "2", timestamp: 7 }, 99);
    expect(obs.priceWad).toBe(2n);
    expect(obs.timestamp).toBe(7);
  });

  it("rejects missing price", () => {
    expect(() => parsePriceSourceBody({}, 1)).toThrow(/priceWad or price/);
  });
});

describe("on-chain EWMA bounds (Phase 3 vectors)", () => {
  for (const c of vectors.cases) {
    if (c.id === "vol_stale_freeze") {
      it(c.id, () => {
        const sigma = applyStaleFreeze(
          BigInt(c.inputs.sigmaPrev!),
          BigInt(c.inputs.sigmaCandidate!),
          c.inputs.isStale === "1",
        );
        inRange(sigma, BigInt(c.outputs.sigmaWad.floor), BigInt(c.outputs.sigmaWad.ceiling));
      });
      continue;
    }
    if (c.id === "vol_clamp_min") {
      it(c.id, () => {
        const sigma = sigmaFromVar(0n, BigInt(c.inputs.dt!), BigInt(c.inputs.sigmaMin!), BigInt(c.inputs.sigmaMax!));
        inRange(sigma, BigInt(c.outputs.sigmaWad.floor), BigInt(c.outputs.sigmaWad.ceiling));
      });
      continue;
    }
    if (c.id === "vol_clamp_max") {
      it(c.id, () => {
        const varWad = ewmaVar(0n, BigInt(c.inputs.logReturn!), BigInt(c.inputs.lambda!), 0n, false);
        const sigma = sigmaFromVar(varWad, BigInt(c.inputs.dt!), BigInt(c.inputs.sigmaMin!), BigInt(c.inputs.sigmaMax!));
        inRange(sigma, BigInt(c.outputs.sigmaWad.floor), BigInt(c.outputs.sigmaWad.ceiling));
      });
      continue;
    }
    if (c.id === "vol_ewma_mid") {
      it(c.id, () => {
        const varWad = ewmaVar(
          BigInt(c.inputs.prevVar!),
          BigInt(c.inputs.logReturn!),
          BigInt(c.inputs.lambda!),
          0n,
          false,
        );
        const sigma = sigmaFromVar(varWad, BigInt(c.inputs.dt!), BigInt(c.inputs.sigmaMin!), BigInt(c.inputs.sigmaMax!));
        inRange(sigma, BigInt(c.outputs.sigmaWad.floor), BigInt(c.outputs.sigmaWad.ceiling));
      });
    }
  }
});
