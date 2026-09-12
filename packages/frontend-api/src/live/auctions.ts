import type { PublicClient } from "viem";

import { getRiptideLens, getRiptideQuoter, getRiptideRebalanceRouter, loadManifest } from "@riptide/contracts";
import { evaluate } from "@riptide/resolver-core";
import {
  assertChainSeeded,
  buildStrategyPreset,
  demoResolverAddress,
  isAuctionWindowClosedError,
  isInactiveAquaStrategyError,
  isNoSurplusError,
  isStrategyNotActiveError,
  resolveFeedAddress,
  strategyToContractTuple,
} from "@riptide/solver-core";

import type { Auction, MarketId } from "../types.js";

const WAD = 1_000_000_000_000_000_000n;
const BPS = 10_000n;
/** Must match RiptideConstants.SEED_REBALANCE_OUT_WAD baked into seeded Aqua rebalance orders. */
const SEED_REBALANCE_OUT_WAD = WAD;

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

export async function scanOpenAuctions(
  client: PublicClient,
  chainId: number,
  market: MarketId,
  _subgraphUrl?: string,
  minGapBps = 50n,
  outWad = SEED_REBALANCE_OUT_WAD,
): Promise<Auction[]> {
  const manifest = loadManifest(chainId);
  await assertChainSeeded(client, manifest);

  const feed = await resolveFeedAddress(manifest, { envFeed: process.env.CHAINLINK_FEED_ADDRESS, client });
  const quoter = getRiptideQuoter(client, manifest.quoter);
  const lens = getRiptideLens(client, manifest.lens);
  const rebalanceRouter = getRiptideRebalanceRouter(client, manifest.rebalanceRouter);
  const block = await client.getBlock();

  const [, answer] = await client.readContract({
    address: feed,
    abi: feedAbi,
    functionName: "latestRoundData",
  });
  const oraclePriceWad = (BigInt(answer) * WAD) / 100_000_000n;

  const auctions: Auction[] = [];

  for (const seeded of manifest.seededStrategies) {
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
      if (isInactiveAquaStrategyError(err)) continue;
      throw err;
    }

    const reserveBase = BigInt(state.aquaBase);
    const reserveQuote = BigInt(state.aquaQuote);
    if (reserveBase === 0n) continue;

    const poolPriceWad = (reserveQuote * WAD) / reserveBase;
    const gap = oraclePriceWad > poolPriceWad ? oraclePriceWad - poolPriceWad : poolPriceWad - oraclePriceWad;
    const gapBps = (gap * BPS) / poolPriceWad;
    if (gapBps < minGapBps) continue;

    const strategyKey = seeded.strategyKey as `0x${string}`;
    const auctionStart = Number(await rebalanceRouter.read.rebalanceAuctionStart([strategyKey]));
    if (auctionStart === 0) continue;

    // Skip auctions whose window has already closed. Relying on the preview call to
    // revert is fragile - it couples this filter to a specific error selector, and a
    // closed window is a perfectly normal state, not an error worth surfacing. Checking
    // the clock directly also saves an RPC round trip per dead auction.
    if (Number(block.timestamp) > auctionStart + strategy.auction.duration) continue;

    const strategyForQuote = strategyToContractTuple(strategy);

    let preview;
    try {
      [preview] = await quoter.read.previewRebalance([strategyForQuote, outWad, demoResolverAddress(manifest)]);
    } catch (err) {
      if (isNoSurplusError(err)) continue;
      if (isInactiveAquaStrategyError(err)) continue;
      if (isAuctionWindowClosedError(err)) continue;
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
        auctionStartTs: auctionStart,
        initialBalanceIn: reserveQuote,
        executedInWad: preview.surplusWad + 1n,
        staleInWad: 1n,
      },
      nowTs,
    });

    auctions.push({
      strategyHash: strategyKey,
      strategyId: seeded.id,
      maker: seeded.maker as `0x${string}`,
      market,
      dutchPriceNowWad: poolPriceWad.toString(),
      endsAt: auctionStart + strategy.auction.duration,
      oracleGapBps: gapBps.toString(),
      surplusWad: preview.surplusWad.toString(),
      payToResolver: preview.payToResolver.toString(),
      decayWad: strategy.auction.decay.toString(),
      duration: strategy.auction.duration,
      antiSandwichPeriod: strategy.auction.antiSandwichPeriod,
      auctionStart,
    });

    if (evaluation.bestSettleTs > nowTs) {
      // bestSettleTs available for UI; endsAt already set from auction duration
    }
  }

  return auctions.sort((a, b) => (BigInt(a.payToResolver) > BigInt(b.payToResolver) ? -1 : 1));
}
