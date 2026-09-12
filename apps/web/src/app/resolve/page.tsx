"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, DataTable, EmptyState, ErrorState, LoadingState, Meter, StatTile } from "@/components/shared/DesignSystem";
import { PageShell } from "@/components/shared/PageShell";
import { DemoTokenFaucet } from "@/components/shared/DemoTokenFaucet";
import { RiptideErrorDisplay } from "@/components/shared/RiptideErrorDisplay";
import { NetworkGuard } from "@/components/shared/NetworkGuard";
import { Counter, PrimaryCta } from "@/components/shared/primitives";
import { TokenBalanceReadout, TransactionStepper } from "@/components/shared/WalletComponents";
import { TxLink } from "@/components/shared/States";
import { formatAddress, formatHash, formatWad } from "@/lib/format";
import { useServerConfig } from "@/lib/useServerConfig";
import { useFrontendApi } from "@/providers/FrontendApiProvider";
import { useWallet } from "@/providers/WalletProvider";

const SEED_REBALANCE_OUT_WAD = "1000000000000000000";

function decayVisualization(decayWad: string, durationSeconds: number, elapsedSeconds: number): {
  currentDecay: number;
  percentRemaining: number;
  timeLabel: string;
} {
  const decay = Number(decayWad) / 1e18;
  const elapsed = Math.min(elapsedSeconds, durationSeconds);
  const periods = elapsed > 0 ? elapsed : 0;
  const currentDecay = Math.pow(decay, periods);
  const percentRemaining = currentDecay * 100;
  const minutesLeft = Math.max(0, (durationSeconds - elapsed) / 60);
  return {
    currentDecay,
    percentRemaining,
    timeLabel: `${minutesLeft.toFixed(0)}m remaining`,
  };
}

