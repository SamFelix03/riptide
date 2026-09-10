import type { PublicClient } from "viem";

import { getRiptideLens, getRiptideQuoter, loadManifest } from "@riptide/contracts";
import {
  DEMO_MARKET,
  QuoteKind,
  assertChainSeeded,
  createDiscoveryProvider,
  quoteAggregate,
  strategyToContractTuple,
  type StrategyCandidate,
} from "@riptide/solver-core";

import type { SolverConfig } from "../config.js";
import { incRequests, recordRpcLatency } from "../metrics.js";

export type QuoteRequest = {
  market: string;
  kind: "ExactInput" | "ExactOutput";
  amount: string;
};

export type QuoteResponse = {
  market: string;
  kind: string;
  amountIn: string;
  amountOut: string;
  feeBps: number;
  sigmaWad: string;
  freshness: {
    indexedBlock: string;
    chainHead: string;
    laggingSeconds: number;
    source: "rpc" | "subgraph";
    refreshedAt: number;
  };
};

function parseKind(kind: string): QuoteKind {
  if (kind === "ExactInput") return QuoteKind.ExactInput;
  if (kind === "ExactOutput") return QuoteKind.ExactOutput;
  throw new Error(`invalid kind: ${kind}`);
}

export async function handleQuote(config: SolverConfig, client: PublicClient, body: QuoteRequest): Promise<QuoteResponse> {
  incRequests();
  const t0 = Date.now();
  const manifest = loadManifest(config.chainId);
  await assertChainSeeded(client, manifest);
  const discovery = createDiscoveryProvider({
    manifest,
    client,
    subgraphUrl: config.subgraphUrl,
    feedAddress: config.chainlinkFeed,
  });

  const { candidates, freshness } = await discovery.listCandidates(body.market);
  recordRpcLatency(Date.now() - t0);

  if (body.market !== DEMO_MARKET) {
    throw new Error(`unsupported market: ${body.market}`);
  }

  const kind = parseKind(body.kind);
  const amount = BigInt(body.amount);
  const shortlist = candidates.slice(0, config.maxShortlist);
  const result = quoteAggregate(shortlist, kind, amount);

  return {
    market: body.market,
    kind: body.kind,
    amountIn: result.amountIn.toString(),
    amountOut: result.amountOut.toString(),
    feeBps: result.feeBps,
    sigmaWad: result.sigmaWad.toString(),
    freshness: {
      indexedBlock: freshness.indexedBlock.toString(),
      chainHead: freshness.chainHead.toString(),
      laggingSeconds: freshness.laggingSeconds,
      source: freshness.source,
      refreshedAt: freshness.refreshedAt,
    },
  };
}

export async function refreshCandidates(
  client: PublicClient,
  manifest: ReturnType<typeof loadManifest>,
  candidates: StrategyCandidate[],
): Promise<StrategyCandidate[]> {
  const lens = getRiptideLens(client, manifest.lens);
  const quoter = getRiptideQuoter(client, manifest.quoter);
  const refreshed: StrategyCandidate[] = [];

  for (const c of candidates) {
    const [state, quote] = await Promise.all([
      lens.read.strategyState([c.strategy.maker, c.orderHash, c.strategy.baseToken, c.strategy.quoteToken]),
      quoter.read.quoteSwap([
        strategyToContractTuple({
          ...c.strategy,
          reserveBaseWad: c.strategy.reserveBaseWad,
          reserveQuoteWad: c.strategy.reserveQuoteWad,
        }),
        0,
        1_000_000_000_000_000_000n,
      ]),
    ]);

    refreshed.push({
      ...c,
      reserveBaseWad: c.strategy.reserveBaseWad,
      reserveQuoteWad: c.strategy.reserveQuoteWad,
      aquaBase: BigInt(state.aquaBase),
      aquaQuote: BigInt(state.aquaQuote),
      feeBps: Number(quote[2]),
      sigmaWad: BigInt(quote[3]),
      swapVersion: BigInt(state.runtime.version),
    });
  }

  return refreshed;
}

export { type StrategyCandidate };
