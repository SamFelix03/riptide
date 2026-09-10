"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ExternalLink, X } from "lucide-react";

export type TxStatus = "pending" | "confirmed" | "failed";

export type ToastPayload = {
  txHash: string;
  status: TxStatus;
  label: string;
  explorerBaseUrl?: string;
};

interface TxToastProps extends ToastPayload {
  onDismiss: () => void;
  startedAt?: number;
}

function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TxToast({
  txHash,
  status,
  label,
  onDismiss,
  explorerBaseUrl = "https://sepolia.basescan.org/tx/",
  startedAt,
}: TxToastProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "pending") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const elapsed = startedAt ? formatElapsed((status === "pending" ? now : Date.now()) - startedAt) : null;

  useEffect(() => {
    if (status === "pending") return;
    const timer = setTimeout(onDismiss, status === "confirmed" ? 12_000 : 8_000);
    return () => clearTimeout(timer);
  }, [status, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="tx-toast card corner-ticks"
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {status === "pending" && (
            <svg className="spin" style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="var(--primary)" strokeWidth="3" />
              <path style={{ opacity: 0.75 }} fill="var(--primary)" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {status === "confirmed" && <span style={{ color: "var(--success)" }}>✓</span>}
          {status === "failed" && <span style={{ color: "var(--destructive)" }}>✕</span>}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{label}</p>
          <p className="muted mono" style={{ fontSize: "0.6875rem", marginTop: "0.25rem" }} title={txHash}>
            {shortHash(txHash)}
            {elapsed ? ` · ${elapsed}` : ""}
          </p>
          {txHash.startsWith("0x") && (
            <a
              href={`${explorerBaseUrl}${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ghost"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                marginTop: "0.5rem",
                padding: "0.2rem 0.5rem",
                fontSize: "0.6875rem",
                borderRadius: "0.2rem",
              }}
            >
              View on explorer
              <ExternalLink style={{ width: 12, height: 12 }} />
            </a>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="ghost"
          style={{ padding: "0.2rem", border: "none" }}
          aria-label="Dismiss"
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </motion.div>
  );
}

const ToastContext = createContext<{ showToast: (t: ToastPayload) => void }>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastPayload & { startedAt: number }) | null>(null);
  const showToast = useCallback((t: ToastPayload) => {
    setToast({ ...t, startedAt: Date.now() });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <TxToast
          {...toast}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </ToastContext.Provider>
  );
}
