"use client";

import { motion, useScroll, useTransform } from "motion/react";

export function Backdrop() {
  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <div className="backdrop" aria-hidden>
      <motion.div style={{ y: y1 }} className="hairline-grid" />
      <motion.div
        style={{ y: y2 }}
        className="backdrop-ring"
      />
      <motion.div
        style={{ y: y1 }}
        className="backdrop-ring"
      />
      <div className="grain" style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          height: "16rem",
          background: "linear-gradient(to top, var(--background), transparent)",
        }}
      />
    </div>
  );
}

export function Ticker({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {doubled.map((t, i) => (
          <span key={`${t}-${i}`} className="label-xs" style={{ whiteSpace: "nowrap" }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
