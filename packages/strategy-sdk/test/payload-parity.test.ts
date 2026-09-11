import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decodeStrategy, encodeStrategy } from "../src/codec.js";
import { marketId, policyHash, strategyKey } from "../src/hashes.js";
import type { Strategy } from "../src/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../test/vectors/payload_v1.json");
const vectors = JSON.parse(readFileSync(root, "utf8")) as {
  cases: Array<{
    id: string;
    strategy: Record<string, unknown>;
    payloadHex: string;
    policyHash: string;
    marketId: string;
    strategyKey?: string;
    strategyHash?: string;
  }>;
};

function parseStrategy(raw: Record<string, unknown>): Strategy {
  const fee = raw.fee as Record<string, string>;
  const auction = raw.auction as Record<string, string>;
  const oracle = raw.oracle as Record<string, string>;
  return {
    maker: raw.maker as `0x${string}`,
    baseToken: raw.baseToken as `0x${string}`,
    quoteToken: raw.quoteToken as `0x${string}`,
    reserveBaseWad: BigInt(raw.reserveBaseWad as string),
    reserveQuoteWad: BigInt(raw.reserveQuoteWad as string),
    fee: {
      feeMin: BigInt(fee.feeMin),
      feeMax: BigInt(fee.feeMax),
      lambda: BigInt(fee.lambda),
      kp: BigInt(fee.kp),
      ki: BigInt(fee.ki),
      iMax: BigInt(fee.iMax),
      sigmaMin: BigInt(fee.sigmaMin),
      sigmaMax: BigInt(fee.sigmaMax),
    },
    auction: {
      beta: BigInt(auction.beta),
      duration: Number(auction.duration),
      decay: BigInt(auction.decay),
      antiSandwichPeriod: Number(auction.antiSandwichPeriod),
    },
    oracle: {
      feed: oracle.feed as `0x${string}`,
      decimals: Number(oracle.decimals),
      maxStaleness: Number(oracle.maxStaleness),
    },
    feeProvider: raw.feeProvider as `0x${string}`,
    salt: raw.salt as `0x${string}`,
  };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe("payload parity", () => {
  for (const c of vectors.cases) {
    it(c.id, () => {
      const strategy = parseStrategy(c.strategy);
      const payload = encodeStrategy(strategy);
      expect(Buffer.from(payload).toString("hex")).toBe(c.payloadHex);
      expect(policyHash(payload)).toBe(c.policyHash);
      expect(marketId(strategy.baseToken, strategy.quoteToken)).toBe(c.marketId);
      if (c.strategyKey && c.strategyHash) {
        expect(strategyKey(strategy.maker, c.strategyHash as `0x${string}`)).toBe(c.strategyKey);
      }
      const decoded = decodeStrategy(payload);
      expect(decoded.baseToken).toBe(strategy.baseToken);
      expect(decoded.salt).toBe(strategy.salt);
    });
  }
});
