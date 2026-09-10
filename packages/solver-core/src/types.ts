import type { Strategy } from "@riptide/strategy-sdk";

export enum QuoteKind {
  ExactInput = 0,
  ExactOutput = 1,
}

export type FreshnessMeta = {
  indexedBlock: bigint;
  chainHead: bigint;
  laggingSeconds: number;
  source: "rpc" | "subgraph";
  refreshedAt: number;
};

export type StrategyCandidate = {
  id: string;
  strategy: Strategy;
  strategyKey: `0x${string}`;
  orderHash: `0x${string}`;
  reserveBaseWad: bigint;
  reserveQuoteWad: bigint;
  feeBps: number;
  sigmaWad: bigint;
  aquaBase: bigint;
  aquaQuote: bigint;
  swapVersion: bigint;
};

export type FillAllocation = {
  candidateId: string;
  strategyKey: `0x${string}`;
  maker: `0x${string}`;
  amount: bigint;
  amountIn: bigint;
  amountOut: bigint;
  feeBps: number;
  expectedVersion: bigint;
};

export type RouteCertificate = {
  fills: FillAllocation[];
  indexedBlock: bigint;
  refreshedAt: number;
};

export type OptimizedRoute = {
  kind: QuoteKind;
  totalAmountIn: bigint;
  totalAmountOut: bigint;
  fills: FillAllocation[];
  certificate: RouteCertificate;
};

export type BatchFillRequest = {
  order: `0x${string}`;
  maker: `0x${string}`;
  strategyKey: `0x${string}`;
  expectedVersion: bigint;
  amount: bigint;
};

export type BatchRoute = {
  base: `0x${string}`;
  quote: `0x${string}`;
  kind: QuoteKind;
  payer: `0x${string}`;
  recipient: `0x${string}`;
  refundRecipient: `0x${string}`;
  deadline: number;
  salt: `0x${string}`;
  aggregateLimit: bigint;
  fills: BatchFillRequest[];
};

export const MAX_FILLS = 8;

export type MarketId = string;
