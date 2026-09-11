import { describe, expect, it } from "vitest";
import { encodeAbiParameters, bytesToHex, concatHex } from "viem";
import { encodeStrategy } from "@riptide/strategy-sdk";
import type { Strategy } from "@riptide/strategy-sdk";

import { decodeStrategyFromOrderBytes, tryDecodeStrategyFromOrderBytes } from "../src/orderPayload.js";

const WAD = 1_000_000_000_000_000_000n;
const MAKER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

function sampleStrategy(): Strategy {
  return {
    maker: MAKER,
    baseToken: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    quoteToken: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
    reserveBaseWad: 100n * WAD,
    reserveQuoteWad: 200_000n * WAD,
    fee: {
      feeMin: 30_000n,
      feeMax: 500_000n,
      lambda: 100_000_000_000_000_000n,
      kp: 500_000_000_000_000_000n,
      ki: 100_000_000_000_000_000n,
      iMax: WAD,
      sigmaMin: 10_000_000_000_000_000n,
      sigmaMax: WAD,
    },
    auction: { beta: 950_000_000_000_000_000n, duration: 3600, decay: 990_000_000_000_000_000n, antiSandwichPeriod: 300 },
    oracle: { feed: "0x0000000000000000000000000000000000000001", decimals: 8, maxStaleness: 3600 },
    feeProvider: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    salt: "0x00000000000000000000000000000000000000000000000000000000000004d2",
  };
}

/** Reproduce what Aqua emits: abi.encode(ISwapVM.Order{maker, traits, data}). */
function encodeOrderBytes(s: Strategy, programHex: `0x${string}` = "0x0d0500000000"): `0x${string}` {
  const payload = bytesToHex(encodeStrategy(s));
  const data = concatHex([payload, programHex]);
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "traits", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    [{ maker: s.maker, traits: (1n << 254n) | (226n << 208n), data }],
  );
}

describe("decodeStrategyFromOrderBytes", () => {
  it("round-trips a full strategy out of Aqua order bytes", () => {
    const s = sampleStrategy();
    const decoded = decodeStrategyFromOrderBytes(encodeOrderBytes(s), MAKER);

    expect(decoded.maker.toLowerCase()).toBe(MAKER.toLowerCase());
    expect(decoded.baseToken.toLowerCase()).toBe(s.baseToken.toLowerCase());
    expect(decoded.quoteToken.toLowerCase()).toBe(s.quoteToken.toLowerCase());
    expect(decoded.reserveBaseWad).toBe(s.reserveBaseWad);
    expect(decoded.reserveQuoteWad).toBe(s.reserveQuoteWad);
    // The policy is the whole point: these are what the Quoter needs to rebuild the order.
    expect(decoded.fee).toEqual(s.fee);
    expect(decoded.auction).toEqual(s.auction);
    expect(decoded.oracle.decimals).toBe(s.oracle.decimals);
    expect(decoded.oracle.maxStaleness).toBe(s.oracle.maxStaleness);
    expect(decoded.oracle.feed.toLowerCase()).toBe(s.oracle.feed.toLowerCase());
    expect(decoded.feeProvider.toLowerCase()).toBe(s.feeProvider.toLowerCase());
    expect(decoded.salt.toLowerCase()).toBe(s.salt.toLowerCase());
  });

  it("works regardless of trailing program length", () => {
    const s = sampleStrategy();
    const long = decodeStrategyFromOrderBytes(encodeOrderBytes(s, `0x${"ab".repeat(120)}`), MAKER);
    expect(long.salt.toLowerCase()).toBe(s.salt.toLowerCase());
    expect(long.fee.feeMin).toBe(s.fee.feeMin);
  });

  it("rejects an order whose data is not a RIPTIDE payload", () => {
    const bogus = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "maker", type: "address" },
            { name: "traits", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
      ],
      [{ maker: MAKER, traits: 0n, data: `0x${"00".repeat(300)}` }],
    );
    expect(() => decodeStrategyFromOrderBytes(bogus, MAKER)).toThrow();
    expect(tryDecodeStrategyFromOrderBytes(bogus, MAKER)).toBeNull();
  });

  it("tolerates missing or empty order bytes", () => {
    expect(tryDecodeStrategyFromOrderBytes(null, MAKER)).toBeNull();
    expect(tryDecodeStrategyFromOrderBytes(undefined, MAKER)).toBeNull();
    expect(tryDecodeStrategyFromOrderBytes("0x", MAKER)).toBeNull();
  });

  it("does not confuse a truncated payload for a valid one", () => {
    const s = sampleStrategy();
    const payload = bytesToHex(encodeStrategy(s));
    const truncated = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "maker", type: "address" },
            { name: "traits", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
      ],
      [{ maker: MAKER, traits: 0n, data: payload.slice(0, 200) as `0x${string}` }],
    );
    expect(tryDecodeStrategyFromOrderBytes(truncated, MAKER)).toBeNull();
  });
});
