"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { formatWad } from "@/lib/format";
import { useWallet } from "@/providers/WalletProvider";

const balanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type BalanceRequirement = {
  token: Address | undefined;
  symbol: string;
  /** Wad amount this action will pull from the connected wallet. */
  amount: bigint | undefined;
};

/**
 * RBASE and RQUOTE are mintable demo tokens, so a wallet that has just connected holds
 * none and the ERC20 transfer reverts before any RIPTIDE logic runs. Checking first turns
 * a wasted signature and an opaque revert into a disabled button with a reason on it.
 */
export function useBalanceGate(requirements: BalanceRequirement[]) {
  const { address, readContract, isConnected } = useWallet();
  const active = requirements.filter(
    (r): r is BalanceRequirement & { token: Address; amount: bigint } =>
      Boolean(r.token) && r.amount !== undefined && r.amount > 0n,
  );

  const balances = useQuery({
    queryKey: ["balance-gate", address, ...active.map((r) => `${r.token}:${r.amount}`)],
    enabled: Boolean(address) && active.length > 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const entries = await Promise.all(
        active.map(async (r) => {
          const v = await readContract({
            address: r.token,
            abi: balanceAbi,
            functionName: "balanceOf",
            args: [address!],
          });
          return [r.symbol, BigInt(String(v))] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, bigint>;
    },
  });

  if (!isConnected || active.length === 0 || !balances.data) {
    return { ready: true as const, message: null };
  }

  const short = active.filter((r) => (balances.data![r.symbol] ?? 0n) < r.amount);
  if (short.length === 0) return { ready: true as const, message: null };

  const detail = short
    .map((r) => `${r.symbol} (have ${formatWad(balances.data![r.symbol] ?? 0n)}, need ${formatWad(r.amount)})`)
    .join(" and ");

  return {
    ready: false as const,
    message: `Insufficient ${detail}. Mint from the demo token faucet below.`,
  };
}
