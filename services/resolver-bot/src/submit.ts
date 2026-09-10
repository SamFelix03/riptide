import type { PublicClient, WalletClient } from "viem";

import { getRiptideAuctionSettler, loadManifest } from "@riptide/contracts";
import { buildStrategyPreset, strategyToContractTuple } from "@riptide/solver-core";

export type SettleParams = {
  maker: `0x${string}`;
  strategy: ReturnType<typeof buildStrategyPreset>;
  outWad: bigint;
  maxInWad: bigint;
  deadline: number;
};

export async function submitSettleRebalance(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number,
  params: SettleParams,
): Promise<`0x${string}`> {
  const manifest = loadManifest(chainId);
  const settler = getRiptideAuctionSettler(publicClient, manifest.settler);

  const hash = await walletClient.writeContract({
    chain: walletClient.chain,
    account: walletClient.account!,
    address: manifest.settler,
    abi: settler.abi,
    functionName: "settleRebalance",
    args: [
      params.maker,
      strategyToContractTuple(params.strategy),
      params.outWad,
      params.maxInWad,
      params.deadline,
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function submitSettleRebalanceRaw(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number,
  params: SettleParams,
  force = false,
): Promise<`0x${string}` | null> {
  if (!force && params.maxInWad < params.outWad) {
    return null;
  }
  return submitSettleRebalance(publicClient, walletClient, chainId, params);
}
