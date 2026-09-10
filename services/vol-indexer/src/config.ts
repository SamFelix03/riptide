import "./load-env.js";

import { resolveRuntimeEndpoints, SERVICE_DEFAULTS, SERVICE_PORTS } from "@riptide/contracts";

export type VolIndexerConfig = {
  rpcUrl: string;
  rpcUrlFallback?: string;
  chainId: number;
  governedIndexerKey: `0x${string}`;
  priceSourceUrl?: string;
  chainlinkFeed?: string;
  pollIntervalMs: number;
  port: number;
};

/** Anvil #0 (deployer / oracle owner). Override with `GOVERNED_INDEXER_KEY` on testnet. */
const ANVIL_DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

export function loadConfig(): VolIndexerConfig {
  const { rpcUrl, rpcUrlFallback, chainId, chainlinkFeed } = resolveRuntimeEndpoints();
  const governedIndexerKey = (process.env.GOVERNED_INDEXER_KEY ??
    process.env.DEPLOYER_PRIVATE_KEY ??
    ANVIL_DEPLOYER_KEY) as `0x${string}`;
  const priceSourceUrl = process.env.PRICE_SOURCE_URL || undefined;
  const pollIntervalMs = Number.parseInt(
    process.env.POLL_INTERVAL_MS ?? String(SERVICE_DEFAULTS.volIndexerPollIntervalMs),
    10,
  );
  const port = Number.parseInt(process.env.PORT ?? String(SERVICE_PORTS.volIndexer), 10);

  return { rpcUrl, rpcUrlFallback, chainId, governedIndexerKey, priceSourceUrl, chainlinkFeed, pollIntervalMs, port };
}
