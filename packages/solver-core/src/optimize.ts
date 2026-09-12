import { cpmmExactIn, cpmmExactOut } from "@riptide/riptide-math";

import { invertMarginalExactIn, marginalInPerOut, marginalOutPerIn, quoteAt, UNSERVICEABLE_MARGINAL } from "./marginal.js";
import { QuoteKind, MAX_FILLS, type FillAllocation, type OptimizedRoute, type RouteCertificate, type StrategyCandidate } from "./types.js";

export type OptimizeInput = {
  candidates: StrategyCandidate[];
  kind: QuoteKind;
  totalAmount: bigint;
  indexedBlock: bigint;
  refreshedAt: number;
};

/**
 * Reserves the on-chain AMM actually prices against.
 *
 * The swap program runs stock `XYCSwap`, which reads the strategy's live Aqua allowance
 * balances - not the `reserveBaseWad`/`reserveQuoteWad` committed in the order bytes.
 * Those committed values are the *initial* inventory and stay frozen for the life of the
 * order (they are part of the strategy hash), so they drift further from reality with
 * every fill. Quoting off them makes the router's output overshoot what the chain pays
 * and trips `RiptideSlippageExceeded` on aggregate routes.
 */
function poolReserves(c: StrategyCandidate): { reserveIn: bigint; reserveOut: bigint } {
  return { reserveIn: c.aquaQuote, reserveOut: c.aquaBase };
}

function maxInput(candidate: StrategyCandidate): bigint {
  return candidate.aquaQuote;
}

function maxOutput(candidate: StrategyCandidate): bigint {
  const feeBps = BigInt(candidate.feeBps);
  const { reserveIn, reserveOut } = poolReserves(candidate);
  return cpmmExactIn(reserveIn, reserveOut, candidate.aquaQuote, feeBps);
}

function buildFills(
  candidates: StrategyCandidate[],
  kind: QuoteKind,
  amounts: bigint[],
  indexedBlock: bigint,
  refreshedAt: number,
): OptimizedRoute {
  const fills: FillAllocation[] = [];
  let totalIn = 0n;
  let totalOut = 0n;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const amt = amounts[i]!;
    if (amt === 0n) continue;

    const { reserveIn, reserveOut } = poolReserves(c);
    const feeBps = BigInt(c.feeBps);
    let amountIn: bigint;
    let amountOut: bigint;

    if (kind === QuoteKind.ExactInput) {
      amountIn = amt;
      amountOut = cpmmExactIn(reserveIn, reserveOut, amt, feeBps);
    } else {
      amountOut = amt;
      amountIn = cpmmExactOut(reserveIn, reserveOut, amt, feeBps);
    }

    totalIn += amountIn;
    totalOut += amountOut;
    fills.push({
      candidateId: c.id,
      strategyKey: c.strategyKey,
      maker: c.strategy.maker,
      amount: amt,
      amountIn,
      amountOut,
      feeBps: c.feeBps,
      expectedVersion: c.swapVersion,
    });
  }

  const certificate: RouteCertificate = { fills, indexedBlock, refreshedAt };
  return { kind, totalAmountIn: totalIn, totalAmountOut: totalOut, fills, certificate };
}

