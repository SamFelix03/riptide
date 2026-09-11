import type { PublicClient, WalletClient } from "viem";

import { getRiptideVolatilityOracle, loadManifest, riptideVolatilityOracleAbi } from "@riptide/contracts";

import type { VolIndexerConfig } from "./config.js";
import { fetchPriceObservation, type PriceObservation } from "./feed.js";

export type ObserveResult = {
  strategyId: string;
  strategyKey: `0x${string}`;
  sigmaBefore: bigint;
  sigmaAfter: bigint;
};

export async function observeAllStrategies(
  publicClient: PublicClient,
  walletClient: WalletClient,
  config: VolIndexerConfig,
  observation?: PriceObservation,
): Promise<ObserveResult[]> {
  const manifest = loadManifest(config.chainId);
  const oracle = getRiptideVolatilityOracle(publicClient, manifest.oracle);
  const obs = observation ?? (await fetchPriceObservation(manifest, publicClient, config.priceSourceUrl, config.chainlinkFeed));
  const results: ObserveResult[] = [];

  for (const seeded of manifest.seededStrategies) {
    const strategyKey = seeded.strategyKey as `0x${string}`;

    const sigmaBefore = await oracle.read.sigmaWad([strategyKey]);

    await walletClient.writeContract({
      address: manifest.oracle,
      abi: riptideVolatilityOracleAbi,
      functionName: "observe",
      args: [strategyKey, obs.priceWad, obs.timestamp, false],
      chain: walletClient.chain,
      account: walletClient.account!,
    });

    const sigmaAfter = await oracle.read.sigmaWad([strategyKey]);
    results.push({ strategyId: seeded.id, strategyKey, sigmaBefore, sigmaAfter });
  }

  return results;
}

export async function observeStrategyRaw(
  publicClient: PublicClient,
  walletClient: WalletClient,
  config: VolIndexerConfig,
  strategyKey: `0x${string}`,
  priceWad: bigint,
  timestamp: number,
  isStatic = false,
): Promise<bigint> {
  const manifest = loadManifest(config.chainId);
  const oracle = getRiptideVolatilityOracle(publicClient, manifest.oracle);

  await walletClient.writeContract({
    address: manifest.oracle,
    abi: riptideVolatilityOracleAbi,
    functionName: "observe",
    args: [strategyKey, priceWad, timestamp, isStatic],
    chain: walletClient.chain,
    account: walletClient.account!,
  });

  return oracle.read.sigmaWad([strategyKey]);
}
