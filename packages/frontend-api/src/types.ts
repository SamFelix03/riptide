export type MarketId = string;

export type QuoteKind = "ExactInput" | "ExactOutput";

export type Freshness = {
  indexedBlock: string;
  chainHead: string;
  laggingSeconds: number;
  source: "rpc" | "subgraph";
  refreshedAt?: number;
};

export type Market = {
  id: MarketId;
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  baseSymbol: string;
  quoteSymbol: string;
  marketHash: `0x${string}`;
};

export type StrategyView = {
  id: string;
  strategyKey: `0x${string}`;
  strategyHash: `0x${string}`;
  maker: `0x${string}`;
  market: MarketId;
  reserveBaseWad: string;
  reserveQuoteWad: string;
  feeBps: number;
  sigmaWad: string;
  active: boolean;
  version: string;
};

export type StrategyDetail = StrategyView & {
  policyHash: `0x${string}`;
  aquaBase: string;
  aquaQuote: string;
  cumulativeRecapture: string;
};

export type SwapQuote = {
  market: MarketId;
  kind: QuoteKind;
  amountIn: string;
  amountOut: string;
  feeBpsApplied: number;
  sigmaWad: string;
  effPrice: string;
  freshness: Freshness;
};

export type RouteLimits = {
  slippageBps?: number;
  deadline?: number;
  recipient?: `0x${string}`;
  payer?: `0x${string}`;
};

export type TxPlanStep = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
  label: string;
};

export type RouteFill = {
  candidateId: string;
  maker: `0x${string}`;
  strategyKey: `0x${string}`;
  amountIn: string;
  amountOut: string;
  feeBps: number;
  expectedVersion: string;
};

export type TxPlan = {
  to: `0x${string}`;
  data: `0x${string}`;
  steps: TxPlanStep[];
  sendable: boolean;
  description: string;
  /** Optional `eth_call` sender for wallet-dependent plans (e.g. settleRebalance). */
  from?: `0x${string}`;
  /** Solver fill allocations when this plan is a taker route. */
  fills?: RouteFill[];
  amountIn?: string;
  amountOut?: string;
  freshness?: Freshness;
};

export type Auction = {
  strategyHash: `0x${string}`;
  strategyId: string;
  maker: `0x${string}`;
  market: MarketId;
  dutchPriceNowWad: string;
  endsAt: number;
  oracleGapBps: string;
  surplusWad: string;
  payToResolver: string;
  decayWad: string;
  duration: number;
  antiSandwichPeriod: number;
  auctionStart: number;
};

export type RebalancePreview = {
  surplusWad: string;
  payToResolver: string;
  retainToLP: string;
  auctionPriceNowWad: string;
  /** Full quote input required for the rebalance swap (stale + surplus). */
  amountInWad: string;
  /** Upper bound passed to `settleRebalance` — includes slippage headroom. */
  maxInWad: string;
  profitable: boolean;
};

export type ControllerTelemetry = {
  maker: `0x${string}`;
  strategyHash: `0x${string}`;
  sigmaWad: string;
  feeTarget: number;
  feeReported: number;
  integral: string;
  indexedBlock: string;
};

export type RecaptureStatsScope = "protocol" | MarketId;

export type RestoreDemoResult = {
  restored: string[];
  skipped: string[];
  txHashes: `0x${string}`[];
  /** True when manifest changed and the local subgraph was redeployed to match. */
  subgraphRedeployed?: boolean;
  subgraphIndexedBlock?: string;
};

export type RedeploySubgraphResult = {
  subgraphUrl: string;
  indexedBlock: string;
};

export type OpenDemoAuctionsResult = {
  auctionWindowsReset: string[];
  txHashes: `0x${string}`[];
};

export type RecaptureStats = {
  scope: RecaptureStatsScope;
  totalRecapture: string;
  totalFillVolume: string;
  paidToResolvers: string;
  perMarket: Array<{ marketId: MarketId; recaptureVolume: string; fillVolume: string }>;
  indexedBlock: string;
};

export type EventFeedFilter = {
  market?: MarketId;
  limit?: number;
};

export type EventFeedItem =
  | {
      type: "SwapFilled";
      id: string;
      market: MarketId;
      strategyKey: string;
      amountIn: string;
      amountOut: string;
      feeBpsApplied: number;
      blockNumber: string;
      timestamp: string;
      txHash: string;
    }
  | {
      type: "RebalanceSettled";
      id: string;
      market: MarketId;
      strategyKey: string;
      surplusWad: string;
      payToResolver: string;
      retainToLP: string;
      blockNumber: string;
      timestamp: string;
      txHash: string;
    }
  | {
      type: "FeeControllerUpdated";
      id: string;
      strategyKey: string;
      sigmaWad: string;
      feeTarget: number;
      feeReported: number;
      blockNumber: string;
      timestamp: string;
    };

/** One atomic multi-strategy taker settlement (RiptideBatchExecutor.RouteExecuted). */
export type RouteView = {
  routeId: string;
  txHash: string;
  blockNumber: string;
  timestamp: string;
  payer: string;
  recipient: string;
  kind: "ExactInput" | "ExactOutput";
  amountIn: string;
  amountOut: string;
  limit: string;
  fillCount: number;
};
