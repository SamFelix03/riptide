import { BPS, mulDiv, Rounding } from "@riptide/riptide-math";
import { cpmmExactIn, cpmmExactOut } from "@riptide/riptide-math";

import { QuoteKind } from "./types.js";

/** Marginal base out per one wei quote in at `amountIn` (exact-in leg). */
export function marginalOutPerIn(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps: bigint,
): bigint {
  if (reserveIn === 0n || reserveOut === 0n) return 0n;
  const inNet = mulDiv(amountIn, BPS - feeBps, BPS, Rounding.Down);
  const denom = reserveIn + inNet;
  if (denom === 0n) return 0n;
  return mulDiv(mulDiv(reserveOut, reserveIn, denom, Rounding.Down), 1n, denom, Rounding.Down);
}

/** Marginal quote in per one wei base out at `amountOut` (exact-out leg). */
export function marginalInPerOut(
  reserveIn: bigint,
  reserveOut: bigint,
  amountOut: bigint,
  feeBps: bigint,
): bigint {
  if (reserveIn === 0n || reserveOut === 0n || amountOut >= reserveOut) {
    return Number.MAX_SAFE_INTEGER as unknown as bigint;
  }
  const inNet = (reserveIn * reserveOut) / (reserveOut - amountOut) - reserveIn;
  const amountIn = (inNet * BPS + (BPS - feeBps - 1n)) / (BPS - feeBps);
  if (amountOut === 0n) return amountIn;
  return amountIn;
}

export function quoteAt(
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: bigint,
  kind: QuoteKind,
  amount: bigint,
): { amountIn: bigint; amountOut: bigint } {
  if (kind === QuoteKind.ExactInput) {
    return { amountIn: amount, amountOut: cpmmExactIn(reserveIn, reserveOut, amount, feeBps) };
  }
  return { amountIn: cpmmExactOut(reserveIn, reserveOut, amount, feeBps), amountOut: amount };
}

/** Invert marginal exact-in: find amountIn where marginalOutPerIn ~= target (binary search). */
export function invertMarginalExactIn(
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: bigint,
  target: bigint,
  maxIn: bigint,
): bigint {
  let lo = 0n;
  let hi = maxIn;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const m = marginalOutPerIn(reserveIn, reserveOut, mid, feeBps);
    if (m >= target) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}
