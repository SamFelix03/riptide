"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { RouteFill, TxPlan } from "@riptide/frontend-api";

import { Card, DataTable, ErrorState, FreshnessBadge, LoadingState } from "@/components/shared/DesignSystem";
import { FormField, HumanUnitField, HumanWadField } from "@/components/shared/FormField";
import { PageShell } from "@/components/shared/PageShell";
import { RiptideErrorDisplay } from "@/components/shared/RiptideErrorDisplay";
import { NetworkGuard } from "@/components/shared/NetworkGuard";
import { Counter, PrimaryCta, SegmentTabs } from "@/components/shared/primitives";
import { TokenBalanceReadout, TransactionStepper } from "@/components/shared/WalletComponents";
import { DemoTokenFaucet } from "@/components/shared/DemoTokenFaucet";
import { simulateTxPlanRemote } from "@/lib/api-client";
import { formatAddress, formatBps, formatFeePercent, formatFeeBpsLabel, formatWad, wadToNumber } from "@/lib/format";
import { useBalanceGate } from "@/lib/useBalanceGate";
import { useFrontendApi } from "@/providers/FrontendApiProvider";
import { useWallet } from "@/providers/WalletProvider";

const WAD = 1_000_000_000_000_000_000n;

export default function SwapPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SwapPageInner />
    </Suspense>
  );
}

function fillPrice(f: RouteFill): bigint | null {
  const inn = BigInt(f.amountIn);
  const out = BigInt(f.amountOut);
  if (inn === 0n) return null;
  return (out * 10n ** 18n) / inn;
}

