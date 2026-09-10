import { createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

import { createRpcTransport } from "@riptide/contracts";
import { ChainNotSeededError } from "@riptide/solver-core";

import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";
import { observeAllStrategies } from "./observe.js";

const SEED_BACKOFF_MS = 30_000;

export async function runIteration(config = loadConfig()): Promise<number> {
  const account = privateKeyToAccount(config.governedIndexerKey);
  const chain = { ...foundry, id: config.chainId };
  const transport = createRpcTransport({ rpcUrl: config.rpcUrl, rpcUrlFallback: config.rpcUrlFallback });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ chain, transport, account });

  const results = await observeAllStrategies(publicClient, walletClient, config);

  for (const r of results) {
    console.log(
      JSON.stringify({
        event: "VolatilityObserved",
        strategyId: r.strategyId,
        strategyKey: r.strategyKey,
        sigmaBefore: r.sigmaBefore.toString(),
        sigmaAfter: r.sigmaAfter.toString(),
      }),
    );
  }

  return results.length;
}

let stopping = false;
let seedWarningLogged = false;

export function requestStop(): void {
  stopping = true;
}

export async function main(): Promise<void> {
  const config = loadConfig();
  startHealthServer(config);
  console.log(`vol-indexer starting chainId=${config.chainId} poll=${config.pollIntervalMs}ms`);

  while (!stopping) {
    try {
      await runIteration(config);
      seedWarningLogged = false;
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    } catch (err) {
      if (err instanceof ChainNotSeededError) {
        if (!seedWarningLogged) {
          console.warn(`${err.message} — retrying in ${SEED_BACKOFF_MS / 1000}s`);
          seedWarningLogged = true;
        }
        await new Promise((r) => setTimeout(r, SEED_BACKOFF_MS));
        continue;
      }
      throw err;
    }
  }
}

if (process.argv[1]?.endsWith("main.js") || process.argv[1]?.endsWith("main.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    requestStop();
  });
}
