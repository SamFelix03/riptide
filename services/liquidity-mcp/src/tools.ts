import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";

import { getRiptideQuoter, loadManifest } from "@riptide/contracts";
import {
  DEMO_MARKET,
  QuoteKind,
  assertChainSeeded,
  createDiscoveryProvider,
  queryProtocolStats,
  queryRecaptureByMarket,
  scanProtocolFromRpc,
  strategyToContractTuple,
} from "@riptide/solver-core";

import type { LiquidityMcpConfig } from "./config.js";
import { graphGatewaySubgraphUrl } from "./config.js";
import { queryDexPoolQuote, type DexLiquidityQuote } from "./dex-subgraph/client.js";

export type ExecutableLiquidityResult = {
  market: string;
  kind: string;
  amountIn: string;
  amountOut: string;
  feeBpsApplied: number;
  sigmaWad: string;
  indexedBlock: number;
  strategies: Array<{ id: string; strategyKey: string; amountIn: string; amountOut: string; feeBps: number }>;
};

export type RecaptureStatsResult = {
  indexedBlock: number;
  totalFillVolume: string;
  totalRecapture: string;
  fillCount: string;
  rebalanceCount: string;
  perMarket: Array<{ marketId: string; fillVolume: string; recaptureVolume: string }>;
};

export type CompareLiquidityResult = {
  riptide: ExecutableLiquidityResult;
  dex: DexLiquidityQuote | null;
  delta: { amountOutDiff: string; feeBpsDiff: number } | null;
  indexedBlock: number;
  dexSource: string | null;
  reason?: string;
};

function parseKind(kind: string): QuoteKind {
  if (kind === "ExactInput") return QuoteKind.ExactInput;
  if (kind === "ExactOutput") return QuoteKind.ExactOutput;
  throw new Error(`invalid kind: ${kind}`);
}

export async function getRiptideExecutableLiquidity(
  config: LiquidityMcpConfig,
  market: string,
  kind: string,
  amountWad: bigint,
): Promise<ExecutableLiquidityResult> {
  if (market !== DEMO_MARKET) throw new Error(`unsupported market: ${market}`);

  const client = createPublicClient({ chain: { ...foundry, id: config.chainId }, transport: http(config.rpcUrl) });
  const manifest = loadManifest(config.chainId);
  await assertChainSeeded(client, manifest);

  const discovery = createDiscoveryProvider({
    manifest,
    client,
    subgraphUrl: config.subgraphUrl,
  });
  const { candidates, freshness } = await discovery.listCandidates(market);
  const quoter = getRiptideQuoter(client, manifest.quoter);
  const quoteKind = parseKind(kind);

  const strategies: ExecutableLiquidityResult["strategies"] = [];
  let totalIn = 0n;
  let totalOut = 0n;
  let feeBps = 0;
  let sigmaWad = 0n;

  const perCandidate = candidates.length > 0 ? amountWad / BigInt(candidates.length) : amountWad;
  let remainder = amountWad - perCandidate * BigInt(Math.max(candidates.length, 1));

  for (const c of candidates) {
    const slice = perCandidate + (remainder > 0n ? 1n : 0n);
    if (remainder > 0n) remainder -= 1n;
    if (slice === 0n) continue;

    const tuple = strategyToContractTuple({
      ...c.strategy,
      reserveBaseWad: c.reserveBaseWad,
      reserveQuoteWad: c.reserveQuoteWad,
    });
    const qKind = quoteKind === QuoteKind.ExactInput ? 0 : 1;
    const quote = await quoter.read.quoteSwap([tuple, qKind, slice]);
    const amountIn = quoteKind === QuoteKind.ExactInput ? slice : BigInt(quote[0]);
    const amountOut = quoteKind === QuoteKind.ExactInput ? BigInt(quote[1]) : slice;

    totalIn += amountIn;
    totalOut += amountOut;
    feeBps = Number(quote[2]);
    sigmaWad = BigInt(quote[3]);

    strategies.push({
      id: c.id,
      strategyKey: c.strategyKey,
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      feeBps: Number(quote[2]),
    });
  }

  return {
    market,
    kind,
    amountIn: totalIn.toString(),
    amountOut: totalOut.toString(),
    feeBpsApplied: feeBps,
    sigmaWad: sigmaWad.toString(),
    indexedBlock: Number(freshness.indexedBlock),
    strategies,
  };
}

export async function getRiptideRecaptureStats(config: LiquidityMcpConfig): Promise<RecaptureStatsResult> {
  const client = createPublicClient({ chain: { ...foundry, id: config.chainId }, transport: http(config.rpcUrl) });
  const manifest = loadManifest(config.chainId);

  if (!config.subgraphUrl) {
    const { stats } = await scanProtocolFromRpc(client, manifest);
    return {
      indexedBlock: Number(stats.indexedBlock),
      totalFillVolume: stats.totalFillVolume,
      totalRecapture: stats.totalRecapture,
      fillCount: stats.fillCount,
      rebalanceCount: stats.rebalanceCount,
      perMarket: stats.perMarket.map((m) => ({
        marketId: m.marketId,
        fillVolume: m.fillVolume,
        recaptureVolume: m.recaptureVolume,
      })),
    };
  }

  const [{ _meta, protocol }, markets] = await Promise.all([
    queryProtocolStats(config.subgraphUrl, String(config.chainId)),
    queryRecaptureByMarket(config.subgraphUrl),
  ]);

  return {
    indexedBlock: _meta.block.number,
    totalFillVolume: protocol?.totalFillVolume ?? "0",
    totalRecapture: protocol?.totalRecapture ?? "0",
    fillCount: protocol?.fillCount ?? "0",
    rebalanceCount: protocol?.rebalanceCount ?? "0",
    perMarket: markets.map((m) => ({
      marketId: m.id,
      fillVolume: m.fillVolume,
      recaptureVolume: m.recaptureVolume,
    })),
  };
}

export async function compareLiquidityVsDex(
  config: LiquidityMcpConfig,
  market: string,
  kind: string,
  amountWad: bigint,
): Promise<CompareLiquidityResult> {
  const riptide = await getRiptideExecutableLiquidity(config, market, kind, amountWad);

  if (!config.graphApiKey) {
    return {
      riptide,
      dex: null,
      delta: null,
      indexedBlock: riptide.indexedBlock,
      dexSource: null,
      reason: "GRAPH_API_KEY not configured",
    };
  }

  const gatewayUrl = graphGatewaySubgraphUrl(config.graphApiKey, config.dexSubgraphId);
  const dex = await queryDexPoolQuote(gatewayUrl, amountWad, config.dexPoolId);

  return {
    riptide,
    dex,
    delta: {
      amountOutDiff: (BigInt(riptide.amountOut) - BigInt(dex.amountOut)).toString(),
      feeBpsDiff: riptide.feeBpsApplied - dex.feeBps,
    },
    indexedBlock: riptide.indexedBlock,
    dexSource: dex.source,
  };
}
