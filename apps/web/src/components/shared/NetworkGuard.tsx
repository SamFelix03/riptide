"use client";

import { useState } from "react";
import { useAppKit } from "@reown/appkit/react";

import { UnsupportedChainState } from "@/components/shared/States";
import { useWallet } from "@/providers/WalletProvider";

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId, network, connect } = useWallet();
  const { open } = useAppKit();
  const [error, setError] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div className="card corner-ticks grain">
        <p className="label-xs">Wallet</p>
        <p className="display-xl" style={{ fontSize: "1.75rem", margin: "0.65rem 0 0", color: "var(--foreground)" }}>
          Connect
        </p>
        <p style={{ marginTop: "0.85rem" }}>Connect your wallet to continue.</p>
        <button
          type="button"
          style={{ marginTop: "1rem", width: "100%" }}
          onClick={() => {
            setError(null);
            void connect().catch((e) => setError(e instanceof Error ? e.message : String(e)));
          }}
        >
          Connect wallet
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  }

  if (chainId !== network.chainId) {
    return (
      <UnsupportedChainState>
        <p data-testid="unsupported-chain">Wrong network. Switch to {network.name} (chain {network.chainId}).</p>
        <button
          type="button"
          style={{ marginTop: "1rem", width: "100%" }}
          onClick={() => void open({ view: "Networks" })}
        >
          Switch network
        </button>
      </UnsupportedChainState>
    );
  }

  return <>{children}</>;
}

export function ChainBanner() {
  const { isConnected, chainId, network } = useWallet();

  if (!isConnected || chainId === network.chainId) return null;

  return (
    <div className="card error chain-banner" data-testid="chain-banner">
      Unsupported chain {chainId}. Please switch to {network.name} ({network.chainId}).
    </div>
  );
}
