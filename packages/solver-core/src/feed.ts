import type { DeploymentManifest } from "@riptide/contracts";
import type { PublicClient } from "viem";
import { parseAbi } from "viem";

const feedProbeAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);

export async function discoverChainlinkFeed(client: PublicClient, lookback = 64n): Promise<`0x${string}` | null> {
  const latest = await client.getBlockNumber();
  const start = latest > lookback ? latest - lookback : 0n;

  for (let blockNumber = latest; blockNumber >= start; blockNumber -= 1n) {
    const block = await client.getBlock({ blockNumber, includeTransactions: true });
    for (const tx of block.transactions) {
      if (typeof tx === "string" || tx.to !== null) continue;
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      const address = receipt.contractAddress;
      if (!address) continue;
      try {
        const decimals = await client.readContract({
          address,
          abi: feedProbeAbi,
          functionName: "decimals",
        });
        if (decimals !== 8) continue;
        await client.readContract({
          address,
          abi: feedProbeAbi,
          functionName: "latestRoundData",
        });
        return address;
      } catch {
        // not a feed
      }
    }
  }

  return null;
}

export async function resolveFeedAddress(
  manifest: DeploymentManifest,
  options?: { envFeed?: string; client?: PublicClient },
): Promise<`0x${string}`> {
  if (manifest.chainlinkFeed) return manifest.chainlinkFeed as `0x${string}`;
  if (options?.envFeed) return options.envFeed as `0x${string}`;
  if (options?.client) {
    const discovered = await discoverChainlinkFeed(options.client);
    if (discovered) return discovered;
  }
  throw new Error("chainlinkFeed missing from deployments/<chainId>.json");
}

export function resolveFeedAddressSync(manifest: DeploymentManifest, envFeed?: string): `0x${string}` {
  if (manifest.chainlinkFeed) return manifest.chainlinkFeed as `0x${string}`;
  if (envFeed) return envFeed as `0x${string}`;
  throw new Error("chainlinkFeed missing from deployments/<chainId>.json");
}
