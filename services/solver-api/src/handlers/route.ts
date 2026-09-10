import type { PublicClient } from "viem";
import { keccak256, toHex } from "viem";

import { getRiptideSwapVMRouter, loadManifest } from "@riptide/contracts";
import {
  DEMO_MARKET,
  QuoteKind,
  SWAP_ORDER_PROGRAM_DEADLINE,
  aggregateLimitForKind,
  assertChainSeeded,
  attachExpectedVersions,
  buildBatchRoute,
  createDiscoveryProvider,
  encodeExecuteCalldata,
  encodeOrderBytes,
  optimize,
  strategyToContractTuple,
} from "@riptide/solver-core";

import type { SolverConfig } from "../config.js";
import { incRequests, recordRpcLatency, recordSimulate } from "../metrics.js";
import { refreshCandidates, type QuoteRequest } from "./quote.js";
import { simulateExecute } from "../simulate.js";

export type RouteRequest = QuoteRequest & {
  payer?: `0x${string}`;
  recipient?: `0x${string}`;
};

export type RouteResponse = {
  calldata: `0x${string}`;
  to: `0x${string}`;
  amountIn: string;
  amountOut: string;
  fills: Array<{
    candidateId: string;
    maker: `0x${string}`;
    strategyKey: `0x${string}`;
    amount: string;
    amountIn: string;
    amountOut: string;
    feeBps: number;
    expectedVersion: string;
  }>;
  freshness: {
    indexedBlock: string;
    chainHead: string;
    laggingSeconds: number;
    source: "rpc" | "subgraph";
    refreshedAt: number;
  };
  sendable: true;
};

function parseKind(kind: string): QuoteKind {
  if (kind === "ExactInput") return QuoteKind.ExactInput;
  if (kind === "ExactOutput") return QuoteKind.ExactOutput;
  throw new Error(`invalid kind: ${kind}`);
}

/** Anvil account #4 — matches demo taker / resolver role. */
const DEFAULT_TAKER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as `0x${string}`;

export async function handleRoute(config: SolverConfig, client: PublicClient, body: RouteRequest): Promise<RouteResponse> {
  incRequests();
  const t0 = Date.now();
  const manifest = loadManifest(config.chainId);

  if (body.market !== DEMO_MARKET) {
    throw new Error(`unsupported market: ${body.market}`);
  }

  await assertChainSeeded(client, manifest);

  const discovery = createDiscoveryProvider({
    manifest,
    client,
    subgraphUrl: config.subgraphUrl,
    feedAddress: config.chainlinkFeed,
  });

  const { candidates, freshness: initialFreshness } = await discovery.listCandidates(body.market);
  const blockNumber = initialFreshness.indexedBlock;
  const kind = parseKind(body.kind);
  const totalAmount = BigInt(body.amount);

  const shortlisted = candidates.slice(0, config.maxShortlist);
  const draft = optimize({
    candidates: shortlisted,
    kind,
    totalAmount,
    indexedBlock: blockNumber,
    refreshedAt: Date.now(),
  });

  const activeIds = new Set(draft.fills.map((f) => f.candidateId));
  const toRefresh = shortlisted.filter((c) => activeIds.has(c.id));
  const refreshed = await refreshCandidates(client, manifest, toRefresh);
  recordRpcLatency(Date.now() - t0);

  const route = optimize({
    candidates: refreshed,
    kind,
    totalAmount,
    indexedBlock: blockNumber,
    refreshedAt: Date.now(),
  });

  const certificate = attachExpectedVersions(route.fills, refreshed, blockNumber, Date.now());
  route.certificate = certificate;
  route.fills = certificate.fills;

  const swapRouter = getRiptideSwapVMRouter(client, manifest.swapRouter);
  const head = await client.getBlock();
  const routeDeadline = Number(head.timestamp + 3600n);
  const orders = new Map<string, `0x${string}`>();

  for (const fill of route.fills) {
    const c = refreshed.find((x) => x.id === fill.candidateId)!;
    const order = await swapRouter.read.buildSwapOrder([
      c.strategy.maker,
      strategyToContractTuple({
        ...c.strategy,
        reserveBaseWad: c.strategy.reserveBaseWad,
        reserveQuoteWad: c.strategy.reserveQuoteWad,
      }),
      SWAP_ORDER_PROGRAM_DEADLINE,
    ]);
    orders.set(fill.candidateId, encodeOrderBytes(order));
  }

  const payer = body.payer ?? DEFAULT_TAKER;
  const recipient = body.recipient ?? payer;
  const salt = keccak256(toHex(Date.now()));

  const batchRoute = buildBatchRoute({
    base: manifest.demoTokens.base,
    quote: manifest.demoTokens.quote,
    kind,
    payer,
    recipient,
    refundRecipient: payer,
    deadline: routeDeadline,
    salt,
    aggregateLimit: aggregateLimitForKind(kind, {
      amountIn: route.totalAmountIn,
      amountOut: route.totalAmountOut,
    }),
    fills: route.fills,
    orders,
  });

  const sim = await simulateExecute(client, manifest.batchExecutor, batchRoute, payer);
  recordSimulate(sim.ok);
  if (!sim.ok) {
    throw new Error(`simulation failed: ${sim.error}`);
  }

  const calldata = encodeExecuteCalldata(batchRoute);

  return {
    calldata,
    to: manifest.batchExecutor,
    amountIn: route.totalAmountIn.toString(),
    amountOut: route.totalAmountOut.toString(),
    fills: route.fills.map((f) => ({
      candidateId: f.candidateId,
      maker: f.maker,
      strategyKey: f.strategyKey,
      amount: f.amount.toString(),
      amountIn: f.amountIn.toString(),
      amountOut: f.amountOut.toString(),
      feeBps: f.feeBps,
      expectedVersion: f.expectedVersion.toString(),
    })),
    freshness: {
      indexedBlock: initialFreshness.indexedBlock.toString(),
      chainHead: initialFreshness.chainHead.toString(),
      laggingSeconds: initialFreshness.laggingSeconds,
      source: initialFreshness.source,
      refreshedAt: Date.now(),
    },
    sendable: true,
  };
}
