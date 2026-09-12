import type { RiptideFrontendApi } from "@riptide/frontend-api";

import { serializeForJson } from "@/lib/json";

type ApiMethod =
  | "listMarkets"
  | "listStrategies"
  | "getStrategy"
  | "getStrategyPreset"
  | "quoteSwap"
  | "buildSwapRoute"
  | "listOpenAuctions"
  | "previewRebalance"
  | "buildSettleRebalance"
  | "buildDemoOracleSkew"
  | "buildShipStrategy"
  | "buildDockStrategy"
  | "getControllerState"
  | "getRecaptureStats"
  | "streamEvents"
  | "listRoutes"
  | "listResolvers"
  | "getFreshness";

export class ApiClient {
  private async call<M extends ApiMethod>(
    method: M,
    args: unknown[],
  ): Promise<Awaited<ReturnType<RiptideFrontendApi[M]>>> {
    const res = await fetch("/api/riptide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(serializeForJson({ method, args })),
    });
    type Result = Awaited<ReturnType<RiptideFrontendApi[M]>>;
    const body = (await res.json()) as { result?: Result; error?: { message: string; code?: string } };
    if (!res.ok) {
      const err = new Error(body.error?.message ?? `API ${String(method)} failed`) as Error & { code?: string };
      if (body.error?.code) err.code = body.error.code;
      throw err;
    }
    return body.result as Result;
  }

  listMarkets() {
    return this.call("listMarkets", []);
  }
  listStrategies(market: Parameters<RiptideFrontendApi["listStrategies"]>[0], opts?: Parameters<RiptideFrontendApi["listStrategies"]>[1]) {
    return this.call("listStrategies", [market, opts]);
  }
  getStrategy(maker: Parameters<RiptideFrontendApi["getStrategy"]>[0], strategyHash: Parameters<RiptideFrontendApi["getStrategy"]>[1]) {
    return this.call("getStrategy", [maker, strategyHash]);
  }
  getStrategyPreset(maker: Parameters<RiptideFrontendApi["getStrategyPreset"]>[0], strategyHash: Parameters<RiptideFrontendApi["getStrategyPreset"]>[1]) {
    return this.call("getStrategyPreset", [maker, strategyHash]);
  }
  quoteSwap(market: Parameters<RiptideFrontendApi["quoteSwap"]>[0], kind: Parameters<RiptideFrontendApi["quoteSwap"]>[1], amount: Parameters<RiptideFrontendApi["quoteSwap"]>[2]) {
    return this.call("quoteSwap", [market, kind, amount]);
  }
  buildSwapRoute(market: Parameters<RiptideFrontendApi["buildSwapRoute"]>[0], kind: Parameters<RiptideFrontendApi["buildSwapRoute"]>[1], amount: Parameters<RiptideFrontendApi["buildSwapRoute"]>[2], limits: Parameters<RiptideFrontendApi["buildSwapRoute"]>[3]) {
    return this.call("buildSwapRoute", [market, kind, amount, limits]);
  }
  listOpenAuctions(market?: Parameters<RiptideFrontendApi["listOpenAuctions"]>[0]) {
    return this.call("listOpenAuctions", [market]);
  }
  previewRebalance(
    maker: Parameters<RiptideFrontendApi["previewRebalance"]>[0],
    strategy: Parameters<RiptideFrontendApi["previewRebalance"]>[1],
    outWad: Parameters<RiptideFrontendApi["previewRebalance"]>[2],
  ) {
    return this.call("previewRebalance", [maker, strategy, outWad]);
  }
  buildSettleRebalance(
    maker: Parameters<RiptideFrontendApi["buildSettleRebalance"]>[0],
    strategy: Parameters<RiptideFrontendApi["buildSettleRebalance"]>[1],
    outWad: Parameters<RiptideFrontendApi["buildSettleRebalance"]>[2],
    maxIn: Parameters<RiptideFrontendApi["buildSettleRebalance"]>[3],
    deadline: Parameters<RiptideFrontendApi["buildSettleRebalance"]>[4],
    resolver?: Parameters<RiptideFrontendApi["buildSettleRebalance"]>[5],
  ) {
    return this.call("buildSettleRebalance", [maker, strategy, outWad, maxIn, deadline, resolver]);
  }
  buildDemoOracleSkew(skewAnswer?: Parameters<RiptideFrontendApi["buildDemoOracleSkew"]>[0]) {
    return this.call("buildDemoOracleSkew", [skewAnswer]);
  }
  buildShipStrategy(strategy: Parameters<RiptideFrontendApi["buildShipStrategy"]>[0]) {
    return this.call("buildShipStrategy", [strategy]);
  }
  buildDockStrategy(maker: Parameters<RiptideFrontendApi["buildDockStrategy"]>[0], strategyHash: Parameters<RiptideFrontendApi["buildDockStrategy"]>[1]) {
    return this.call("buildDockStrategy", [maker, strategyHash]);
  }
  getControllerState(maker: Parameters<RiptideFrontendApi["getControllerState"]>[0], strategyHash: Parameters<RiptideFrontendApi["getControllerState"]>[1]) {
    return this.call("getControllerState", [maker, strategyHash]);
  }
  getRecaptureStats(scope: Parameters<RiptideFrontendApi["getRecaptureStats"]>[0]) {
    return this.call("getRecaptureStats", [scope]);
  }
  listRoutes(limit = 20) {
    return this.call("listRoutes", [limit]);
  }
  listResolvers(limit = 25) {
    return this.call("listResolvers", [limit]);
  }

  streamEvents(filter: Parameters<RiptideFrontendApi["streamEvents"]>[0]) {
    return this.call("streamEvents", [filter]);
  }
  getFreshness() {
    return this.call("getFreshness", []);
  }
}

export async function simulateTxPlanRemote(txPlan: { to: string; data: string; from?: string }) {
  const res = await fetch("/api/riptide/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(txPlan),
  });
  return res.json();
}
