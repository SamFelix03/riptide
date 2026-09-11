import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

import { createRpcTransport } from "@riptide/contracts";
import { ChainNotSeededError } from "@riptide/solver-core";

import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";
import { submitSettleRebalance } from "./submit.js";
import { scanOpportunities } from "./watch.js";

const SEED_BACKOFF_MS = 30_000;

export async function runIteration(config = loadConfig()): Promise<number> {
  const account = privateKeyToAccount(config.resolverPrivateKey);
  const chain = { ...foundry, id: config.chainId };
  const transport = createRpcTransport({ rpcUrl: config.rpcUrl, rpcUrlFallback: config.rpcUrlFallback });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ chain, transport, account });

  const opportunities = await scanOpportunities(publicClient, config.chainId, config.priceGapBps, 1_000_000_000_000_000_000n, config.subgraphUrl);
  let settled = 0;

  for (const opp of opportunities) {
    if (opp.payToResolver < config.minProfitWad) continue;

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const maxInWad = opp.strategy.reserveQuoteWad;

    try {
      await submitSettleRebalance(publicClient, walletClient, config.chainId, {
        maker: opp.maker,
        strategy: opp.strategy,
        outWad: opp.outWad,
        maxInWad,
        deadline,
      });
      console.log(
        JSON.stringify({
          event: "RebalanceSettled",
          strategyId: opp.strategyId,
          payToResolver: opp.payToResolver.toString(),
          surplusWad: opp.surplusWad.toString(),
          gapBps: opp.gapBps.toString(),
        }),
      );
      settled += 1;
    } catch (err) {
      console.error(`settle failed for ${opp.strategyId}:`, err instanceof Error ? err.message : err);
    }
  }

  return settled;
}

let stopping = false;
let seedWarningLogged = false;

export function requestStop(): void {
  stopping = true;
}

export async function main(): Promise<void> {
  const config = loadConfig();
  startHealthServer(config);
  console.log(`resolver-bot starting chainId=${config.chainId} poll=${config.pollIntervalMs}ms`);

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
      console.error("resolver-bot iteration failed:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
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
