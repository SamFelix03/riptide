"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toHex } from "viem";
import { decodeStrategy, encodeStrategy, policyHash, strategyKey as computeStrategyKey, type Strategy } from "@riptide/strategy-sdk";
import { diamondSplit, feeTarget } from "@riptide/riptide-math";

import { Card, ErrorState, FreshnessBadge, HonestyBadge, StatTile } from "@/components/shared/DesignSystem";
import { ChartPanel } from "@/components/shared/ChartPanel";
import { FormField, HumanFeeField, HumanRatioField, HumanUnitField, HumanWadField } from "@/components/shared/FormField";
import { PageShell } from "@/components/shared/PageShell";
import { DemoTokenFaucet } from "@/components/shared/DemoTokenFaucet";
import { NetworkGuard } from "@/components/shared/NetworkGuard";
import { PrimaryCta, Reveal } from "@/components/shared/primitives";
import { AllowanceManager, TokenBalanceReadout, TransactionStepper } from "@/components/shared/WalletComponents";
import { formatAddress, formatHash, formatWad } from "@/lib/format";
import { useServerConfig } from "@/lib/useServerConfig";
import { useFrontendApi } from "@/providers/FrontendApiProvider";
import { useWallet } from "@/providers/WalletProvider";

const WAD = 1_000_000_000_000_000_000n;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