/** Bounded separable water-filling for exact-in (maximize out). */
function optimizeExactIn(candidates: StrategyCandidate[], totalIn: bigint, indexedBlock: bigint, refreshedAt: number): OptimizedRoute {
  const active = candidates.slice(0, MAX_FILLS);
  const caps = active.map((c) => maxInput(c));
  const totalCap = caps.reduce((a, b) => a + b, 0n);
  if (totalIn > totalCap) throw new Error("insufficient liquidity");

  if (active.length === 1) {
    return buildFills(active, QuoteKind.ExactInput, [totalIn], indexedBlock, refreshedAt);
  }

  const amounts = caps.map((cap) => (totalIn * cap) / totalCap);
  let allocated = amounts.reduce((a, b) => a + b, 0n);
  let remaining = totalIn - allocated;
  let idx = 0;
  while (remaining > 0n && idx < active.length * 64) {
    const i = idx % active.length;
    if (amounts[i]! < caps[i]!) {
      amounts[i] = amounts[i]! + 1n;
      remaining -= 1n;
    }
    idx++;
  }

  while (remaining > 0n) {
    let bestIdx = -1;
    let bestOut = 0n;
    for (let i = 0; i < active.length; i++) {
      const c = active[i]!;
      if (amounts[i]! >= caps[i]!) continue;
      const { reserveIn, reserveOut } = poolReserves(c);
      const out = cpmmExactIn(reserveIn, reserveOut, 1n, BigInt(c.feeBps));
      if (out > bestOut) {
        bestOut = out;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    amounts[bestIdx] = amounts[bestIdx]! + 1n;
    remaining -= 1n;
  }

  if (remaining > 0n) throw new Error("insufficient liquidity");

  return buildFills(active, QuoteKind.ExactInput, amounts, indexedBlock, refreshedAt);
}

/** Water-filling for exact-out (minimize in) via marginal cost equalization. */
function optimizeExactOut(candidates: StrategyCandidate[], totalOut: bigint, indexedBlock: bigint, refreshedAt: number): OptimizedRoute {
  const active = candidates.slice(0, MAX_FILLS);
  const outCaps = active.map((c) => maxOutput(c));
  const totalCap = outCaps.reduce((a, b) => a + b, 0n);
  if (totalOut > totalCap) throw new Error("insufficient liquidity");

  if (active.length === 1) {
    return buildFills(active, QuoteKind.ExactOutput, [totalOut], indexedBlock, refreshedAt);
  }

  const amounts = new Array<bigint>(active.length).fill(0n);
  let remaining = totalOut;

  while (remaining > 0n) {
    let bestIdx = -1;
    // Must start unset, not at a numeric sentinel: real marginals are wei-denominated
    // and routinely exceed any Number-range constant.
    let bestMarginal: bigint | null = null;
    for (let i = 0; i < active.length; i++) {
      const c = active[i]!;
      const cur = amounts[i]!;
      if (cur >= outCaps[i]!) continue;
      const { reserveIn, reserveOut } = poolReserves(c);
      const m = marginalInPerOut(reserveIn, reserveOut, cur + 1n, BigInt(c.feeBps));
      if (m >= UNSERVICEABLE_MARGINAL) continue;
      if (bestMarginal === null || m < bestMarginal) {
        bestMarginal = m;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    amounts[bestIdx] = amounts[bestIdx]! + 1n;
    remaining -= 1n;
    if (remaining > 1000n) {
      const step = remaining / 4n + 1n;
      const capped = amounts[bestIdx]! + step;
      amounts[bestIdx] = capped > outCaps[bestIdx]! ? outCaps[bestIdx]! : capped;
      remaining = totalOut - amounts.reduce((a, b) => a + b, 0n);
    }
  }

  // Never return a short route silently. The exact-in path throws here too; without this
  // the caller's requested amount was quietly replaced by whatever the loop managed to fill.
  if (remaining > 0n) throw new Error("insufficient liquidity");

  return buildFills(active, QuoteKind.ExactOutput, amounts, indexedBlock, refreshedAt);
}

export function optimize(input: OptimizeInput): OptimizedRoute {
  const { candidates, kind, totalAmount, indexedBlock, refreshedAt } = input;
  if (candidates.length === 0) throw new Error("no candidates");
  if (totalAmount <= 0n) throw new Error("amount must be positive");

  if (kind === QuoteKind.ExactInput) {
    return optimizeExactIn(candidates, totalAmount, indexedBlock, refreshedAt);
  }
  return optimizeExactOut(candidates, totalAmount, indexedBlock, refreshedAt);
}

export function verifyOptimizedRoute(route: OptimizedRoute, candidates: StrategyCandidate[]): void {
  for (const fill of route.fills) {
    const c = candidates.find((x) => x.id === fill.candidateId);
    if (!c) throw new Error(`unknown fill candidate ${fill.candidateId}`);
    const { reserveIn, reserveOut } = poolReserves(c);
    const q = quoteAt(reserveIn, reserveOut, BigInt(c.feeBps), route.kind, fill.amount);
    if (route.kind === QuoteKind.ExactInput) {
      if (q.amountOut !== fill.amountOut) throw new Error("amountOut mismatch");
    } else if (q.amountIn !== fill.amountIn) {
      throw new Error("amountIn mismatch");
    }
  }
}
