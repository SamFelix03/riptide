"use client";

import { useAppKit } from "@reown/appkit/react";

import { formatAddress } from "@/lib/format";
import { useWallet } from "@/providers/WalletProvider";

export function WalletConnectButton() {
  const { address, isConnected, connect } = useWallet();
  const { open } = useAppKit();

  if (isConnected && address) {
    return (
      <button
        type="button"
        className="wc-pill"
        onClick={() => void open({ view: "Account" })}
        title={address}
      >
        <span className="brand-mark" style={{ width: "1rem", height: "1rem" }} aria-hidden>
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
            <path d="M4 7.5h16v2.2H6.4V16H4V7.5Zm6.2 4.2h9.8V16h-9.8v-4.3Z" />
          </svg>
        </span>
        {formatAddress(address)}
      </button>
    );
  }

  return (
    <button type="button" className="wc-pill" onClick={() => void connect()}>
      Connect wallet
    </button>
  );
}
