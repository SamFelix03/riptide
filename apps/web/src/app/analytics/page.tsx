"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, DataTable, ErrorState, FreshnessBadge, HonestyBadge, LoadingState, StatTile } from "@/components/shared/DesignSystem";
import { ChartPanel } from "@/components/shared/ChartPanel";
import { PageShell } from "@/components/shared/PageShell";
import { Counter } from "@/components/shared/primitives";
import { TxLink } from "@/components/shared/States";
import { formatAddress, formatWad, wadToNumber } from "@/lib/format";
import { useFrontendApi } from "@/providers/FrontendApiProvider";
import { useWallet } from "@/providers/WalletProvider";

export default function AnalyticsPage() {
  const api = useFrontendApi();
  const { network } = useWallet();
  const stats = useQuery({ queryKey: ["recapture"], queryFn: () => api.getRecaptureStats("protocol") });
  const events = useQuery({ queryKey: ["events"], queryFn: () => api.streamEvents({ limit: 50 }) });
  const freshness = useQuery({ queryKey: ["freshness"], queryFn: () => api.getFreshness() });
  const routes = useQuery({ queryKey: ["routes"], queryFn: () => api.listRoutes(20) });
  const resolvers = useQuery({ queryKey: ["resolvers"], queryFn: () => api.listResolvers(25) });

  const fills = useMemo(() =>
    events.data?.filter((e): e is Extract<typeof e, { type: "SwapFilled" }> => e.type === "SwapFilled") ?? [],
  [events.data]);

  const rebalances = useMemo(() =>
    events.data?.filter((e): e is Extract<typeof e, { type: "RebalanceSettled" }> => e.type === "RebalanceSettled") ?? [],
  [events.data]);

  const controllerUpdates = useMemo(() =>
    events.data?.filter((e): e is Extract<typeof e, { type: "FeeControllerUpdated" }> => e.type === "FeeControllerUpdated") ?? [],
  [events.data]);

  const feeTimeSeries = useMemo(() =>
    controllerUpdates.map((c) => c.feeReported).reverse(),
  [controllerUpdates]);

  const feeTargetTimeSeries = useMemo(() =>
    controllerUpdates.map((c) => c.feeTarget).reverse(),
  [controllerUpdates]);

  const sigmaTimeSeries = useMemo(() =>
    controllerUpdates.map((c) => Number(BigInt(c.sigmaWad) / 1_000_000_000_000_000n)).reverse(),
  [controllerUpdates]);

  const recaptureSeries = useMemo(() =>
    rebalances.map((r) => Number(BigInt(r.retainToLP) / 1_000_000_000_000_000_000n)).reverse(),
  [rebalances]);

  const lvrSeries = useMemo(() =>
    sigmaTimeSeries.map((sigma) => {
      const s = sigma / 1000;
      return (s * s) / 8 * 10000;
    }),
  [sigmaTimeSeries]);

  if (stats.isLoading) {
    return (
      <PageShell act="05 / Analyst" title="Analytics" intro="Recapture, fill volume, and the fee loop — indexed on-chain events, not a marketing chart.">
        <LoadingState />
      </PageShell>
    );
  }
  if (stats.error) {
    return (
      <PageShell act="05 / Analyst" title="Analytics" intro="Recapture, fill volume, and the fee loop — indexed on-chain events, not a marketing chart.">
        <ErrorState message={(stats.error as Error).message} />
      </PageShell>
    );
  }

  return (
    <PageShell
      act="05 / Analyst"
      title="Analytics"
      intro="Recapture, fill volume, and the fee loop — indexed on-chain events, not a marketing chart."
      tags={["Subgraph", "RPC fallback", "Honesty badges"]}
    >
      <div className="page-stack">
        {stats.data ? (
          <Card title="Recapture" testId="recapture-headline">
            <div className="studio-toolbar">
              {freshness.data ? <FreshnessBadge {...freshness.data} /> : null}
            </div>
            <div className="metric-row">
              <StatTile compact label="Recaptured to LPs">
                <Counter value={wadToNumber(stats.data.totalRecapture)} decimals={4} />
              </StatTile>
              <StatTile compact label="Paid to resolvers">
                <Counter value={wadToNumber(stats.data.paidToResolvers)} decimals={4} />
              </StatTile>
              <StatTile compact label="Fill volume" hint={`Block #${stats.data.indexedBlock}`}>
                <Counter value={wadToNumber(stats.data.totalFillVolume)} decimals={2} />
              </StatTile>
            </div>
          </Card>
        ) : null}

        <div className="layout-dashboard">
          <Card title="Fee vs target">
            <ChartPanel
              title="feeReported vs feeTarget"
              data={feeTimeSeries}
              dataB={feeTargetTimeSeries}
              lastLabel={feeTimeSeries.at(-1)?.toLocaleString() ?? "—"}
            />
          </Card>
          <Card title="Fee vs estimated LVR">
            <p className="muted">Estimated LVR rate = σ²/8 (K1). The fee should track LVR, not sit at a constant.</p>
            <ChartPanel
              title="fee vs σ²/8"
              data={feeTimeSeries}
              dataB={lvrSeries}
              strokeB="var(--destructive)"
            />
          </Card>
        </div>

        <Card title="Loop" testId="loop-visualizer">
          <div className="metric-row">
            <StatTile compact label="Rebalances" value={String(rebalances.length)} />
            <StatTile compact label="Controller updates" value={String(controllerUpdates.length)} />
            <StatTile compact label="Fills" value={String(fills.length)} />
          </div>
          <p className="muted" style={{ marginTop: "0.85rem" }}>
            Auction revealed price updates oracle σ, the controller moves feeTarget to break-even, and the next SwapFilled charges that fee.
          </p>
          {recaptureSeries.length > 1 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <ChartPanel title="Recapture to LP" data={recaptureSeries} unit="wad" />
            </div>
          ) : null}
        </Card>

        {stats.data ? (
          <Card title="Per-market recapture ratio">
            <DataTable
              headers={["Market", "Recapture", "Volume", "Recapture / volume"]}
              rows={stats.data.perMarket.map((m) => {
                const recap = BigInt(m.recaptureVolume || "0");
                const vol = BigInt(m.fillVolume || "0");
                const ratio = vol > 0n ? `${(recap * 10_000n) / vol} bps of volume` : "—";
                return [m.marketId, formatWad(m.recaptureVolume), formatWad(m.fillVolume), ratio];
              })}
            />
          </Card>
        ) : null}

        <Card title="Atomic routes" testId="atomic-routes">
          <p className="muted" style={{ marginTop: 0 }}>
            Each row is one <code>RiptideBatchExecutor.execute</code> call: every fill in it
            settled together, or the whole route reverted and the taker kept their funds.
          </p>
          {routes.data?.length ? (
            <DataTable
              headers={["Kind", "Fills", "Amount in", "Amount out", "Block", "Tx"]}
              rows={routes.data.map((r) => [
                r.kind === "ExactInput" ? "Exact in" : "Exact out",
                `${r.fillCount} maker${r.fillCount === 1 ? "" : "s"}`,
                formatWad(r.amountIn),
                formatWad(r.amountOut),
                r.blockNumber,
                <TxLink key={r.routeId} hash={r.txHash} explorerUrl={network.explorerUrl} />,
              ])}
            />
          ) : (
            <p className="muted">
              No atomic routes indexed yet. Execute a swap on the Swap Terminal to create one.
            </p>
          )}
        </Card>

        <Card title="Resolver standings" testId="resolver-standings">
          <p className="muted" style={{ marginTop: 0 }}>
            Who has been settling rebalance auctions. Attribution comes from
            <code> RiptideAuctionSettler.AuctionSettled</code>, which names the wallet that
            funded the settle — the router&apos;s own event names the VM taker, which on this
            path is the settler contract.
          </p>
          {resolvers.data?.length ? (
            <DataTable
              headers={["Resolver", "Settles", "Earned (1−β)", "Left with LPs", "Quote paid", "Base bought"]}
              rows={resolvers.data.map((r) => [
                formatAddress(r.address),
                String(r.settlementCount),
                formatWad(r.paidToResolverWad),
                formatWad(r.retainedForLPsWad),
                formatWad(r.amountInWad),
                formatWad(r.outWad),
              ])}
            />
          ) : (
            <p className="muted">
              No settlements indexed yet. Settle an auction on the Resolver page — any wallet
              can, and it will show up here under its own address.
            </p>
          )}
        </Card>

        <Card title="Event feed">
          {events.data?.length ? (
            <DataTable
              headers={["Type", "Block", "Tx"]}
              rows={events.data.slice(0, 20).map((e) => [
                e.type,
                e.blockNumber,
                "txHash" in e ? <TxLink key={e.id} hash={e.txHash} explorerUrl={network.explorerUrl} /> : "—",
              ])}
            />
          ) : <p className="muted">No events indexed yet.</p>}
        </Card>

        <details className="advanced" data-testid="honesty-panel">
          <summary>Honesty <HonestyBadge status="verified" /></summary>
          <p>Fee revenue (Mechanism 1) is a maker-set λ target, not measured λ_Q from fills. <HonestyBadge status="simulation" /></p>
          <p>Surplus (Mechanism 2) is β-split recapture, not SwapVM surplusBps. <HonestyBadge status="verified" /></p>
          <p>Oracle uses Chainlink freshness + EWMA σ, not OraclePriceAdjuster. <HonestyBadge status="verified" /></p>
          <p>On-chain fills and rebalances are <HonestyBadge status="verified" />.</p>
        </details>
      </div>
    </PageShell>
  );
}
