import type {
  Auction,
  ControllerTelemetry,
  EventFeedFilter,
  EventFeedItem,
  Freshness,
  RestoreDemoResult,
  RouteView,
  RedeploySubgraphResult,
  OpenDemoAuctionsResult,
  Market,
  MarketId,
  QuoteKind,
  RebalancePreview,
  RecaptureStats,
  RecaptureStatsScope,
  RouteLimits,
  StrategyDetail,
  StrategyView,
  SwapQuote,
  TxPlan,
} from "./types.js";
import type { Strategy } from "@riptide/strategy-sdk";

export interface RiptideFrontendApi {
  listMarkets(): Promise<Market[]>;
  listStrategies(market: MarketId, opts?: { forceError?: string }): Promise<StrategyView[]>;
  getStrategy(maker: `0x${string}`, strategyHash: `0x${string}`): Promise<StrategyDetail>;
  getStrategyPreset(maker: `0x${string}`, strategyHash: `0x${string}`): Promise<Strategy>;
  quoteSwap(market: MarketId, kind: QuoteKind, amount: string): Promise<SwapQuote>;
  buildSwapRoute(market: MarketId, kind: QuoteKind, amount: string, limits: RouteLimits): Promise<TxPlan>;
  listOpenAuctions(market?: MarketId): Promise<Auction[]>;
  previewRebalance(
    maker: `0x${string}`,
    strategy: Strategy | `0x${string}`,
    outWad: string,
    resolver?: `0x${string}`,
  ): Promise<RebalancePreview>;
  buildSettleRebalance(
    maker: `0x${string}`,
    strategy: Strategy | `0x${string}`,
    outWad: string,
    maxIn: string,
    deadline: number,
    resolver?: `0x${string}`,
  ): Promise<TxPlan>;
  /** Skew the demo Chainlink feed so oracle–pool gap opens rebalance auctions. */
  buildDemoOracleSkew(skewAnswer?: string): Promise<TxPlan>;
  /** Skew oracle + reset rebalance auction windows on all live demo pools. */
  openDemoAuctions(): Promise<OpenDemoAuctionsResult>;
  buildShipStrategy(strategy: Strategy): Promise<TxPlan>;
  buildDockStrategy(maker: `0x${string}`, strategyHash: `0x${string}`): Promise<TxPlan>;
  /** Re-ship inactive S1/S2/S3 demo pools — no CLI required. */
  restoreDemoStrategies(): Promise<RestoreDemoResult>;
  /** Sync manifest contract addresses and redeploy the local subgraph indexer (local chain only). */
  redeploySubgraph(): Promise<RedeploySubgraphResult>;
  getControllerState(maker: `0x${string}`, strategyHash: `0x${string}`): Promise<ControllerTelemetry>;
  getRecaptureStats(scope: RecaptureStatsScope): Promise<RecaptureStats>;
  streamEvents(filter: EventFeedFilter): Promise<EventFeedItem[]>;
  /** Atomic multi-fill taker settlements through RiptideBatchExecutor. */
  listRoutes(limit?: number): Promise<RouteView[]>;
  getFreshness(): Promise<Freshness>;
}
