import { getAddress } from "viem";
import { marketId } from "@riptide/strategy-sdk";

import type {
  Auction,
  ControllerTelemetry,
  EventFeedItem,
  Freshness,
  Market,
  RecaptureStats,
  StrategyDetail,
  StrategyView,
  SwapQuote,
  TxPlan,
} from "../types.js";

const WAD = 1_000_000_000_000_000_000n;
const FIXED_BLOCK = "125";
const FIXED_CHAIN_HEAD = "130";
const FIXED_TS = 1_700_000_000;

/** Browser-safe static slice of deployments/31337.json for mock fixtures. */
const FIXTURE_MANIFEST = {
  batchExecutor: getAddress("0x8a791620dd6260079bf849dc5567adc3f2fdc318"),
  demoTokens: {
    base: getAddress("0x610178da211fef7d417bc0e6fed39f05609ad788"),
    quote: getAddress("0xb7f8bc63bbcad18155201308c8f3540b07f84f5e"),
  },
  seededStrategies: [
    { id: "S1", maker: getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8"), strategyKey: "0x3c8e904cdb19937d60d41c8d984b1a8803ad6e0891b4f9e032dcec2a22c2c7f5" },
    { id: "S2", maker: getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"), strategyKey: "0xbd19ff506d92b45639170e62f1a12073921a4358c3ccd05d4584519f78d65103" },
    { id: "S3", maker: getAddress("0x90f79bf6eb2c4f870365e785982e1f101e93b906"), strategyKey: "0x53c8a5ff8e9eee17be03169c30dedc5882673fcdd4fbdb8a32244385ed269978" },
  ],
};

const manifest = FIXTURE_MANIFEST;

export const FIXTURE_MARKET: Market = {
  id: "RBASE-RQUOTE",
  baseToken: manifest.demoTokens.base,
  quoteToken: manifest.demoTokens.quote,
  baseSymbol: "RBASE",
  quoteSymbol: "RQUOTE",
  marketHash: marketId(manifest.demoTokens.base, manifest.demoTokens.quote),
};

export const FIXTURE_FRESHNESS: Freshness = {
  indexedBlock: FIXED_BLOCK,
  chainHead: FIXED_CHAIN_HEAD,
  laggingSeconds: 5,
  source: "subgraph",
  refreshedAt: FIXED_TS,
};

function strategyView(seeded: (typeof manifest.seededStrategies)[number], idx: number): StrategyView {
  const reserves = [
    { base: 100n * WAD, quote: 200_000n * WAD, fee: 25, sigma: 50_000_000_000_000_000n },
    { base: 100n * WAD, quote: 200_000n * WAD, fee: 45, sigma: 80_000_000_000_000_000n },
    { base: 100n * WAD, quote: 200_000n * WAD, fee: 65, sigma: 120_000_000_000_000_000n },
  ][idx]!;

  return {
    id: seeded.id,
    strategyKey: seeded.strategyKey as `0x${string}`,
    strategyHash: seeded.strategyKey as `0x${string}`,
    maker: seeded.maker as `0x${string}`,
    market: FIXTURE_MARKET.id,
    reserveBaseWad: reserves.base.toString(),
    reserveQuoteWad: reserves.quote.toString(),
    feeBps: reserves.fee,
    sigmaWad: reserves.sigma.toString(),
    active: true,
    version: "1",
  };
}

export const FIXTURE_STRATEGIES: StrategyView[] = manifest.seededStrategies.map(strategyView);

export const FIXTURE_QUOTE: SwapQuote = {
  market: FIXTURE_MARKET.id,
  kind: "ExactInput",
  amountIn: WAD.toString(),
  amountOut: "1950000000000000000",
  feeBpsApplied: 25,
  sigmaWad: "50000000000000000000",
  effPrice: "1950000",
  freshness: FIXTURE_FRESHNESS,
};

export const FIXTURE_AUCTIONS: Auction[] = [
  {
    strategyHash: manifest.seededStrategies[0]!.strategyKey as `0x${string}`,
    strategyId: "S1",
    maker: manifest.seededStrategies[0]!.maker as `0x${string}`,
    market: FIXTURE_MARKET.id,
    dutchPriceNowWad: "500000000000000000",
    endsAt: FIXED_TS + 3600,
    oracleGapBps: "150",
    surplusWad: "1000000000000000000",
    payToResolver: "30000000000000000",
    decayWad: "995000000000000000",
    duration: 7200,
    antiSandwichPeriod: 600,
    auctionStart: FIXED_TS - 3600,
  },
];

export const FIXTURE_RECAPTURE: RecaptureStats = {
  scope: "protocol",
  totalRecapture: "50000000000000000000",
  totalFillVolume: "1000000000000000000000",
  paidToResolvers: "1500000000000000000",
  perMarket: [{ marketId: FIXTURE_MARKET.id, recaptureVolume: "50000000000000000000", fillVolume: "1000000000000000000000" }],
  indexedBlock: FIXED_BLOCK,
};

export const FIXTURE_EVENTS: EventFeedItem[] = [
  {
    type: "SwapFilled",
    id: "fill-1",
    market: FIXTURE_MARKET.id,
    strategyKey: manifest.seededStrategies[0]!.strategyKey,
    amountIn: WAD.toString(),
    amountOut: "1950000000000000000",
    feeBpsApplied: 25,
    blockNumber: FIXED_BLOCK,
    timestamp: String(FIXED_TS),
    txHash: "0xabc",
  },
  {
    type: "RebalanceSettled",
    id: "reb-1",
    market: FIXTURE_MARKET.id,
    strategyKey: manifest.seededStrategies[1]!.strategyKey,
    surplusWad: "500000000000000000",
    payToResolver: "15000000000000000",
    retainToLP: "485000000000000000",
    blockNumber: FIXED_BLOCK,
    timestamp: String(FIXED_TS),
    txHash: "0xdef",
  },
];

export function fixtureStrategyDetail(view: StrategyView): StrategyDetail {
  return {
    ...view,
    policyHash: view.strategyHash,
    aquaBase: view.reserveBaseWad,
    aquaQuote: view.reserveQuoteWad,
    cumulativeRecapture: "10000000000000000000",
  };
}

export function fixtureTxPlan(description: string): TxPlan {
  return {
    to: manifest.batchExecutor,
    data: "0x",
    steps: [{ to: manifest.batchExecutor, data: "0x", label: description }],
    sendable: false,
    description,
  };
}

export const FIXTURE_CONTROLLER: ControllerTelemetry = {
  maker: manifest.seededStrategies[0]!.maker as `0x${string}`,
  strategyHash: manifest.seededStrategies[0]!.strategyKey as `0x${string}`,
  sigmaWad: "50000000000000000000",
  feeTarget: 2500,
  feeReported: 2500,
  integral: "0",
  indexedBlock: FIXED_BLOCK,
};
