import { cpmmExactIn, cpmmExactOut } from "@riptide/riptide-math";

import { QuoteKind, type StrategyCandidate } from "./types.js";

export type QuoteResult = {
  amountIn: bigint;
  amountOut: bigint;
  feeBps: number;
  sigmaWad: bigint;
};

/** Representative σ for a multi-strategy quote (max across the shortlist). */
export function aggregateSigmaWad(candidates: StrategyCandidate[]): bigint {
  let max = 0n;
  for (const c of candidates) {
    if (c.sigmaWad > max) max = c.sigmaWad;
  }
  return max;
}

export function quoteSingle(
  candidate: StrategyCandidate,
  kind: QuoteKind,
  amount: bigint,
): QuoteResult {
  const reserveIn = candidate.reserveQuoteWad;
  const reserveOut = candidate.reserveBaseWad;
  const feeBps = BigInt(candidate.feeBps);

  if (kind === QuoteKind.ExactInput) {
    const amountOut = cpmmExactIn(reserveIn, reserveOut, amount, feeBps);
    return { amountIn: amount, amountOut, feeBps: candidate.feeBps, sigmaWad: candidate.sigmaWad };
  }

  const amountIn = cpmmExactOut(reserveIn, reserveOut, amount, feeBps);
  return { amountIn, amountOut: amount, feeBps: candidate.feeBps, sigmaWad: candidate.sigmaWad };
}

export function quoteAggregate(
  candidates: StrategyCandidate[],
  kind: QuoteKind,
  amount: bigint,
): QuoteResult {
  if (candidates.length === 0) throw new Error("no candidates");
  if (candidates.length === 1) return quoteSingle(candidates[0]!, kind, amount);

  if (kind === QuoteKind.ExactInput) {
    let totalOut = 0n;
    const per = amount / BigInt(candidates.length);
    let remainder = amount - per * BigInt(candidates.length);
    for (const c of candidates) {
      const slice = per + (remainder > 0n ? 1n : 0n);
      if (remainder > 0n) remainder -= 1n;
      totalOut += quoteSingle(c, kind, slice).amountOut;
    }
    return {
      amountIn: amount,
      amountOut: totalOut,
      feeBps: candidates[0]!.feeBps,
      sigmaWad: aggregateSigmaWad(candidates),
    };
  }

  let totalIn = 0n;
  const per = amount / BigInt(candidates.length);
  let remainder = amount - per * BigInt(candidates.length);
  for (const c of candidates) {
    const slice = per + (remainder > 0n ? 1n : 0n);
    if (remainder > 0n) remainder -= 1n;
    totalIn += quoteSingle(c, kind, slice).amountIn;
  }
  return {
    amountIn: totalIn,
    amountOut: amount,
    feeBps: candidates[0]!.feeBps,
    sigmaWad: aggregateSigmaWad(candidates),
  };
}
