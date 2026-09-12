import type { PublicClient } from "viem";

import { getRiptideLens, getRiptideQuoter, loadManifest } from "@riptide/contracts";
import { evaluate } from "@riptide/resolver-core";
import {
  assertChainSeeded,
  buildStrategyPreset,
  isAuctionWindowClosedError,
  isInactiveAquaStrategyError,
  isNoSurplusError,
  isStrategyNotActiveError,
  listActiveStrategyKeys,
  demoMarketId,
  resolveFeedAddress,
  strategyToContractTuple,
} from "@riptide/solver-core";

const WAD = 1_000_000_000_000_000_000n;
const BPS = 10_000n;

const feedAbi = [
  {
    type: "function",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
] as const;

export type WatchOpportunity = {
  strategyId: string;
  maker: `0x${string}`;
  strategy: ReturnType<typeof buildStrategyPreset>;
  outWad: bigint;
  surplusWad: bigint;
  payToResolver: bigint;
  bestSettleTs: number;
  oraclePriceWad: bigint;
  poolPriceWad: bigint;
  gapBps: bigint;
};

function toStrategyTuple(strategy: ReturnType<typeof buildStrategyPreset>) {
  return strategyToContractTuple(strategy);
}

export async function scanOpportunities(
  client: PublicClient,
  chainId: number,
  minGapBps: bigint,
  outWad = 1_000_000_000_000_000_000n,
  subgraphUrl?: string,
): Promise<WatchOpportunity[]> {
  const manifest = loadManifest(chainId);
  await assertChainSeeded(client, manifest);

  const feed = await resolveFeedAddress(manifest, { envFeed: process.env.CHAINLINK_FEED_ADDRESS, client });
  const quoter = getRiptideQuoter(client, manifest.quoter);
  const lens = getRiptideLens(client, manifest.lens);
  const block = await client.getBlock();

  const [, answer] = await client.readContract({
    address: feed,
    abi: feedAbi,
    functionName: "latestRoundData",
  });
  const oraclePriceWad = (BigInt(answer) * WAD) / 100_000_000n;

  const opportunities: WatchOpportunity[] = [];

  let activeKeys: Set<string> | undefined;
  if (subgraphUrl) {
    activeKeys = await listActiveStrategyKeys(subgraphUrl, demoMarketId(chainId));
  }

  for (const seeded of manifest.seededStrategies) {
    if (activeKeys && !activeKeys.has(seeded.strategyKey.toLowerCase())) continue;
    const strategy = buildStrategyPreset(manifest, seeded, feed);

    let state;
    try {
      state = await lens.read.strategyState([
        seeded.maker,
        seeded.orderHash as `0x${string}`,
        strategy.baseToken,
        strategy.quoteToken,
      ]);
    } catch (err) {
      if (isStrategyNotActiveError(err)) continue;
      throw err;
    }

    const reserveBase = BigInt(state.aquaBase);
    const reserveQuote = BigInt(state.aquaQuote);
    if (reserveBase === 0n) continue;

    const poolPriceWad = (reserveQuote * WAD) / reserveBase;
    const gap = oraclePriceWad > poolPriceWad ? oraclePriceWad - poolPriceWad : poolPriceWad - oraclePriceWad;
    const gapBps = (gap * BPS) / poolPriceWad;

    if (gapBps < minGapBps) continue;

    let preview;
    try {
      [preview] = await quoter.read.previewRebalance([toStrategyTuple(strategy), outWad]);
    } catch (err) {
      if (isNoSurplusError(err) || isInactiveAquaStrategyError(err) || isAuctionWindowClosedError(err)) continue;
      throw err;
    }

    const nowTs = Number(block.timestamp);
    const evaluation = evaluate({
      auction: {
        strategyId: seeded.id,
        beta: strategy.auction.beta,
        decay: strategy.auction.decay,
        duration: strategy.auction.duration,
        antiSandwichPeriod: strategy.auction.antiSandwichPeriod,
        auctionStartTs: nowTs,
        initialBalanceIn: reserveQuote,
        executedInWad: preview.surplusWad + 1n,
        staleInWad: 1n,
      },
      nowTs,
    });

    opportunities.push({
      strategyId: seeded.id,
      maker: seeded.maker,
      strategy: { ...strategy, reserveBaseWad: reserveBase, reserveQuoteWad: reserveQuote },
      outWad,
      surplusWad: preview.surplusWad,
      payToResolver: preview.payToResolver,
      bestSettleTs: evaluation.bestSettleTs,
      oraclePriceWad,
      poolPriceWad,
      gapBps,
    });
  }

  return opportunities.sort((a, b) => (a.payToResolver > b.payToResolver ? -1 : 1));
}
