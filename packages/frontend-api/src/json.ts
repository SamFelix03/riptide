import type { Strategy } from "@riptide/strategy-sdk";

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  return BigInt(String(v));
}

/** Normalize a Strategy received over JSON (string bigints) back to typed bigints. */
export function normalizeStrategy(raw: unknown): Strategy {
  const s = raw as Record<string, unknown>;
  const fee = s.fee as Record<string, unknown>;
  const auction = s.auction as Record<string, unknown>;
  return {
    maker: s.maker as `0x${string}`,
    baseToken: s.baseToken as `0x${string}`,
    quoteToken: s.quoteToken as `0x${string}`,
    reserveBaseWad: toBigInt(s.reserveBaseWad),
    reserveQuoteWad: toBigInt(s.reserveQuoteWad),
    fee: {
      feeMin: toBigInt(fee.feeMin),
      feeMax: toBigInt(fee.feeMax),
      lambda: toBigInt(fee.lambda),
      kp: toBigInt(fee.kp),
      ki: toBigInt(fee.ki),
      iMax: toBigInt(fee.iMax),
      sigmaMin: toBigInt(fee.sigmaMin),
      sigmaMax: toBigInt(fee.sigmaMax),
    },
    auction: {
      beta: toBigInt(auction.beta),
      duration: Number(auction.duration),
      decay: toBigInt(auction.decay),
      antiSandwichPeriod: Number(auction.antiSandwichPeriod),
    },
    oracle: s.oracle as Strategy["oracle"],
    feeProvider: s.feeProvider as `0x${string}`,
    salt: s.salt as `0x${string}`,
  };
}

/** Recursively stringify bigints so NextResponse.json can serialize API results. */
export function serializeForJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeForJson(v)]));
  }
  return value;
}