function SwapPageInner() {
  const api = useFrontendApi();
  const router = useRouter();
  const params = useSearchParams();
  const marketParam = params.get("market");
  const [amount, setAmount] = useState(1n * WAD);
  const [kind, setKind] = useState<"ExactInput" | "ExactOutput">("ExactInput");
  const [slippageBps, setSlippageBps] = useState(50);
  const [deadlineMinutes, setDeadlineMinutes] = useState(60);
  const [customRecipient, setCustomRecipient] = useState("");
  const [routePlan, setRoutePlan] = useState<TxPlan | null>(null);
  const [simulation, setSimulation] = useState<{ success: boolean; error?: { code: string; message: string } } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const { address } = useWallet();

  const markets = useQuery({ queryKey: ["markets"], queryFn: () => api.listMarkets() });
  const market = markets.data?.find((m) => m.id === marketParam) ?? markets.data?.[0];
  const amountStr = amount.toString();

  const quote = useQuery({
    queryKey: ["quote", market?.id, kind, amountStr],
    queryFn: () => api.quoteSwap(market!.id, kind, amountStr),
    enabled: Boolean(market && amount > 0n),
  });

  const recipient = (customRecipient && customRecipient.startsWith("0x") && customRecipient.length === 42)
    ? customRecipient as `0x${string}`
    : address;

  function handleMarketChange(newMarket: string) {
    router.push(`/swap?market=${encodeURIComponent(newMarket)}`);
  }

  async function handleBuildRoute() {
    if (!market || !address) return;
    setError(null);
    try {
      const plan = await api.buildSwapRoute(market.id, kind, amountStr, {
        slippageBps,
        deadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60,
        payer: address,
        recipient: recipient ?? address,
      });
      setRoutePlan(plan);
      // Simulate the swap itself, not a leading approval step. If the plan still carries
      // an approval the executor has no allowance yet, so an eth_call would only report
      // that - say so instead of showing a misleading failure.
      const exec = plan.steps.at(-1) ?? { to: plan.to, data: plan.data };
      const sim = plan.steps.length > 1
        ? { success: false as const, error: { code: "ApprovalRequired", message: "Approve the quote token first — the plan's first step does it. Simulation runs once the allowance is in place." } }
        : await simulateTxPlanRemote({ to: exec.to, data: exec.data, from: address });
      setSimulation(sim);
    } catch (e) {
      setError({ code: "RouteError", message: e instanceof Error ? e.message : String(e) });
    }
  }


  const fills: RouteFill[] = routePlan?.fills ?? [];
  const routeStats = useMemo(() => {
    if (!fills.length) return null;
    const prices = fills.map(fillPrice).filter((p): p is bigint => p !== null);
    if (!prices.length) return null;
    const worst = prices.reduce((a, b) => (a < b ? a : b));
    const best = prices.reduce((a, b) => (a > b ? a : b));
    const impactBps = best > 0n ? Number(((best - worst) * 10_000n) / best) : 0;
    return { worst: worst.toString(), impactBps };
  }, [fills]);

  // The executor pulls the quote token from the payer for both kinds; exact-out pulls
  // whatever the quote says the fill will cost.
  const gate = useBalanceGate([
    {
      token: market?.quoteToken,
      symbol: market?.quoteSymbol ?? "quote",
      amount: kind === "ExactInput" ? amount : quote.data ? BigInt(quote.data.amountIn) : undefined,
    },
  ]);

  const receiveWad = quote.data
    ? (kind === "ExactInput" ? quote.data.amountOut : quote.data.amountIn)
    : "0";
  const receiveSymbol = market
    ? (kind === "ExactInput" ? market.baseSymbol : market.quoteSymbol)
    : "";

  return (
    <NetworkGuard>
      <PageShell
        act="02 / Taker"
        title="Swap"
        intro="Quote across live pools, then send a BatchExecutor route from the connected wallet. Any failed fill reverts the whole route."
        tags={["Exact in / out", "Solver route", "Atomic batch"]}
      >
        {markets.isLoading ? <LoadingState /> : null}
        {!markets.isLoading && !market ? <ErrorState message="No market available" /> : null}
        {market ? (
          <div className="page-stack">
            <div className="layout-ticket">
              <Card title="Ticket">
                <FormField label="Market">
                  <select value={market.id} onChange={(e) => handleMarketChange(e.target.value)}>
                    {markets.data?.map((m) => (
                      <option key={m.id} value={m.id}>{m.baseSymbol}/{m.quoteSymbol}</option>
                    ))}
                  </select>
                </FormField>
                <div style={{ marginTop: "0.75rem" }}>
                  <p className="form-field-label" style={{ marginBottom: "0.35rem" }}>Direction</p>
                  <SegmentTabs
                    layoutId="swap-kind"
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: "ExactInput", label: "Exact in" },
                      { value: "ExactOutput", label: "Exact out" },
                    ]}
                  />
                </div>
                <div className="form-grid" style={{ marginTop: "0.75rem" }}>
                  <HumanWadField
                    label="Amount"
                    value={amount}
                    onChange={setAmount}
                    suffix={kind === "ExactInput" ? market.quoteSymbol : market.baseSymbol}
                  />
                  <HumanUnitField label="Slippage" value={slippageBps} onChange={setSlippageBps} suffix="bps" />
                  <HumanUnitField label="Deadline" value={deadlineMinutes} onChange={setDeadlineMinutes} suffix="min" />
                </div>
                <FormField label="Recipient" hint={customRecipient ? "custom" : "connected wallet"} >
                  <input
                    type="text"
                    placeholder={address ?? "connect wallet"}
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                  />
                </FormField>
                <div className="balance-row">
                  <TokenBalanceReadout token={market.baseToken} symbol={market.baseSymbol} />
                  <TokenBalanceReadout token={market.quoteToken} symbol={market.quoteSymbol} />
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <PrimaryCta disabled={!address || !gate.ready} onClick={() => void handleBuildRoute()}>
                    Build route
                  </PrimaryCta>
                </div>
                {gate.message ? <p className="error" style={{ marginTop: "0.5rem" }}>{gate.message}</p> : null}
                <p className="muted atomic-note">
                  Settlement targets RiptideBatchExecutor only. If any fill fails or slippage is exceeded, the whole route reverts and you keep your funds.
                </p>
                <details className="advanced" style={{ marginTop: "0.85rem" }}>
                  <summary>Demo tools</summary>
                  <DemoTokenFaucet
                    tokens={[
                      { address: market.baseToken, symbol: market.baseSymbol },
                      { address: market.quoteToken, symbol: market.quoteSymbol },
                    ]}
                  />
                </details>
              </Card>

              <div className="page-stack">
                {quote.isLoading ? <LoadingState label="Fetching quote…" /> : null}
                {quote.error ? <ErrorState message={(quote.error as Error).message} /> : null}
                <AnimatePresence mode="wait">
                  {quote.data ? (
                    <motion.div
                      key={`${kind}-${receiveWad}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Card title="Quote">
                        <p className="form-field-label">{kind === "ExactInput" ? "You receive" : "You pay"}</p>
                        <p className="quote-receive">
                          <Counter value={wadToNumber(receiveWad)} decimals={4} />{" "}
                          <span style={{ fontSize: "0.45em" }}>{receiveSymbol}</span>
                        </p>
                        <div className="quote-meta">
                          <span title={`${quote.data.feeBpsApplied} fee units (1e7 = 100%)`}>Fee {formatFeePercent(quote.data.feeBpsApplied)} · {formatFeeBpsLabel(quote.data.feeBpsApplied)}</span>
                          <span>σ {formatWad(quote.data.sigmaWad, 3)}</span>
                          {routeStats ? <span>Impact {formatBps(routeStats.impactBps)}</span> : null}
                          <FreshnessBadge {...quote.data.freshness} />
                        </div>
                      </Card>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {fills.length > 0 ? (
                  <Card title="Route breakdown">
                    <p className="muted">Solver fill allocations from the live certificate — not a fee-weighted guess.</p>
                    <DataTable
                      headers={["Maker", "Strategy", "Fee", "Amount in", "Amount out", "Eff. price"]}
                      rows={fills.map((f) => {
                        const price = fillPrice(f);
                        return [
                          <span key="m" title={f.maker}>{formatAddress(f.maker)}</span>,
                          f.candidateId,
                          formatFeePercent(f.feeBps),
                          formatWad(f.amountIn),
                          formatWad(f.amountOut),
                          price ? formatWad(price) : "—",
                        ];
                      })}
                    />
                    {routeStats ? (
                      <p className="muted" style={{ marginTop: "0.75rem" }}>
                        Worst marginal {formatWad(routeStats.worst)} · impact {formatBps(routeStats.impactBps)}
                      </p>
                    ) : null}
                    {routePlan?.freshness ? <FreshnessBadge {...routePlan.freshness} /> : null}
                  </Card>
                ) : quote.data ? (
                  <Card title="Route breakdown">
                    <p className="muted">Build a route to see the solver split across makers, per-maker prices, and the worst marginal fill.</p>
                  </Card>
                ) : null}

                {error ? <RiptideErrorDisplay error={error} /> : null}
                {simulation && !simulation.success && simulation.error ? <RiptideErrorDisplay error={simulation.error} /> : null}
                {simulation?.success ? <div className="card success card-flush" data-testid="simulation-result">eth_call simulation passed</div> : null}
                {/* No onExecute: the plan is approve + execute, and the stepper walks both. */}
                <TransactionStepper plan={routePlan} successLabel="Swap executed" />
              </div>
            </div>
          </div>
        ) : null}
      </PageShell>
    </NetworkGuard>
  );
}