function remainingLabel(endsAt: number): string {
  const sec = Math.max(0, endsAt - Math.floor(Date.now() / 1000));
  if (sec === 0) return "ended";
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`;
}

export default function ResolvePage() {
  const api = useFrontendApi();
  const queryClient = useQueryClient();
  const config = useServerConfig();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [settlePlan, setSettlePlan] = useState<Awaited<ReturnType<typeof api.buildSettleRebalance>> | null>(null);
  const [skewPlan, setSkewPlan] = useState<Awaited<ReturnType<typeof api.buildDemoOracleSkew>> | null>(null);
  const [previewError, setPreviewError] = useState<{ code: string; message: string } | null>(null);
  const { writeContract, address, network } = useWallet();

  const auctions = useQuery({ queryKey: ["auctions"], queryFn: () => api.listOpenAuctions() });
  const auction = auctions.data?.[selectedIdx];

  const preview = useQuery({
    queryKey: ["preview", auction?.maker, auction?.strategyHash, address],
    queryFn: async () => {
      if (!auction || !address) throw new Error("no auction");
      return api.previewRebalance(auction.maker, auction.strategyHash, SEED_REBALANCE_OUT_WAD);
    },
    enabled: Boolean(auction && address),
  });

  const rebalanceEvents = useQuery({
    queryKey: ["rebalance-events"],
    queryFn: () => api.streamEvents({ limit: 50 }),
  });

  const resolverPnl = rebalanceEvents.data
    ?.filter((e): e is Extract<typeof e, { type: "RebalanceSettled" }> => e.type === "RebalanceSettled")
    ?? [];

  const totalPaidToResolver = resolverPnl.reduce(
    (sum, e) => sum + BigInt(e.payToResolver), 0n,
  );
  const totalRetainedToLP = resolverPnl.reduce(
    (sum, e) => sum + BigInt(e.retainToLP), 0n,
  );

  async function refreshAuctions() {
    await queryClient.invalidateQueries({ queryKey: ["auctions"] });
    await queryClient.refetchQueries({ queryKey: ["auctions"] });
  }

  async function handleSkewOracle() {
    const plan = await api.buildDemoOracleSkew();
    setSkewPlan(plan);
  }

  async function handleSettle() {
    if (!auction || !preview.data || !address) return;
    setPreviewError(null);
    if (!preview.data.profitable) {
      setPreviewError({ code: "RiptideNoSurplus", message: "No profitable surplus for this rebalance." });
      return;
    }
    const plan = await api.buildSettleRebalance(
      auction.maker,
      auction.strategyHash,
      SEED_REBALANCE_OUT_WAD,
      preview.data.maxInWad,
      Math.floor(Date.now() / 1000) + 3600,
      address,
    );
    setSettlePlan(plan);
  }

  const hasAuctions = Boolean(auctions.data?.length);
  const quoteToken = config.data?.demoTokens?.quote as `0x${string}` | undefined;
  const now = Math.floor(Date.now() / 1000);
  const start = auction ? (auction.auctionStart || auction.endsAt - auction.duration) : 0;
  const elapsed = auction ? now - start : 0;
  const viz = auction
    ? decayVisualization(auction.decayWad, auction.duration, Math.max(0, elapsed))
    : null;

  return (
    <NetworkGuard>
      <PageShell
        act="03 / Resolver"
        title="Resolve"
        intro="Pick an open Dutch window, preview the β-split surplus, then settle. The board stays on the left so you can compare candidates while you commit."
        tags={["previewRebalance", "settleRebalance", "β split"]}
      >
        {auctions.isLoading ? <LoadingState /> : null}
        {auctions.error ? <ErrorState message={(auctions.error as Error).message} /> : null}

        {!auctions.isLoading && !auctions.error ? (
          <div className="page-stack">
            <div className="layout-board">
              <Card title="Auction board">
                {hasAuctions ? (
                  <DataTable
                    headers={["Strategy", "Dutch price", "Remaining", "Gap"]}
                    selectedRow={selectedIdx}
                    onRowClick={setSelectedIdx}
                    rows={auctions.data!.map((a) => [
                      <span key={a.strategyId} title={a.strategyId}>{formatHash(a.strategyId)}</span>,
                      formatWad(a.dutchPriceNowWad),
                      remainingLabel(a.endsAt),
                      `${a.oracleGapBps} bps`,
                    ])}
                  />
                ) : (
                  <EmptyState message="No open auctions — oracle may be aligned with pools, windows expired, or pools docked." />
                )}
              </Card>

              <div className="page-stack">
                {auction && viz ? (
                  <Card title="Settle ticket">
                    <div className="metric-row">
                      <StatTile compact label="Dutch price" value={formatWad(auction.dutchPriceNowWad)} />
                      <StatTile compact label="Oracle gap" value={`${auction.oracleGapBps} bps`} />
                    </div>
                    {preview.data ? (
                      <p className="muted" title={preview.data.auctionPriceNowWad}>
                        Preview price {formatWad(preview.data.auctionPriceNowWad)}
                      </p>
                    ) : null}
                    <Meter value={viz.percentRemaining} max={100} label="Auction remaining" />
                    <p className="muted" style={{ marginTop: "0.5rem" }}>
                      Decay {formatWad(auction.decayWad)} / s · remaining{" "}
                      <Counter value={viz.percentRemaining} decimals={1} />% · {viz.timeLabel}
                    </p>
                    {preview.isError ? (
                      <RiptideErrorDisplay
                        error={{
                          code: (preview.error as Error & { code?: string }).code ?? "PreviewError",
                          message: (preview.error as Error).message,
                        }}
                      />
                    ) : null}
                    {preview.isLoading ? <LoadingState label="Previewing surplus…" /> : null}
                    {preview.data ? (
                      <div className="metric-row" style={{ marginTop: "0.85rem" }}>
                        <StatTile compact label="Surplus S" value={formatWad(preview.data.surplusWad)} />
                        <StatTile compact label="Pay resolver" value={formatWad(preview.data.payToResolver)} hint="Down((1−β)·S)" />
                        <StatTile compact label="Retain LP" value={formatWad(preview.data.retainToLP)} hint="≥ β · S" />
                      </div>
                    ) : null}
                    {!preview.data?.profitable && preview.data ? (
                      <p className="muted">Not profitable at current Dutch price. Wait for further decay.</p>
                    ) : null}
                    <p className="muted" style={{ marginTop: "0.75rem" }}>
                      Reverse swaps within the anti-sandwich window ({auction.antiSandwichPeriod}s) are penalized.
                    </p>
                    {previewError ? <RiptideErrorDisplay error={previewError} /> : null}
                    {quoteToken ? (
                      <div className="balance-row" style={{ marginTop: "0.75rem" }}>
                        {/* Settling pulls maxIn from the connected wallet (the unused part is
                            refunded in the same transaction), so show what it holds. The plan
                            below includes the approval step. */}
                        <TokenBalanceReadout token={quoteToken} symbol="RQUOTE" />
                      </div>
                    ) : null}
                    <div style={{ marginTop: "1rem" }}>
                      <PrimaryCta disabled={!preview.data?.profitable} onClick={() => void handleSettle()}>
                        Settle rebalance
                      </PrimaryCta>
                    </div>
                    {/* No onExecute: the plan is approve + settleRebalance, walked in order. */}
                    <TransactionStepper plan={settlePlan} successLabel="Rebalance settled" />
                  </Card>
                ) : !hasAuctions ? (
                  <Card title="Settle ticket">
                    <p className="muted">Open a gap with the demo oracle skew, then pick a row on the board.</p>
                  </Card>
                ) : null}

                <details className="advanced">
                  <summary>Demo tools</summary>
                  {quoteToken ? (
                    <>
                      <DemoTokenFaucet tokens={[{ address: quoteToken, symbol: "RQUOTE" }]} />
                      <div className="balance-row">
                        <TokenBalanceReadout token={quoteToken} symbol="RQUOTE" />
                      </div>
                    </>
                  ) : null}
                  <p className="muted">
                    Skew the demo Chainlink feed to open a rebalance gap. The connected wallet must own the feed (typically the deployer).
                  </p>
                  <button type="button" className="ghost" onClick={() => void handleSkewOracle()}>
                    Build oracle skew plan
                  </button>
                  {skewPlan ? (
                    <TransactionStepper
                      plan={skewPlan}
                      successLabel="Oracle skewed — refresh the auction board"
                      onSuccess={() => void refreshAuctions()}
                      onExecute={async () => {
                        if (!skewPlan?.sendable) return;
                        return writeContract({ address: skewPlan.to, data: skewPlan.data });
                      }}
                    />
                  ) : null}
                </details>
              </div>
            </div>

            <Card title="Resolver PnL">
              {resolverPnl.length > 0 ? (
                <>
                  <div className="metric-row">
                    <StatTile compact label="Paid to resolvers" value={formatWad(totalPaidToResolver)} />
                    <StatTile compact label="Retained to LPs" value={formatWad(totalRetainedToLP)} />
                  </div>
                  <DataTable
                    headers={["Block", "Settled by", "Surplus", "Resolver pay", "LP retain", "Tx"]}
                    rows={resolverPnl.slice(0, 20).map((e) => [
                      e.blockNumber,
                      // The wallet that funded the settle, recovered from the settler's own
                      // receipt — the router event only names the VM taker.
                      <span key={`${e.id}-by`} className={e.settledBy?.toLowerCase() === address?.toLowerCase() ? "you" : undefined}>
                        {formatAddress(e.settledBy)}
                        {e.settledBy?.toLowerCase() === address?.toLowerCase() ? " (you)" : ""}
                      </span>,
                      formatWad(e.surplusWad),
                      formatWad(e.payToResolver),
                      formatWad(e.retainToLP),
                      <TxLink key={e.id} hash={e.txHash} explorerUrl={network.explorerUrl} />,
                    ])}
                  />
                </>
              ) : (
                <p className="muted">No rebalance settlements indexed yet.</p>
              )}
            </Card>
          </div>
        ) : null}
      </PageShell>
    </NetworkGuard>
  );
}
