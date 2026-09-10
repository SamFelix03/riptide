"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, DataTable, EmptyState, ErrorState, LoadingState, StatTile } from "@/components/shared/DesignSystem";
import { ChartPanel } from "@/components/shared/ChartPanel";
import { FormField } from "@/components/shared/FormField";
import { PageShell } from "@/components/shared/PageShell";
import { NetworkGuard } from "@/components/shared/NetworkGuard";
import { PrimaryCta } from "@/components/shared/primitives";
import { AllowanceManager, TokenBalanceReadout, TransactionStepper } from "@/components/shared/WalletComponents";
import { StrategyNotFoundState, TxLink } from "@/components/shared/States";
import { formatAddress, formatHash, formatWad } from "@/lib/format";
import { useServerConfig } from "@/lib/useServerConfig";
import { useFrontendApi } from "@/providers/FrontendApiProvider";
import { useWallet } from "@/providers/WalletProvider";

function PositionsPageInner() {
  const api = useFrontendApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const strategyParam = params.get("strategy");
  const [dockPlan, setDockPlan] = useState<Awaited<ReturnType<typeof api.buildDockStrategy>> | null>(null);
  const { writeContract, address, network } = useWallet();
  const config = useServerConfig();

  const markets = useQuery({ queryKey: ["markets"], queryFn: () => api.listMarkets() });
  const marketParam = params.get("market");
  const market = markets.data?.find((m) => m.id === marketParam) ?? markets.data?.[0];
  const strategies = useQuery({
    queryKey: ["strategies", market?.id],
    queryFn: () => api.listStrategies(market!.id),
    enabled: Boolean(market),
  });

  const selectedHashMatch = strategies.data?.find((s) => s.strategyHash === strategyParam);
  const strategyMissing = Boolean(strategyParam) && Boolean(strategies.data) && !selectedHashMatch;
  const selected =
    selectedHashMatch ??
    strategies.data?.find((s) => s.active) ??
    strategies.data?.[0];

  const detail = useQuery({
    queryKey: ["strategy", selected?.maker, selected?.strategyHash],
    queryFn: () => api.getStrategy(selected!.maker, selected!.strategyHash),
    enabled: Boolean(selected?.active),
  });

  const controller = useQuery({
    queryKey: ["controller", selected?.maker, selected?.strategyHash],
    queryFn: () => api.getControllerState(selected!.maker, selected!.strategyHash),
    enabled: Boolean(selected?.active),
  });

  const events = useQuery({
    queryKey: ["events", "positions"],
    queryFn: () => api.streamEvents({ limit: 50 }),
    enabled: Boolean(selected),
  });

  const fillHistory = events.data
    ?.filter((e): e is Extract<typeof e, { type: "SwapFilled" }> =>
      e.type === "SwapFilled" && e.strategyKey === selected?.strategyKey)
    ?? [];

  function refreshStrategies() {
    void queryClient.refetchQueries({ queryKey: ["strategies"] });
    void queryClient.refetchQueries({ queryKey: ["strategy"] });
    void queryClient.refetchQueries({ queryKey: ["controller"] });
    void queryClient.refetchQueries({ queryKey: ["auctions"] });
  }

  const isMaker = Boolean(address && selected && address.toLowerCase() === selected.maker.toLowerCase());
  const feeSeries = fillHistory.map((f) => f.feeBpsApplied).reverse();
  const sigmaSeries = feeSeries.length
    ? feeSeries
    : controller.data
      ? [controller.data.feeTarget, controller.data.feeReported]
      : [];

  return (
    <NetworkGuard>
      <PageShell
        act="04 / Positions"
        title="Positions"
        intro="Select a strategy, inspect live Aqua balances and controller state, then dock or republish. There is no in-place edit."
        tags={["Lens", "Controller", "Aqua.dock"]}
      >
        {markets.isLoading || strategies.isLoading ? <LoadingState /> : null}
        {strategies.error ? <ErrorState message={(strategies.error as Error).message} /> : null}

        {!markets.isLoading && !strategies.isLoading && !strategies.error ? (
          <div className="page-stack">
            {markets.data && markets.data.length > 1 ? (
              <FormField label="Market">
                <select
                  value={market?.id ?? ""}
                  onChange={(e) => router.push(`/positions?market=${encodeURIComponent(e.target.value)}`)}
                >
                  {markets.data.map((m) => (
                    <option key={m.id} value={m.id}>{m.baseSymbol}/{m.quoteSymbol}</option>
                  ))}
                </select>
              </FormField>
            ) : null}

            {strategyMissing ? <StrategyNotFoundState /> : null}

            {!strategies.data?.length ? (
              <EmptyState message="No live strategies yet. Ship a pool from Maker Studio with the connected wallet." />
            ) : (
              <div className="layout-board">
                <Card title="Strategy list">
                  <div className="strategy-picker">
                    {strategies.data.map((s) => {
                      const href = `/positions?market=${encodeURIComponent(market?.id ?? "")}&strategy=${s.strategyHash}`;
                      const active = selected?.strategyHash === s.strategyHash;
                      return (
                        <Link key={s.strategyHash} href={href} className={active ? "is-selected" : undefined}>
                          <span className="label-xs">{s.active ? "live" : "docked"} · {s.feeBps} bps</span>
                          <p style={{ marginTop: "0.35rem" }}>{s.id}</p>
                          <p className="muted" style={{ marginTop: "0.25rem", fontSize: "0.75rem" }}>
                            {formatAddress(s.maker)} · σ {formatWad(s.sigmaWad, 3)}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </Card>

                {selected ? (
                  <div className="page-stack">
                    {detail.data ? (
                      <Card title="Inspector">
                        <div className="metric-row">
                          <StatTile compact label="Aqua base" value={formatWad(detail.data.aquaBase)} hint={formatWad(detail.data.reserveBaseWad)} />
                          <StatTile compact label="Aqua quote" value={formatWad(detail.data.aquaQuote)} hint={formatWad(detail.data.reserveQuoteWad)} />
                          <StatTile compact label="Recapture" value={formatWad(detail.data.cumulativeRecapture)} />
                        </div>
                        {controller.data ? (
                          <div className="metric-row" style={{ marginTop: "0.85rem" }}>
                            <StatTile compact label="σ" value={formatWad(controller.data.sigmaWad, 3)} />
                            <StatTile compact label="feeTarget" value={String(controller.data.feeTarget)} />
                            <StatTile compact label="feeReported" value={String(controller.data.feeReported)} />
                          </div>
                        ) : null}
                        {controller.data && controller.data.feeTarget !== controller.data.feeReported ? (
                          <p className="muted">Controller is converging: target ≠ reported.</p>
                        ) : controller.data ? (
                          <p className="muted">Controller converged at {controller.data.feeReported}.</p>
                        ) : null}
                        <div style={{ marginTop: "0.85rem" }}>
                          <ChartPanel
                            title="Fee over fills"
                            data={sigmaSeries}
                            unit="bps"
                          />
                        </div>
                        {market ? (
                          <div className="balance-row">
                            <TokenBalanceReadout token={market.baseToken} symbol={market.baseSymbol} />
                            <TokenBalanceReadout token={market.quoteToken} symbol={market.quoteSymbol} />
                          </div>
                        ) : null}
                      </Card>
                    ) : selected.active ? (
                      <LoadingState />
                    ) : (
                      <Card title="Inspector">
                        <p className="muted">{selected.id} is inactive. Dock a live pool and ship a new salt from Maker Studio.</p>
                      </Card>
                    )}

                    {selected.active ? (
                      <Card title="Fill history">
                        {fillHistory.length > 0 ? (
                          <DataTable
                            headers={["Block", "Amount in", "Amount out", "Fee bps", "Tx"]}
                            rows={fillHistory.slice(0, 15).map((f) => [
                              f.blockNumber,
                              formatWad(f.amountIn),
                              formatWad(f.amountOut),
                              String(f.feeBpsApplied),
                              <TxLink key={f.id} hash={f.txHash} explorerUrl={network.explorerUrl} />,
                            ])}
                          />
                        ) : (
                          <p className="muted">No fills for this strategy yet.</p>
                        )}
                      </Card>
                    ) : null}

                    <Card title="Dock & republish">
                      {selected.active ? (
                        <>
                          <p className="muted">Docking withdraws reserves from Aqua. Only the strategy maker can dock. Then ship a new salt from Maker Studio — there is no in-place edit.</p>
                          <div style={{ marginTop: "0.85rem" }}>
                            <PrimaryCta
                              disabled={!isMaker}
                              onClick={async () => setDockPlan(await api.buildDockStrategy(selected.maker, selected.strategyHash))}
                            >
                              Build dock plan
                            </PrimaryCta>
                          </div>
                          {!isMaker ? (
                            <p className="muted">
                              Aqua.dock must be sent by {formatAddress(selected.maker)}. Connect that wallet.
                            </p>
                          ) : null}
                          <TransactionStepper
                            plan={dockPlan}
                            requiredSigner={selected.maker}
                            successLabel="Strategy docked"
                            onSuccess={refreshStrategies}
                            onExecute={async () => {
                              if (!dockPlan?.sendable) return;
                              return writeContract({ address: dockPlan.to, data: dockPlan.data });
                            }}
                          />
                        </>
                      ) : (
                        <p className="muted">This strategy is already docked. Go to <Link href="/make">Maker Studio</Link> to ship a new one.</p>
                      )}
                    </Card>

                    <details className="advanced">
                      <summary>Allowances & hashes</summary>
                      {detail.data ? (
                        <>
                          <p className="muted" title={detail.data.policyHash}>policyHash {formatHash(detail.data.policyHash)}</p>
                          <p className="muted" title={selected.strategyHash}>strategyHash {formatHash(selected.strategyHash)}</p>
                          <p className="muted" title={selected.strategyKey}>strategyKey {formatHash(selected.strategyKey)}</p>
                        </>
                      ) : null}
                      {market && config.data ? (
                        <div className="page-stack" style={{ marginTop: "0.75rem" }}>
                          <AllowanceManager bare token={market.baseToken} spender={config.data.aqua} symbol={market.baseSymbol} />
                          <AllowanceManager bare token={market.quoteToken} spender={config.data.aqua} symbol={market.quoteSymbol} />
                        </div>
                      ) : null}
                    </details>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </PageShell>
    </NetworkGuard>
  );
}

export default function PositionsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PositionsPageInner />
    </Suspense>
  );
}
