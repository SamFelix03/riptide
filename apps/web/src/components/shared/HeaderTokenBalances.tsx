"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { formatWad } from "@/lib/format";
import { useServerConfig } from "@/lib/useServerConfig";
import { useWallet } from "@/providers/WalletProvider";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * RBASE / RQUOTE balances beside the wallet pill.
 *
 * These are mintable demo tokens, and a wallet connecting for the first time holds none —
 * at which point every swap, ship and settle reverts on transfer. Showing the balances in
 * the header is the cheapest way to make that obvious before someone signs anything; a
 * zero reads as "mint first", not as a mystery revert two clicks later.
 */
export function HeaderTokenBalances() {
  const { address, isConnected, readContract } = useWallet();
  const config = useServerConfig();
  const base = config.data?.demoTokens?.base as Address | undefined;
  const quote = config.data?.demoTokens?.quote as Address | undefined;

  const balances = useQuery({
    queryKey: ["header-balances", address, base, quote],
    enabled: Boolean(address && base && quote),
    // Minting happens on the page below; keep this honest without a manual refresh.
    refetchInterval: 15_000,
    queryFn: async () => {
      const read = (token: Address) =>
        readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address!] });
      const [b, q] = await Promise.all([read(base!), read(quote!)]);
      return { base: String(b), quote: String(q) };
    },
  });

  if (!isConnected || !address) return null;

  const empty =
    balances.data !== undefined && balances.data.base === "0" && balances.data.quote === "0";

  return (
    <div
      className="header-balances"
      data-testid="header-balances"
      title={
        empty
          ? "No demo tokens yet — mint RBASE and RQUOTE from Demo tools on any page"
          : "Demo token balances for the connected wallet"
      }
    >
      {(["base", "quote"] as const).map((k) => (
        <span key={k} className="header-balance">
          <span className="label-xs">{k === "base" ? "RBASE" : "RQUOTE"}</span>
          <span className={`tabular${empty ? " error" : ""}`}>
            {balances.data ? formatWad(balances.data[k]) : "—"}
          </span>
        </span>
      ))}
      {empty ? <span className="header-balance-hint">mint first</span> : null}
    </div>
  );
}
