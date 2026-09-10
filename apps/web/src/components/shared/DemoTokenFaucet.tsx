"use client";

import { useState } from "react";
import { riptideDemoTokenAbi } from "@riptide/contracts/abis";
import { encodeFunctionData, type Address } from "viem";

import { Card } from "@/components/shared/DesignSystem";
import { useWallet } from "@/providers/WalletProvider";

const MINT_AMOUNT = 250_000n * 10n ** 18n;

export function DemoTokenFaucet({
  tokens,
}: {
  tokens: { address: Address; symbol: string }[];
}) {
  const { address, writeContract, waitForTransaction, isConnected } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!isConnected || !address || tokens.length === 0) return null;

  async function mint(token: Address, symbol: string) {
    setBusy(symbol);
    setError(null);
    setDone(null);
    try {
      const data = encodeFunctionData({
        abi: riptideDemoTokenAbi,
        functionName: "mint",
        args: [address!, MINT_AMOUNT],
      });
      const hash = await writeContract({ address: token, data });
      const receipt = await waitForTransaction(hash);
      if (receipt.status === "reverted") throw new Error(`${symbol} mint reverted`);
      setDone(`Minted ${MINT_AMOUNT.toString()} ${symbol} to ${address}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Demo token faucet">
      <p className="muted">
        RBASE / RQUOTE are uncapped demo tokens on this deployment. Mint to the connected wallet,
        then approve spenders when you ship or swap.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
        {tokens.map((t) => (
          <button
            key={t.address}
            type="button"
            disabled={busy !== null}
            onClick={() => void mint(t.address, t.symbol)}
          >
            {busy === t.symbol ? `Minting ${t.symbol}…` : `Mint ${t.symbol}`}
          </button>
        ))}
      </div>
      {done ? <p className="muted" style={{ marginTop: "0.5rem" }}>{done}</p> : null}
      {error ? <p className="error" style={{ marginTop: "0.5rem" }}>{error}</p> : null}
    </Card>
  );
}
