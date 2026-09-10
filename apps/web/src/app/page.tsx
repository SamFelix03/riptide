"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Waves,
  ArrowLeftRight,
  Gavel,
  LayoutDashboard,
  BarChart3,
  BookOpen,
} from "lucide-react";

import { Ticker } from "@/components/shared/Backdrop";
import { Card, StatTile } from "@/components/shared/DesignSystem";
import { Equation } from "@/components/shared/Equation";
import { Counter, Decrypt, Reveal, TiltCard } from "@/components/shared/primitives";
import { useFrontendApi } from "@/providers/FrontendApiProvider";
import { wadToNumber } from "@/lib/format";
import { HOW_IT_WORKS, LANDING_MATH, LANDING_STORY, MECHANISMS, LOOP_STEPS, COMPARISON } from "@/lib/copy";

const ACTS = [
  {
    n: "01",
    to: "/make",
    icon: Waves,
    title: "Make",
    body: "Configure a CPMM strategy with volatility-indexed fees and ship it into Aqua.",
  },
  {
    n: "02",
    to: "/swap",
    icon: ArrowLeftRight,
    title: "Swap",
    body: "Trade across active strategies with transparent dynamic fees and atomic settlement.",
  },
  {
    n: "03",
    to: "/resolve",
    icon: Gavel,
    title: "Resolve",
    body: "Bid on Dutch rebalancing auctions and earn the (1\u2212\u03B2) execution margin.",
  },
  {
    n: "04",
    to: "/positions",
    icon: LayoutDashboard,
    title: "Positions",
    body: "Monitor live reserves, fee controller telemetry, and manage your strategy lifecycle.",
  },
  {
    n: "05",
    to: "/analytics",
    icon: BarChart3,
    title: "Analytics",
    body: "Recapture dashboard: fee vs LVR, \u03C3 time series, and the self-reinforcing loop.",
  },
  {
    n: "06",
    to: "https://github.com",
    icon: BookOpen,
    title: "Docs",
    body: "Read the normative specification: product, math, contracts, architecture.",
  },
] as const;

