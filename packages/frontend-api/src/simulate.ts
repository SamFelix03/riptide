import { createPublicClient } from "viem";
import { foundry } from "viem/chains";

import { createRpcTransport } from "@riptide/contracts";

import type { TxPlan } from "./types.js";
import { decodeRiptideError } from "./errors.js";
import { loadFrontendApiConfig } from "./config.js";

export type SimulationResult = {
  success: boolean;
  returnData?: string;
  error?: { code: string; message: string };
};

export async function simulateTxPlan(txPlan: TxPlan): Promise<SimulationResult> {
  const config = loadFrontendApiConfig();
  const client = createPublicClient({
    chain: { ...foundry, id: config.chainId },
    transport: createRpcTransport({ rpcUrl: config.rpcUrl }),
  });

  try {
    await client.call({
      to: txPlan.to,
      data: txPlan.data,
      ...(txPlan.from ? { account: txPlan.from } : {}),
    });
    return { success: true };
  } catch (err) {
    const decoded = decodeRiptideError(err);
    if (decoded) {
      return { success: false, error: { code: decoded.code, message: decoded.message } };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "SimulationFailed", message } };
  }
}
