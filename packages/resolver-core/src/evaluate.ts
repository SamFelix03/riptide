import { diamondSplit, dutchAuctionBalanceIn } from "@riptide/riptide-math";

export type OpenAuction = {
  strategyId: string;
  beta: bigint;
  decay: bigint;
  duration: number;
  antiSandwichPeriod: number;
  auctionStartTs: number;
  initialBalanceIn: bigint;
  executedInWad: bigint;
  staleInWad: bigint;
};

export type EvaluateInput = {
  auction: OpenAuction;
  nowTs: number;
};

export type EvaluateResult = {
  surplusWad: bigint;
  payToResolver: bigint;
  retainToLP: bigint;
  bestSettleTs: number;
  profitable: boolean;
};

export function evaluate(input: EvaluateInput): EvaluateResult {
  const { auction, nowTs } = input;
  const { beta, decay, duration, antiSandwichPeriod, auctionStartTs, initialBalanceIn, staleInWad } = auction;

  let bestPay = 0n;
  let bestTs = nowTs;
  const start = Math.max(auctionStartTs + antiSandwichPeriod, nowTs);
  const end = auctionStartTs + duration;

  for (let ts = start; ts <= end; ts++) {
    const elapsed = ts - auctionStartTs;
    const executedIn = dutchAuctionBalanceIn(initialBalanceIn, decay, elapsed);
    if (executedIn < staleInWad) continue;
    const surplus = executedIn - staleInWad;
    const { payToResolver } = diamondSplit(surplus, beta);
    if (payToResolver > bestPay) {
      bestPay = payToResolver;
      bestTs = ts;
    }
  }

  const currentElapsed = Math.max(0, nowTs - auctionStartTs);
  const currentExecuted = dutchAuctionBalanceIn(initialBalanceIn, decay, currentElapsed);
  const surplusWad = currentExecuted >= staleInWad ? currentExecuted - staleInWad : 0n;
  const split = surplusWad > 0n ? diamondSplit(surplusWad, beta) : { payToResolver: 0n, retainToLP: 0n };

  if (bestPay === 0n && surplusWad > 0n) {
    bestTs = nowTs;
    bestPay = split.payToResolver;
  }

  return {
    surplusWad,
    payToResolver: split.payToResolver,
    retainToLP: split.retainToLP,
    bestSettleTs: bestTs,
    profitable: split.payToResolver > 0n && currentExecuted >= staleInWad,
  };
}