export default function LandingPage() {
  const api = useFrontendApi();
  const stats = useQuery({ queryKey: ["recapture", "protocol"], queryFn: () => api.getRecaptureStats("protocol") });
  const markets = useQuery({ queryKey: ["markets"], queryFn: () => api.listMarkets() });

  const tickerItems = [
    "RBASE / RQUOTE",
    "Mechanism 1 \u00B7 volatility-indexed fee",
    "Mechanism 2 \u00B7 Dutch rebalance",
    "\u00B7 sealed \u00B7",
    "Base Sepolia",
    "The Graph",
    "1inch Aqua + SwapVM",
    "\u00B7 sealed \u00B7",
  ];

  const marketsCount = markets.data?.length ?? 0;
  const volume = stats.data?.totalFillVolume ?? "0";
  const recaptured = stats.data?.totalRecapture ?? "0";

  return (
    <div>
      {/* Hero */}
      <section style={{ display: "flex", minHeight: "62vh", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <motion.p
          className="label-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          LVR Internalization Engine
        </motion.p>

        <h1 className="display-xl" style={{ marginTop: "1.25rem", maxWidth: "52rem", fontSize: "clamp(3rem, 10vw, 6rem)" }}>
          {"RIPTIDE".split("").map((char, ci) => (
            <span key={ci} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
              <motion.span
                style={{ display: "inline-block" }}
                initial={{ y: "110%" }}
                animate={{ y: 0 }}
                transition={{ delay: 0.15 + ci * 0.06, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              >
                {char}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          className="muted"
          style={{ marginTop: "1.5rem", maxWidth: "36rem", fontSize: "0.875rem", lineHeight: 1.65 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          RIPTIDE internalizes LVR: a volatility-indexed fee (Mechanism 1) plus a resolver rebalancing auction that returns β of the surplus to LPs (Mechanism 2), where the auction&apos;s revealed price re-calibrates the fee (the loop).
        </motion.p>

        <motion.div
          style={{ marginTop: "2.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.72 }}
        >
          <Link href="/make" style={{ display: "inline-block" }}>
            <motion.span
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: "inline-block",
                background: "var(--foreground)",
                color: "var(--background)",
                borderRadius: "9999px",
                padding: "0.65rem 1.75rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                transition: "background-color 0.3s",
              }}
            >
              Start Making
            </motion.span>
          </Link>
          <Link href="/swap" style={{ display: "inline-block" }}>
            <span
              style={{
                display: "inline-block",
                border: "1px solid var(--border)",
                borderRadius: "9999px",
                padding: "0.65rem 1.5rem",
                fontSize: "0.8125rem",
                transition: "border-color 0.3s, color 0.3s",
              }}
            >
              Start Trading
            </span>
          </Link>
        </motion.div>

        <motion.p
          className="tabular muted"
          style={{ marginTop: "2.5rem", fontSize: "0.6875rem" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          <Decrypt text="0xRIPTIDE::LVR_INTERNALIZED" delay={900} /> &middot; engine online
        </motion.p>
      </section>

      {/* Ticker */}
      <Ticker items={tickerItems} />

      {/* Story */}
      <section className="landing-story" data-testid="landing-story">
        <Reveal className="grid grid-2">
          <TiltCard>
            <div style={{ padding: "1.5rem" }}>
              <p className="label-xs">{LANDING_STORY.problem.kicker}</p>
              <h2 className="display-xl" style={{ marginTop: "1.25rem", fontSize: "1.5rem" }}>{LANDING_STORY.problem.title}</h2>
              <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8125rem", lineHeight: 1.7 }}>{LANDING_STORY.problem.body}</p>
            </div>
          </TiltCard>
          <TiltCard>
            <div style={{ padding: "1.5rem" }}>
              <p className="label-xs">{LANDING_STORY.solution.kicker}</p>
              <h2 className="display-xl" style={{ marginTop: "1.25rem", fontSize: "1.5rem" }}>{LANDING_STORY.solution.title}</h2>
              <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8125rem", lineHeight: 1.7 }}>{LANDING_STORY.solution.body}</p>
            </div>
          </TiltCard>
        </Reveal>
        <Reveal>
          <Card title={LANDING_STORY.people.kicker}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.25rem" }}>
              {LANDING_STORY.people.roles.map((role) => (
                <div key={role.title}>
                  <span className="label-xs">{role.n}</span>
                  <h3 className="display-xl" style={{ marginTop: "0.5rem", fontSize: "1.125rem" }}>{role.title}</h3>
                  <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.8125rem", lineHeight: 1.6 }}>{role.body}</p>
                  <span style={{ display: "block", height: 1, marginTop: "0.75rem", background: "var(--border)" }} />
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </section>

      {/* Math */}
      <Reveal style={{ marginTop: "1rem" }}>
        <Card testId="landing-math">
          <header className="math-panel-head">
            <p className="label-xs">{LANDING_MATH.kicker}</p>
            <p className="display-xl" style={{ marginTop: "0.7rem", fontSize: "clamp(1.35rem, 3.2vw, 1.85rem)" }}>
              {LANDING_MATH.title}
            </p>
            <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8125rem", lineHeight: 1.65 }}>
              {LANDING_MATH.lead}
            </p>
          </header>
          <div className="math-rows">
            {LANDING_MATH.blocks.map((block) => (
              <article key={block.kicker} className="math-row">
                <div className="math-row-copy">
                  <p className="label-xs">{block.kicker}</p>
                  <h3 className="display-xl" style={{ marginTop: "0.55rem", fontSize: "1.125rem" }}>{block.title}</h3>
                  <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.8125rem", lineHeight: 1.65 }}>{block.body}</p>
                  <p className="math-refs">
                    <a href={block.spec.href} target="_blank" rel="noreferrer">{block.spec.label}</a>
                    <a href={block.paper.href} target="_blank" rel="noreferrer">{block.paper.label}</a>
                  </p>
                </div>
                <div className="math-row-eqs">
                  {block.equations.map((tex) => (
                    <Equation key={tex} tex={tex} />
                  ))}
                </div>
              </article>
            ))}
          </div>
          <footer className="math-panel-foot">
            <p className="muted" style={{ fontSize: "0.8125rem", lineHeight: 1.65 }}>
              {LANDING_MATH.loop.body}{" "}
              <a href={LANDING_MATH.loop.spec.href} target="_blank" rel="noreferrer">{LANDING_MATH.loop.spec.label}</a>
            </p>
            <p className="math-refs">
              {LANDING_MATH.sources.map((s) => (
                <a key={s.href} href={s.href} target="_blank" rel="noreferrer">{s.label}</a>
              ))}
            </p>
          </footer>
        </Card>
      </Reveal>

      {/* Live protocol stats */}
      <section className="grid grid-3" style={{ marginTop: "1.5rem" }} data-testid="live-protocol-stats">
        <Reveal delay={0.05}>
          <StatTile label="Markets">
            <Counter value={marketsCount} decimals={0} />
          </StatTile>
        </Reveal>
        <Reveal delay={0.12}>
          <StatTile label="Indexed volume">
            <Counter value={wadToNumber(volume)} decimals={2} />
          </StatTile>
        </Reveal>
        <Reveal delay={0.19}>
          <StatTile label="Cumulative β-recaptured" hint={stats.data ? `Block #${stats.data.indexedBlock}` : undefined}>
            <Counter value={wadToNumber(recaptured)} decimals={4} />
          </StatTile>
        </Reveal>
      </section>

      {/* Mechanisms */}
      <Reveal className="grid grid-2" style={{ marginTop: "2rem" }}>
        <TiltCard>
          <div style={{ padding: "1.5rem" }}>
            <p className="label-xs">{MECHANISMS.m1.title}</p>
            <h2 className="display-xl" style={{ marginTop: "1.25rem", fontSize: "1.5rem" }}>{MECHANISMS.m1.subtitle}</h2>
            <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8125rem", lineHeight: 1.7 }}>{MECHANISMS.m1.body}</p>
          </div>
        </TiltCard>
        <TiltCard>
          <div style={{ padding: "1.5rem" }}>
            <p className="label-xs">{MECHANISMS.m2.title}</p>
            <h2 className="display-xl" style={{ marginTop: "1.25rem", fontSize: "1.5rem" }}>{MECHANISMS.m2.subtitle}</h2>
            <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8125rem", lineHeight: 1.7 }}>{MECHANISMS.m2.body}</p>
          </div>
        </TiltCard>
      </Reveal>

      {/* The Loop */}
      <Reveal style={{ marginTop: "1rem" }}>
        <Card title="The Self-Reinforcing Loop">
          <p className="muted" style={{ marginBottom: "1.25rem", fontSize: "0.8125rem", lineHeight: 1.7 }}>
            {MECHANISMS.loop.body}
          </p>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.25rem" }}>
            {LOOP_STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, ease: [0.22, 1, 0.36, 1], duration: 0.6 }}
              >
                <span className="label-xs">{s.n}</span>
                <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", lineHeight: 1.6 }}>{s.label}</p>
                <span style={{ display: "block", height: 1, marginTop: "0.75rem", background: "var(--border)", transition: "background-color 0.5s" }} />
              </motion.div>
            ))}
          </div>
        </Card>
      </Reveal>

      {/* ACTS Grid */}
      <section className="grid grid-2" style={{ marginTop: "1rem" }}>
        {ACTS.map((a, i) => (
          <Reveal key={a.title} delay={i * 0.07}>
            <TiltCard className="h-full" style={{ height: "100%" }}>
              <Link href={a.to} style={{ display: "block", padding: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="label-xs">{a.n}</span>
                  <a.icon style={{ width: 16, height: 16, color: "var(--primary)" }} />
                </div>
                <h2 className="display-xl" style={{ marginTop: "1.5rem", fontSize: "1.5rem" }}>{a.title}</h2>
                <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8125rem", lineHeight: 1.6 }}>{a.body}</p>
                <span className="label-xs" style={{ marginTop: "1.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  Enter
                  <motion.span style={{ display: "inline-flex" }} whileHover={{ x: 4 }}>
                    <ArrowRight style={{ width: 12, height: 12 }} />
                  </motion.span>
                </span>
              </Link>
            </TiltCard>
          </Reveal>
        ))}
      </section>

      {/* Comparison Table */}
      <Reveal style={{ marginTop: "1rem" }}>
        <details className="advanced">
          <summary>Ordinary AMM vs RIPTIDE</summary>
          <table>
            <thead>
              <tr>
                <th>Ordinary AMM</th>
                <th>RIPTIDE</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={i}>
                  <td className="muted">{row.ordinary}</td>
                  <td>{row.riptide}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Reveal>

      {/* How It Works */}
      <Reveal style={{ marginTop: "1rem" }}>
        <div className="card corner-ticks grain" style={{ padding: "2rem 1.5rem" }}>
          <p className="label-xs">How It Works</p>
          <div className="grid" style={{ marginTop: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "2rem" }}>
            {HOW_IT_WORKS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, ease: [0.22, 1, 0.36, 1], duration: 0.6 }}
              >
                <span className="label-xs">{s.n}</span>
                <h3 className="display-xl" style={{ marginTop: "0.75rem", fontSize: "1.125rem" }}>{s.title}</h3>
                <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.75rem", lineHeight: 1.7 }}>{s.body}</p>
                <span style={{ display: "block", height: 1, marginTop: "1.25rem", background: "var(--border)", transition: "background-color 0.5s" }} />
              </motion.div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Sponsor Footer */}
      <footer style={{ marginTop: "4rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <p className="label-xs">RIPTIDE &middot; Base Sepolia</p>
        <p className="label-xs">Built on 1inch Aqua + SwapVM &middot; Indexed by The Graph</p>
      </footer>
    </div>
  );
}
