import "./load-env.js";

import { resolveRuntimeEndpoints, SERVICE_DEFAULTS, SERVICE_PORTS } from "@riptide/contracts";

export type ResolverConfig = {
  rpcUrl: string;
  rpcUrlFallback?: string;
  chainId: number;
  resolverPrivateKey: `0x${string}`;
  minProfitWad: bigint;
  pollIntervalMs: number;
  priceGapBps: bigint;
  port: number;
  subgraphUrl?: string;
  chainlinkFeed?: string;
};

/** Anvil #4 (taker). Override with `RESOLVER_PRIVATE_KEY` on any non-Anvil chain. */
const ANVIL_RESOLVER_KEY =
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as const;

export function loadConfig(): ResolverConfig {
  const { rpcUrl, rpcUrlFallback, chainId, subgraphUrl, chainlinkFeed } = resolveRuntimeEndpoints();
  const resolverPrivateKey = (process.env.RESOLVER_PRIVATE_KEY ?? ANVIL_RESOLVER_KEY) as `0x${string}`;
  const minProfitWad = BigInt(process.env.MIN_PROFIT_WAD ?? SERVICE_DEFAULTS.minProfitWad);
  const pollIntervalMs = Number.parseInt(
    process.env.POLL_INTERVAL_MS ?? String(SERVICE_DEFAULTS.resolverPollIntervalMs),
    10,
  );
  const priceGapBps = BigInt(process.env.PRICE_GAP_BPS ?? SERVICE_DEFAULTS.priceGapBps);
  const port = Number.parseInt(process.env.PORT ?? String(SERVICE_PORTS.resolverBot), 10);

  return {
    rpcUrl,
    rpcUrlFallback,
    chainId,
    resolverPrivateKey,
    minProfitWad,
    pollIntervalMs,
    priceGapBps,
    port,
    subgraphUrl,
    chainlinkFeed,
  };
}
