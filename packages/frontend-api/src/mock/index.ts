import type { Strategy } from "@riptide/strategy-sdk";

import { RiptideFrontendApiError } from "../errors.js";
import type { RiptideFrontendApi } from "../interface.js";
import type {
  EventFeedFilter,
  MarketId,
  QuoteKind,
  RecaptureStatsScope,
  RouteLimits,
} from "../types.js";
import {
  FIXTURE_AUCTIONS,
  FIXTURE_CONTROLLER,
  FIXTURE_EVENTS,
  FIXTURE_FRESHNESS,
  FIXTURE_MARKET,
  FIXTURE_QUOTE,
  FIXTURE_RECAPTURE,
  FIXTURE_STRATEGIES,
  fixtureStrategyDetail,
  fixtureTxPlan,
} from "./fixtures.js";

export class MockFrontendApi implements RiptideFrontendApi {
  async listMarkets() {
    return [FIXTURE_MARKET];
  }

  async listStrategies(_market: MarketId, opts?: { forceError?: string }) {
    const forced = opts?.forceError;
    if (forced) {
      throw new RiptideFrontendApiError({
        code: forced as import("../errors.js").RiptideErrorCode,
        message:
          {
            RiptideStaleVersion: "Strategy version changed since the route was built. Refresh and try again.",
            RiptideSlippageExceeded: "Slippage limit exceeded for this route.",
            RiptideNoSurplus: "No profitable surplus for this rebalance.",
            RiptideStaleOracleRound: "Oracle price is stale.",
            RiptideDeadlineExpired: "Transaction deadline has passed.",
            RiptideStrategyNotActive: "Strategy is not active or has been docked.",
          }[forced] ?? forced,
      });
    }
    return FIXTURE_STRATEGIES;
  }

  async getStrategy(maker: `0x${string}`, strategyHash: `0x${string}`) {
    const view = FIXTURE_STRATEGIES.find((s) => s.maker === maker && s.strategyHash === strategyHash);
    if (!view) throw new Error("strategy not found");
    return fixtureStrategyDetail(view);
  }

  async getStrategyPreset(maker: `0x${string}`, strategyHash: `0x${string}`) {
    await this.getStrategy(maker, strategyHash);
    return {
      maker,
      baseToken: FIXTURE_MARKET.baseToken,
      quoteToken: FIXTURE_MARKET.quoteToken,
      reserveBaseWad: 100_000_000_000_000_000_000n,
      reserveQuoteWad: 200_000_000_000_000_000_000_000n,
      fee: {
        feeMin: 10_000n,
        feeMax: 50_000n,
        lambda: 990_000_000_000_000_000n,
        kp: 100_000_000_000_000_000n,
        ki: 50_000_000_000_000_000n,
        iMax: 500_000_000_000_000_000n,
        sigmaMin: 5_000_000_000_000_000n,
        sigmaMax: 500_000_000_000_000_000n,
      },
      auction: { beta: 970_000_000_000_000_000n, duration: 7200, decay: 995_000_000_000_000_000n, antiSandwichPeriod: 600 },
      oracle: { feed: "0x0000000000000000000000000000000000000001" as `0x${string}`, decimals: 8, maxStaleness: 3600 },
      feeProvider: "0x0000000000000000000000000000000000000002" as `0x${string}`,
      salt: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    } satisfies Strategy;
  }

  async quoteSwap(market: MarketId, kind: QuoteKind, amount: string) {
    return { ...FIXTURE_QUOTE, market, kind, amountIn: kind === "ExactInput" ? amount : FIXTURE_QUOTE.amountIn };
  }

  async buildSwapRoute(market: MarketId, kind: QuoteKind, amount: string, _limits: RouteLimits) {
    const plan = fixtureTxPlan(`mock swap route ${market} ${kind} ${amount}`);
    return {
      ...plan,
      amountIn: kind === "ExactInput" ? amount : FIXTURE_QUOTE.amountIn,
      amountOut: FIXTURE_QUOTE.amountOut,
      freshness: FIXTURE_FRESHNESS,
      fills: FIXTURE_STRATEGIES.map((s, i) => ({
        candidateId: s.id,
        maker: s.maker,
        strategyKey: s.strategyKey,
        amountIn: (BigInt(kind === "ExactInput" ? amount : FIXTURE_QUOTE.amountIn) / BigInt(FIXTURE_STRATEGIES.length)).toString(),
        amountOut: (BigInt(FIXTURE_QUOTE.amountOut) / BigInt(FIXTURE_STRATEGIES.length + 1 - i || 1)).toString(),
        feeBps: s.feeBps,
        expectedVersion: s.version,
      })),
    };
  }

  async listOpenAuctions(_market?: MarketId) {
    return FIXTURE_AUCTIONS;
  }

  async previewRebalance(
    _maker: `0x${string}`,
    _strategy: Strategy | `0x${string}`,
    _outWad: string,
    _resolver?: `0x${string}`,
  ) {
    return {
      surplusWad: "1000000000000000000",
      payToResolver: "30000000000000000",
      retainToLP: "970000000000000000",
      auctionPriceNowWad: "500000000000000000",
      amountInWad: "2000000000000000000000",
      maxInWad: "2000200000000000000000",
      profitable: true,
    };
  }

  async buildSettleRebalance(
    _maker: `0x${string}`,
    _strategy: Strategy | `0x${string}`,
    _outWad: string,
    _maxIn: string,
    _deadline: number,
    _resolver?: `0x${string}`,
  ) {
    return fixtureTxPlan("mock settle rebalance");
  }

  async buildDemoOracleSkew(_skewAnswer?: string) {
    return fixtureTxPlan("mock skew demo oracle");
  }

  async openDemoAuctions() {
    return { auctionWindowsReset: ["S1", "S2", "S3"], txHashes: [] };
  }

  async buildShipStrategy(_strategy: Strategy) {
    return fixtureTxPlan("mock ship strategy");
  }

  async buildDockStrategy(_maker: `0x${string}`, _strategyHash: `0x${string}`) {
    return fixtureTxPlan("mock dock strategy");
  }

  async restoreDemoStrategies() {
    return {
      restored: ["S1", "S2", "S3"],
      skipped: [],
      txHashes: [],
      subgraphRedeployed: true,
      subgraphIndexedBlock: "999",
    };
  }

  async redeploySubgraph() {
    return { subgraphUrl: "http://localhost:8000/subgraphs/name/riptide/riptide-anvil", indexedBlock: "999" };
  }

  async getControllerState(maker: `0x${string}`, strategyHash: `0x${string}`) {
    if (maker === FIXTURE_CONTROLLER.maker && strategyHash === FIXTURE_CONTROLLER.strategyHash) {
      return FIXTURE_CONTROLLER;
    }
    return FIXTURE_CONTROLLER;
  }

  async getRecaptureStats(scope: RecaptureStatsScope) {
    return { ...FIXTURE_RECAPTURE, scope };
  }

  async streamEvents(_filter: EventFeedFilter) {
    return FIXTURE_EVENTS;
  }

  async getFreshness() {
    return FIXTURE_FRESHNESS;
  }
}

export function createMockFrontendApi(): RiptideFrontendApi {
  return new MockFrontendApi();
}
