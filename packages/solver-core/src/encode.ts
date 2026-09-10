import { encodeFunctionData, encodeAbiParameters, parseAbiParameters, concat, getAddress } from "viem";

import { riptideBatchExecutorAbi } from "@riptide/contracts";

import { QuoteKind, type BatchFillRequest, type BatchRoute, type FillAllocation } from "./types.js";

export type EncodeRouteParams = {
  base: `0x${string}`;
  quote: `0x${string}`;
  kind: QuoteKind;
  payer: `0x${string}`;
  recipient: `0x${string}`;
  refundRecipient: `0x${string}`;
  deadline: number;
  salt: `0x${string}`;
  aggregateLimit: bigint;
  fills: FillAllocation[];
  orders: Map<string, `0x${string}`>;
};

export function buildBatchRoute(params: EncodeRouteParams): BatchRoute {
  const fills: BatchFillRequest[] = params.fills.map((f) => {
    const order = params.orders.get(f.candidateId);
    if (!order) throw new Error(`missing order for ${f.candidateId}`);
    return {
      order,
      maker: f.maker,
      strategyKey: f.strategyKey,
      expectedVersion: f.expectedVersion,
      amount: f.amount,
    };
  });

  return {
    base: params.base,
    quote: params.quote,
    kind: params.kind,
    payer: params.payer,
    recipient: params.recipient,
    refundRecipient: params.refundRecipient,
    deadline: params.deadline,
    salt: params.salt,
    aggregateLimit: params.aggregateLimit,
    fills,
  };
}

export function encodeExecuteCalldata(route: BatchRoute): `0x${string}` {
  return encodeFunctionData({
    abi: riptideBatchExecutorAbi,
    functionName: "execute",
    args: [
      {
        base: getAddress(route.base),
        quote: getAddress(route.quote),
        kind: route.kind,
        payer: getAddress(route.payer),
        recipient: getAddress(route.recipient),
        refundRecipient: getAddress(route.refundRecipient),
        deadline: route.deadline,
        salt: route.salt,
        aggregateLimit: route.aggregateLimit,
        fills: route.fills.map((f) => ({
          order: f.order,
          maker: getAddress(f.maker),
          strategyKey: f.strategyKey,
          expectedVersion: f.expectedVersion,
          amount: f.amount,
        })),
      },
    ],
  });
}

export function aggregateLimitForKind(
  kind: QuoteKind,
  totals: { amountIn: bigint; amountOut: bigint },
): bigint {
  // Leave small headroom vs local CPMM so on-chain quotes do not trip slippage guards.
  if (kind === QuoteKind.ExactInput) {
    return totals.amountOut === 0n ? 0n : (totals.amountOut * 9999n) / 10000n;
  }
  return (totals.amountIn * 10001n) / 10000n;
}

export type SwapVmOrder = {
  maker: `0x${string}`;
  traits: bigint;
  data: `0x${string}`;
};

export function encodeOrderBytes(order: SwapVmOrder): `0x${string}` {
  const inner = encodeAbiParameters(parseAbiParameters("address maker, uint256 traits, bytes data"), [
    order.maker,
    BigInt(order.traits),
    order.data,
  ]);
  // Match Solidity abi.encode(ISwapVM.Order): offset head word + ABI struct tail.
  return concat([
    "0x0000000000000000000000000000000000000000000000000000000000000020",
    inner,
  ]);
}

export function strategyToContractTuple(strategy: {
  maker: `0x${string}`;
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  reserveBaseWad: bigint;
  reserveQuoteWad: bigint;
  fee: {
    feeMin: bigint;
    feeMax: bigint;
    lambda: bigint;
    kp: bigint;
    ki: bigint;
    iMax: bigint;
    sigmaMin: bigint;
    sigmaMax: bigint;
  };
  auction: {
    beta: bigint;
    duration: number;
    decay: bigint;
    antiSandwichPeriod: number;
  };
  oracle: { feed: `0x${string}`; decimals: number; maxStaleness: number };
  feeProvider: `0x${string}`;
  salt: `0x${string}`;
}) {
  return {
    maker: strategy.maker,
    baseToken: strategy.baseToken,
    quoteToken: strategy.quoteToken,
    reserveBaseWad: strategy.reserveBaseWad,
    reserveQuoteWad: strategy.reserveQuoteWad,
    fee: {
      feeMin: Number(strategy.fee.feeMin),
      feeMax: Number(strategy.fee.feeMax),
      lambda: strategy.fee.lambda,
      kp: strategy.fee.kp,
      ki: strategy.fee.ki,
      iMax: strategy.fee.iMax,
      sigmaMin: strategy.fee.sigmaMin,
      sigmaMax: strategy.fee.sigmaMax,
    },
    auction: strategy.auction,
    oracle: strategy.oracle,
    feeProvider: strategy.feeProvider,
    salt: strategy.salt,
  };
}
