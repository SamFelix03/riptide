import { describe, expect, it } from "vitest";

import { decodeStrategy, encodeStrategy } from "../src/codec.js";
import type { Strategy } from "../src/types.js";

const sample: Strategy = {
  maker: "0x1111111111111111111111111111111111111111",
  baseToken: "0x2222222222222222222222222222222222222222",
  quoteToken: "0x3333333333333333333333333333333333333333",
  reserveBaseWad: 5_000_000_000_000_000_000_000n,
  reserveQuoteWad: 5_000_000_000_000_000_000_000n,
  fee: {
    feeMin: 30_000n,
    feeMax: 500_000n,
    lambda: 940_000_000_000_000_000n,
    kp: 500_000_000_000_000_000n,
    ki: 100_000_000_000_000_000n,
    iMax: 1_000_000_000_000_000_000n,
    sigmaMin: 10_000_000_000_000_000n,
    sigmaMax: 1_000_000_000_000_000_000n,
  },
  auction: {
    beta: 950_000_000_000_000_000n,
    duration: 3600,
    decay: 990_000_000_000_000n,
    antiSandwichPeriod: 300,
  },
  oracle: {
    feed: "0x4444444444444444444444444444444444444444",
    decimals: 8,
    maxStaleness: 3600,
  },
  feeProvider: "0x5555555555555555555555555555555555555555",
  salt: "0x6666666666666666666666666666666666666666666666666666666666666667",
};

describe("codec roundtrip", () => {
  it("preserves wire fields", () => {
    const payload = encodeStrategy(sample);
    const decoded = decodeStrategy(payload);
    expect(decoded.maker).toBe("0x0000000000000000000000000000000000000000");
    expect(decoded.fee.lambda).toBe(sample.fee.lambda);
    expect(decoded.auction.decay).toBe(sample.auction.decay);
    expect(decoded.oracle.maxStaleness).toBe(sample.oracle.maxStaleness);
  });
});
