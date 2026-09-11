import type { DeploymentManifest } from "@riptide/contracts";
import type { PublicClient } from "viem";
import { parseAbi } from "viem";

import { resolveFeedAddress } from "@riptide/solver-core";

const WAD = 1_000_000_000_000_000_000n;

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);

export type PriceObservation = {
  priceWad: bigint;
  timestamp: number;
};

export async function fetchPriceObservation(
  manifest: DeploymentManifest,
  client: PublicClient,
  priceSourceUrl?: string,
  envFeed?: string,
): Promise<PriceObservation> {
  if (priceSourceUrl) {
    const res = await fetch(priceSourceUrl);
    if (!res.ok) throw new Error(`PRICE_SOURCE_URL failed: ${res.status}`);
    const body = (await res.json()) as { priceWad?: string; price?: string; timestamp?: number };
    const raw = body.priceWad ?? body.price;
    if (!raw) throw new Error("PRICE_SOURCE_URL JSON must include priceWad or price");
    const block = await client.getBlock();
    return {
      priceWad: BigInt(raw),
      timestamp: body.timestamp ?? Number(block.timestamp),
    };
  }

  const feed = await resolveFeedAddress(manifest, { envFeed, client });
  const block = await client.getBlock();
  const [, answer] = await client.readContract({
    address: feed,
    abi: feedAbi,
    functionName: "latestRoundData",
  });
  const priceWad = (BigInt(answer) * WAD) / 100_000_000n;
  return { priceWad, timestamp: Number(block.timestamp) };
}
