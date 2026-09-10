import type { PublicClient } from "viem";
import { getAddress } from "viem";

import { riptideBatchExecutorAbi } from "@riptide/contracts";
import type { BatchRoute } from "@riptide/solver-core";

export type SimulateResult =
  | { ok: true; amountIn: bigint; amountOut: bigint }
  | { ok: false; error: string };

/** eth_call execute against a funded payer (integration / Anvil). */
export async function simulateExecute(
  client: PublicClient,
  batchExecutor: `0x${string}`,
  route: BatchRoute,
  from: `0x${string}`,
): Promise<SimulateResult> {
  try {
    const { result } = await client.simulateContract({
      address: getAddress(batchExecutor),
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
      account: getAddress(from),
    });

    const [amountIn, amountOut] = result as [bigint, bigint];
    return { ok: true, amountIn, amountOut };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