function MakePageInner() {
  const api = useFrontendApi();
  const config = useServerConfig();
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const router = useRouter();
  const params = useSearchParams();
  const marketParam = params.get("market");
  const [shipPlan, setShipPlan] = useState<Awaited<ReturnType<typeof api.buildShipStrategy>> | null>(null);

  const markets = useQuery({ queryKey: ["markets"], queryFn: () => api.listMarkets() });
  const freshness = useQuery({ queryKey: ["freshness", "make"], queryFn: () => api.getFreshness() });
  const market = markets.data?.find((m) => m.id === marketParam) ?? markets.data?.[0];
  const makerAddress = address as `0x${string}` | undefined;

  const [reserveBaseWad, setReserveBaseWad] = useState(100n * WAD);
  const [reserveQuoteWad, setReserveQuoteWad] = useState(200_000n * WAD);

  const [feeMin, setFeeMin] = useState(10_000n);
  const [feeMax, setFeeMax] = useState(50_000n);
  const [lambda, setLambda] = useState(990_000_000_000_000_000n);
  const [kp, setKp] = useState(100_000_000_000_000_000n);
  const [ki, setKi] = useState(50_000_000_000_000_000n);
  const [iMax, setIMax] = useState(500_000_000_000_000_000n);
  const [sigmaMin, setSigmaMin] = useState(5_000_000_000_000_000n);
  const [sigmaMax, setSigmaMax] = useState(500_000_000_000_000_000n);

  const [beta, setBeta] = useState(970_000_000_000_000_000n);
  const [duration, setDuration] = useState(7200);
  const [decay, setDecay] = useState(995_000_000_000_000_000n);
  const [antiSandwichPeriod, setAntiSandwichPeriod] = useState(600);

  const [oracleDecimals, setOracleDecimals] = useState(8);
  const [maxStaleness, setMaxStaleness] = useState(3600);
  const [customSalt, setCustomSalt] = useState("");

  const oracleFeed = (config.data?.chainlinkFeed as `0x${string}` | undefined) ?? ZERO_ADDR;
  const feeProvider = (config.data?.feeProvider as `0x${string}` | undefined) ?? ZERO_ADDR;

  const salt = useMemo(() => {
    if (customSalt) {
      try {
        const s = customSalt.startsWith("0x") ? customSalt : `0x${customSalt}`;
        if (s.length === 66) return s as `0x${string}`;
      } catch {}
    }
    if (!makerAddress) return "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;
    const n = BigInt(makerAddress) & 0xffffn;
    return `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
  }, [makerAddress, customSalt]);

  const strategy: Strategy = useMemo(() => ({
    maker: makerAddress ?? ZERO_ADDR,
    baseToken: market?.baseToken ?? ZERO_ADDR,
    quoteToken: market?.quoteToken ?? ZERO_ADDR,
    reserveBaseWad,
    reserveQuoteWad,
    fee: { feeMin, feeMax, lambda, kp, ki, iMax, sigmaMin, sigmaMax },
    auction: { beta, duration, decay, antiSandwichPeriod },
    oracle: { feed: oracleFeed, decimals: oracleDecimals, maxStaleness },
    feeProvider,
    salt,
  }), [
    makerAddress, market, reserveBaseWad, reserveQuoteWad,
    feeMin, feeMax, lambda, kp, ki, iMax, sigmaMin, sigmaMax,
    beta, duration, decay, antiSandwichPeriod,
    oracleFeed, oracleDecimals, maxStaleness, feeProvider, salt,
  ]);

  const feeCurve = useMemo(() => {
    const lo = strategy.fee.sigmaMin;
    const hi = strategy.fee.sigmaMax > lo ? strategy.fee.sigmaMax : lo + 1n;
    return Array.from({ length: 20 }, (_, i) => {
      const s = lo + ((hi - lo) * BigInt(i)) / 19n;
      return Number(feeTarget(s, strategy.fee.lambda, strategy.fee.feeMin, strategy.fee.feeMax));
    });
  }, [strategy.fee]);

  const payload = useMemo(() => {
    try {
      if (strategy.baseToken === ZERO_ADDR || strategy.quoteToken === ZERO_ADDR) return null;
      if (strategy.baseToken.toLowerCase() === strategy.quoteToken.toLowerCase()) return null;
      return encodeStrategy(strategy);
    } catch {
      return null;
    }
  }, [strategy]);

  const payloadHex = payload ? toHex(payload) : null;
  const payloadHash = useMemo(() => payload ? policyHash(payload) : null, [payload]);
  const sKey = useMemo(() => {
    if (!makerAddress || !salt) return null;
    return computeStrategyKey(makerAddress, salt);
  }, [makerAddress, salt]);

  const roundtripOk = useMemo(() => {
    if (!payload) return false;
    try {
      const decoded = decodeStrategy(payload);
      return decoded.maker.toLowerCase() === strategy.maker.toLowerCase()
        && decoded.fee.feeMin === strategy.fee.feeMin
        && decoded.auction.beta === strategy.auction.beta
        && policyHash(encodeStrategy(decoded)) === payloadHash;
    } catch {
      return false;
    }
  }, [payload, strategy, payloadHash]);

  let split = { payToResolver: 0n, retainToLP: WAD };
  try {
    split = diamondSplit(WAD, beta);
  } catch {
    /* invalid beta handled in validation */
  }

  const handleBuildShip = useCallback(async () => {
    setShipPlan(await api.buildShipStrategy(strategy));
  }, [api, strategy]);

  const validationErrors: string[] = [];
  try {
    if (payload === null && strategy.baseToken !== strategy.quoteToken) {
      validationErrors.push("Strategy encoding failed — check field values");
    }
  } catch {}
  if (feeMin === 0n) validationErrors.push("feeMin must be > 0");
  if (feeMin >= feeMax) validationErrors.push("feeMin must be < feeMax");
  if (lambda === 0n || lambda >= WAD) validationErrors.push("lambda must be in (0, 1e18)");
  if (beta === 0n || beta >= WAD) validationErrors.push("beta must be in (0, 1e18)");
  if (decay === 0n || decay >= WAD) validationErrors.push("decay must be in (0, 1e18)");
  if (strategy.baseToken.toLowerCase() === strategy.quoteToken.toLowerCase()) {
    validationErrors.push("Base and quote tokens must be distinct standard ERC-20s");
  }
  if (sigmaMin >= sigmaMax) validationErrors.push("sigmaMin must be < sigmaMax");

  const baseFloat = Number(reserveBaseWad) / 1e18;
  const quoteFloat = Number(reserveQuoteWad) / 1e18;
  const startPrice = baseFloat > 0 ? quoteFloat / baseFloat : 0;
  const k = baseFloat * quoteFloat;
  const curvePoints = Array.from({ length: 40 }, (_, i) => {
    const x = baseFloat * (0.2 + (i / 39) * 1.8);
    return k / x;
  });

  const valid = validationErrors.length === 0;

  return (
    <NetworkGuard>
      <PageShell
        act="01 / Maker"
        title="Make"
        intro="Ship a strategy into Aqua. The curve stays visible while you edit reserves, fee band, and auction policy."
        tags={["Aqua.ship", "SwapVM register", "dual-leg"]}
      >
        <div className="page-stack">
          <div className="layout-studio">
            <Reveal y={10} className="layout-sticky page-stack">
              <Card title="CPMM preview">
                <div className="studio-toolbar">
                  <motion.span
                    layoutId="make-validity"
                    className={`validity-pill${valid ? " valid" : ""}`}
                  >
                    {valid ? "Draft valid" : `${validationErrors.length} issues`}
                  </motion.span>
                  {freshness.data ? <FreshnessBadge {...freshness.data} /> : null}
                </div>
                <div className="metric-row">
                  <StatTile compact label="Start price" value={startPrice.toFixed(4)} hint="quote per base" />
                  <StatTile compact label="k = x × y" value={k.toExponential(4)} />
                  <StatTile compact label="Pool value" value={`${(2 * quoteFloat).toFixed(0)} quote`} />
                </div>
                <ChartPanel title="Reserve curve" data={curvePoints} lastLabel={startPrice.toFixed(4)} unit="quote/base" />
              </Card>

              <Card title="Fee curve">
                <ChartPanel
                  title="feeTarget(σ)"
                  data={feeCurve}
                  lastLabel={feeCurve.at(-1)?.toLocaleString() ?? "—"}
                  unit="fee units"
                />
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                  Across [σ min, σ max], clamped to [feeMin, feeMax]. Fee rises with σ.
                </p>
              </Card>

              <Card title="Recapture">
                <p className="muted">Per 1 WAD surplus using Down((1−β)·S) — same rounding as DiamondSplit on-chain.</p>
                <div className="metric-row" style={{ marginTop: "0.75rem" }}>
                  <StatTile compact label="Retain to LP" value={formatWad(split.retainToLP)} hint={`≥ ${formatWad(beta)} · S`} />
                  <StatTile compact label="Pay to resolver" value={formatWad(split.payToResolver)} hint="Down((1−β)·S)" />
                </div>
              </Card>
            </Reveal>

            <div className="page-stack">
              <Card title="Market & reserves">
                <FormField label="Token pair">
                  <select
                    value={market?.id ?? ""}
                    onChange={(e) => router.push(`/make?market=${encodeURIComponent(e.target.value)}`)}
                    disabled={!markets.data?.length}
                  >
                    {markets.data?.map((m) => (
                      <option key={m.id} value={m.id}>{m.baseSymbol} / {m.quoteSymbol}</option>
                    ))}
                  </select>
                </FormField>
                <div className="form-grid" style={{ marginTop: "0.75rem" }}>
                  <HumanWadField label="Base reserve" value={reserveBaseWad} onChange={setReserveBaseWad} suffix={market?.baseSymbol ?? "RBASE"} />
                  <HumanWadField label="Quote reserve" value={reserveQuoteWad} onChange={setReserveQuoteWad} suffix={market?.quoteSymbol ?? "RQUOTE"} />
                </div>
                {market ? (
                  <div className="balance-row">
                    <TokenBalanceReadout token={market.baseToken} symbol={market.baseSymbol} />
                    <TokenBalanceReadout token={market.quoteToken} symbol={market.quoteSymbol} />
                  </div>
                ) : null}
              </Card>

              <Card title="Fee band">
                <p className="muted">Mechanism 1 — volatility-indexed LVR fee. Lambda is maker-set intensity.</p>
                <div className="form-grid" style={{ marginTop: "0.75rem" }}>
                  <HumanFeeField label="feeMin" value={feeMin} onChange={setFeeMin} />
                  <HumanFeeField label="feeMax" value={feeMax} onChange={setFeeMax} />
                  <HumanRatioField label="lambda" value={lambda} onChange={setLambda} />
                  <HumanRatioField label="sigmaMin" value={sigmaMin} onChange={setSigmaMin} />
                  <HumanRatioField label="sigmaMax" value={sigmaMax} onChange={setSigmaMax} />
                </div>
              </Card>

              <Card title="Auction">
                <p className="muted">Mechanism 2 — Dutch rebalance with β-split surplus recapture.</p>
                <div className="form-grid" style={{ marginTop: "0.75rem" }}>
                  <HumanRatioField label="beta" value={beta} onChange={setBeta} hint={`${(Number(beta) / 1e18 * 100).toFixed(1)}% to LP`} />
                  <HumanUnitField label="duration" value={duration} onChange={setDuration} suffix="s" />
                  <HumanRatioField label="decay" value={decay} onChange={setDecay} />
                  <HumanUnitField label="anti-sandwich" value={antiSandwichPeriod} onChange={setAntiSandwichPeriod} suffix="s" />
                </div>
              </Card>

              <Card title="Oracle">
                <p className="muted">Chainlink feed for freshness + EWMA σ. Not OraclePriceAdjuster.</p>
                <div className="form-grid" style={{ marginTop: "0.75rem" }}>
                  <FormField label="Feed" hint="Set via server config">
                    <input value={oracleFeed} readOnly title={oracleFeed} />
                  </FormField>
                  <HumanUnitField label="Decimals" value={oracleDecimals} onChange={setOracleDecimals} />
                  <HumanUnitField label="Max staleness" value={maxStaleness} onChange={setMaxStaleness} suffix="s" />
                </div>
              </Card>

              {validationErrors.length > 0 ? (
                <ErrorState message={validationErrors.join(" · ")} />
              ) : null}

              <PrimaryCta
                disabled={!makerAddress || !market || !config.data || validationErrors.length > 0}
                onClick={() => void handleBuildShip()}
              >
                Build ship plan
              </PrimaryCta>
              <p className="muted" style={{ fontSize: "0.75rem" }}>
                Signer {makerAddress ? formatAddress(makerAddress) : "—"}. Approves Aqua, then ships swap + rebalance legs.
              </p>

              <details className="advanced">
                <summary>Advanced — PI, salt, payload, allowances</summary>
                <div className="form-grid">
                  <HumanRatioField label="kp" value={kp} onChange={setKp} />
                  <HumanRatioField label="ki" value={ki} onChange={setKi} />
                  <HumanRatioField label="iMax" value={iMax} onChange={setIMax} />
                </div>
                <FormField label="Custom salt" hint={`Current ${formatHash(salt)}`}>
                  <input
                    placeholder="auto-derived from wallet"
                    value={customSalt}
                    onChange={(e) => setCustomSalt(e.target.value)}
                  />
                </FormField>
                <p className="muted" title={sKey ?? undefined}>strategyKey {sKey ? formatHash(sKey) : "—"}</p>
                <p className="muted" title={payloadHash ?? undefined}>policyHash {payloadHash ? formatHash(payloadHash) : "—"}</p>
                {payloadHex ? (
                  <pre className="mono" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap", fontSize: "0.6875rem", padding: "0.75rem", background: "var(--elevated)", borderRadius: "var(--radius)", maxHeight: "10rem", overflow: "auto" }}>{payloadHex}</pre>
                ) : null}
                {sKey && payloadHash ? (
                  <p>
                    Encode → decode → re-hash {roundtripOk ? "matches" : "failed"}.{" "}
                    <HonestyBadge status={roundtripOk ? "verified" : "confirm"} />
                  </p>
                ) : null}
                {market && config.data ? (
                  <div className="page-stack" style={{ marginTop: "0.75rem" }}>
                    <AllowanceManager bare token={market.baseToken} spender={config.data.aqua} symbol={market.baseSymbol} />
                    <AllowanceManager bare token={market.quoteToken} spender={config.data.aqua} symbol={market.quoteSymbol} />
                  </div>
                ) : null}
                {market ? (
                  <DemoTokenFaucet
                    tokens={[
                      { address: market.baseToken, symbol: market.baseSymbol },
                      { address: market.quoteToken, symbol: market.quoteSymbol },
                    ]}
                  />
                ) : null}
              </details>
            </div>
          </div>

          <TransactionStepper
            plan={shipPlan}
            requiredSigner={address ?? undefined}
            successLabel="Strategy shipped — pool is live on-chain"
            successFootnote="Both Aqua orders (swap + rebalance) are shipped and registered. Takers can fill on Swap; after oracle skew, resolvers can settle rebalances on Resolve."
            onSuccess={() => {
              void queryClient.refetchQueries({ queryKey: ["strategies"] });
              void queryClient.refetchQueries({ queryKey: ["markets"] });
            }}
          />
        </div>
      </PageShell>
    </NetworkGuard>
  );
}

export default function MakePage() {
  return (
    <Suspense fallback={<div className="card muted">Loading…</div>}>
      <MakePageInner />
    </Suspense>
  );
}
