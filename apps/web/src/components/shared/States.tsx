"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { formatHash } from "@/lib/format";

export function TxLink({ hash, explorerUrl }: { hash: string; explorerUrl?: string }) {
  const label = formatHash(hash);
  if (!explorerUrl) {
    return <code title={hash}>{label}</code>;
  }
  return (
    <a href={`${explorerUrl.replace(/\/$/, "")}/tx/${hash}`} target="_blank" rel="noreferrer" title={hash}>
      {label}
    </a>
  );
}

export function UnsupportedChainState({ children }: { children?: ReactNode }) {
  return (
    <div className="card error" data-testid="unsupported-chain-state">
      <p>Unsupported chain.</p>
      {children}
    </div>
  );
}

export function StrategyNotFoundState() {
  return (
    <div className="card error" data-testid="strategy-not-found">
      <p>Strategy not found.</p>
      <p className="muted">This hash is not in the live set for the selected market. Docked or unpublished strategies will not appear here.</p>
      <p style={{ marginTop: "0.75rem" }}><Link href="/positions">Browse live strategies</Link> · <Link href="/make">Ship a new one</Link></p>
    </div>
  );
}
