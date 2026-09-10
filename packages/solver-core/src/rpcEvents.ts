import type { PublicClient } from "viem";
import { parseEventLogs } from "viem";

import {
  riptideLvrFeeProviderAbi,
  riptideRebalanceRouterAbi,
  riptideSwapVMRouterAbi,
  type DeploymentManifest,
} from "@riptide/contracts";

export type RpcProtocolStats = {
  totalRecapture: string;
  totalFillVolume: string;
  paidToResolvers: string;
  fillCount: string;
  rebalanceCount: string;
  perMarket: Array<{ marketId: string; recaptureVolume: string; fillVolume: string }>;
  indexedBlock: string;
};

export type RpcEventItem =
  | {
      type: "SwapFilled";
      id: string;
      market: string;
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
      market: string;
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

function fromBlock(manifest: DeploymentManifest): bigint {
  return BigInt(Math.max(1, manifest.blockNumber));
}

export async function scanProtocolFromRpc(
  client: PublicClient,
  manifest: DeploymentManifest,
): Promise<{ stats: RpcProtocolStats; events: RpcEventItem[] }> {
  const start = fromBlock(manifest);
  const toBlock = await client.getBlockNumber();

  const [swapLogs, rebalanceLogs, feeLogs] = await Promise.all([
    client.getLogs({ address: manifest.swapRouter, fromBlock: start, toBlock }),
    client.getLogs({ address: manifest.rebalanceRouter, fromBlock: start, toBlock }),
    client.getLogs({ address: manifest.feeProvider, fromBlock: start, toBlock }),
  ]);

  const swaps = parseEventLogs({ abi: riptideSwapVMRouterAbi, logs: swapLogs, eventName: "SwapFilled" });
  const rebalances = parseEventLogs({
    abi: riptideRebalanceRouterAbi,
    logs: rebalanceLogs,
    eventName: "RebalanceSettled",
  });
  const fees = parseEventLogs({
    abi: riptideLvrFeeProviderAbi,
    logs: feeLogs,
    eventName: "FeeControllerUpdated",
  });

  let totalFill = 0n;
  let totalRecapture = 0n;
  let paidToResolvers = 0n;
  const perMarket = new Map<string, { recaptureVolume: bigint; fillVolume: bigint }>();
  const events: RpcEventItem[] = [];

  for (const log of swaps) {
    const amountIn = BigInt(log.args.amountIn ?? 0n);
    const market = String(log.args.marketId ?? "");
    totalFill += amountIn;
    const row = perMarket.get(market) ?? { recaptureVolume: 0n, fillVolume: 0n };
    row.fillVolume += amountIn;
    perMarket.set(market, row);
    events.push({
      type: "SwapFilled",
      id: `${log.transactionHash}-${log.logIndex}`,
      market,
      strategyKey: String(log.args.strategyKey ?? ""),
      amountIn: amountIn.toString(),
      amountOut: BigInt(log.args.amountOut ?? 0n).toString(),
      feeBpsApplied: Number(log.args.feeBpsApplied ?? 0),
      blockNumber: log.blockNumber.toString(),
      timestamp: "0",
      txHash: log.transactionHash,
    });
  }

  for (const log of rebalances) {
    const retain = BigInt(log.args.retainToLPWad ?? 0n);
    const paid = BigInt(log.args.payToResolverWad ?? 0n);
    const market = String(log.args.marketId ?? "");
    totalRecapture += retain;
    paidToResolvers += paid;
    const row = perMarket.get(market) ?? { recaptureVolume: 0n, fillVolume: 0n };
    row.recaptureVolume += retain;
    perMarket.set(market, row);
    events.push({
      type: "RebalanceSettled",
      id: `${log.transactionHash}-${log.logIndex}`,
      market,
      strategyKey: String(log.args.strategyKey ?? ""),
      surplusWad: BigInt(log.args.surplusWad ?? 0n).toString(),
      payToResolver: paid.toString(),
      retainToLP: retain.toString(),
      blockNumber: log.blockNumber.toString(),
      timestamp: "0",
      txHash: log.transactionHash,
    });
  }

  for (const log of fees) {
    events.push({
      type: "FeeControllerUpdated",
      id: `${log.transactionHash}-${log.logIndex}`,
      strategyKey: String(log.args.strategyKey ?? ""),
      sigmaWad: BigInt(log.args.sigmaWad ?? 0n).toString(),
      feeTarget: Number(log.args.feeTarget ?? 0),
      feeReported: Number(log.args.feeReported ?? 0),
      blockNumber: log.blockNumber.toString(),
      timestamp: "0",
    });
  }

  events.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

  return {
    stats: {
      totalRecapture: totalRecapture.toString(),
      totalFillVolume: totalFill.toString(),
      paidToResolvers: paidToResolvers.toString(),
      fillCount: String(swaps.length),
      rebalanceCount: String(rebalances.length),
      perMarket: [...perMarket.entries()].map(([marketId, row]) => ({
        marketId,
        recaptureVolume: row.recaptureVolume.toString(),
        fillVolume: row.fillVolume.toString(),
      })),
      indexedBlock: toBlock.toString(),
    },
    events,
  };
}

export async function strategyRecaptureFromRpc(
  client: PublicClient,
  manifest: DeploymentManifest,
  strategyKey: `0x${string}`,
): Promise<string> {
  const { events } = await scanProtocolFromRpc(client, manifest);
  let total = 0n;
  for (const e of events) {
    if (e.type === "RebalanceSettled" && e.strategyKey.toLowerCase() === strategyKey.toLowerCase()) {
      total += BigInt(e.retainToLP);
    }
  }
  return total.toString();
}
