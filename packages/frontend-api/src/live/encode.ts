import { encodeFunctionData } from "viem";
import type { Strategy } from "@riptide/strategy-sdk";
import { marketId } from "@riptide/strategy-sdk";

import {
  riptideAuctionSettlerAbi,
  riptideDemoTokenAbi,
  riptideRebalanceRouterAbi,
  riptideSwapVMRouterAbi,
  type DeploymentManifest,
} from "@riptide/contracts";
import { strategyToContractTuple } from "@riptide/solver-core";

import type { TxPlan, TxPlanStep } from "../types.js";

const aquaAbi = [
  {
    type: "function",
    name: "ship",
    inputs: [
      { name: "router", type: "address" },
      { name: "order", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "dock",
    inputs: [
      { name: "router", type: "address" },
      { name: "orderHash", type: "bytes32" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const chainlinkFeedAbi = [
  {
    type: "function",
    name: "setRound",
    inputs: [
      { name: "answer_", type: "int256" },
      { name: "updatedAt_", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** Default skew from `tools/demo/skew-oracle.mjs` — 5000 USD with 8 decimals. */
export const DEMO_ORACLE_SKEW_ANSWER = 500_000_000_000n;

export function buildSkewOracleCalldata(answer: bigint, updatedAt: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: chainlinkFeedAbi,
    functionName: "setRound",
    args: [answer, updatedAt],
  });
}

export function buildSkewOracleTxPlan(
  feed: `0x${string}`,
  answer: bigint,
  updatedAt: bigint,
): TxPlan {
  const data = buildSkewOracleCalldata(answer, updatedAt);
  return {
    to: feed,
    data,
    steps: [{ to: feed, data, label: "Skew demo Chainlink feed" }],
    sendable: true,
    description: "Inject oracle drift to surface rebalance auctions (local demo)",
  };
}

export function buildSettleCalldata(
  maker: `0x${string}`,
  strategy: Strategy,
  outWad: bigint,
  maxIn: bigint,
  deadline: number,
): `0x${string}` {
  return encodeFunctionData({
    abi: riptideAuctionSettlerAbi,
    functionName: "settleRebalance",
    args: [maker, strategyToContractTuple(strategy), outWad, maxIn, deadline],
  });
}

export function buildShipTxPlan(
  manifest: DeploymentManifest,
  strategy: Strategy,
  swapOrderBytes: `0x${string}`,
  strategyKey: `0x${string}`,
  swapOrderHash: `0x${string}`,
  sendable: boolean,
  rebalanceLeg?: {
    orderBytes: `0x${string}`;
    orderHash: `0x${string}`;
    auctionStart: number;
  },
): TxPlan {
  const tokens = [strategy.baseToken, strategy.quoteToken] as const;
  const amounts = [strategy.reserveBaseWad, strategy.reserveQuoteWad] as const;
  const mkt = marketId(strategy.baseToken, strategy.quoteToken);
  const tuple = strategyToContractTuple(strategy);

  const steps: TxPlanStep[] = [
    {
      to: strategy.baseToken,
      data: encodeFunctionData({
        abi: riptideDemoTokenAbi,
        functionName: "approve",
        args: [manifest.aqua, strategy.reserveBaseWad],
      }),
      label: "Approve base token for Aqua",
    },
    {
      to: strategy.quoteToken,
      data: encodeFunctionData({
        abi: riptideDemoTokenAbi,
        functionName: "approve",
        args: [manifest.aqua, strategy.reserveQuoteWad],
      }),
      label: "Approve quote token for Aqua",
    },
    {
      to: manifest.aqua,
      data: encodeFunctionData({
        abi: aquaAbi,
        functionName: "ship",
        args: [manifest.swapRouter, swapOrderBytes, [...tokens], [...amounts]],
      }),
      label: "Aqua.ship swap order",
    },
    {
      to: manifest.swapRouter,
      data: encodeFunctionData({
        abi: riptideSwapVMRouterAbi,
        functionName: "registerStrategy",
        args: [strategyKey, swapOrderHash, tuple, strategy.maker],
      }),
      label: "Register strategy on swap router",
    },
  ];

  if (rebalanceLeg) {
    steps.push(
      {
        to: manifest.aqua,
        data: encodeFunctionData({
          abi: aquaAbi,
          functionName: "ship",
          args: [manifest.rebalanceRouter, rebalanceLeg.orderBytes, [...tokens], [...amounts]],
        }),
        label: "Aqua.ship rebalance order",
      },
      {
        to: manifest.rebalanceRouter,
        data: encodeFunctionData({
          abi: riptideRebalanceRouterAbi,
          functionName: "registerStrategy",
          args: [strategyKey, swapOrderHash, mkt],
        }),
        label: "Register swap order on rebalance router",
      },
      {
        to: manifest.rebalanceRouter,
        data: encodeFunctionData({
          abi: riptideRebalanceRouterAbi,
          functionName: "registerStrategy",
          args: [strategyKey, rebalanceLeg.orderHash, mkt],
        }),
        label: "Register rebalance order on rebalance router",
      },
      {
        to: manifest.rebalanceRouter,
        data: encodeFunctionData({
          abi: riptideRebalanceRouterAbi,
          functionName: "setRebalanceAuctionStart",
          args: [strategyKey, rebalanceLeg.auctionStart],
        }),
        label: "Set rebalance auction start",
      },
    );
  }

  return {
    to: steps[0]!.to,
    data: steps[0]!.data,
    steps,
    sendable,
    description: rebalanceLeg
      ? "Ship strategy: approve + Aqua.ship (swap + rebalance) + register both + auction start"
      : "Ship strategy: approve + Aqua.ship + registerStrategy (swap only)",
  };
}

export function buildDockTxPlan(
  manifest: DeploymentManifest,
  maker: `0x${string}`,
  orderHash: `0x${string}`,
  sendable: boolean,
): TxPlan {
  const step: TxPlanStep = {
    to: manifest.aqua,
    data: encodeFunctionData({
      abi: aquaAbi,
      functionName: "dock",
      args: [manifest.swapRouter, orderHash, [manifest.demoTokens.base, manifest.demoTokens.quote]],
    }),
    label: "Aqua.dock strategy",
  };

  return {
    to: step.to,
    data: step.data,
    steps: [step],
    sendable,
    description: `Dock strategy for ${maker}`,
  };
}
