"use client";

import { motion, useInView, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const SHADE_EASE = [0.22, 1, 0.36, 1] as const;

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function Counter({
  value,
  decimals = 2,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 22, mass: 0.7 });
  const text = useTransform(spring, (v) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  );
  useEffect(() => {
    mv.set(reduced ? value : value);
  }, [value, mv, reduced]);

  if (reduced) {
    return (
      <span className={cn("tabular", className)}>
        {value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </span>
    );
  }

  return <motion.span className={cn("tabular", className)}>{text}</motion.span>;
}

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/\\<>#*";
export function Decrypt({
  text,
  className,
  delay = 0,
  speed = 28,
}: {
  text: string;
  className?: string;
  delay?: number;
  speed?: number;
}) {
  const [out, setOut] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!inView || reduced) {
      setOut(text);
      return;
    }
    let frame = 0;
    let raf = 0;
    const timer = window.setTimeout(() => {
      const tick = () => {
        frame += 1;
        const revealed = Math.floor(frame / 2);
        setOut(
          text
            .split("")
            .map((c, i) =>
              i < revealed || c === " " ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            )
            .join(""),
        );
        if (revealed <= text.length) raf = window.setTimeout(tick, speed);
      };
      tick();
    }, delay);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(raf);
    };
  }, [inView, text, delay, speed, reduced]);

  return (
    <span ref={ref} className={className}>
      {out}
    </span>
  );
}

export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : delay, ease: SHADE_EASE }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function TiltCard({
  children,
  className,
  intensity = 6,
  style,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
  style?: CSSProperties;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), {
    stiffness: 200,
    damping: 20,
  });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), {
    stiffness: 200,
    damping: 20,
  });

  return (
    <motion.div
      ref={ref}
      onPointerMove={(e) => {
        if (reduced) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={reduced ? style : { ...style, rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={cn("corner-ticks surface grain group relative", className)}
    >
      {children}
    </motion.div>
  );
}

function seriesPoints(data: number[], lo: number, range: number) {
  return data.map((v, i) => {
    const px = (i / (data.length - 1)) * 100;
    const py = 36 - ((v - lo) / range) * 30;
    return { x: px, y: py, v };
  });
}

export function SVGSparkline({
  data,
  dataB,
  className,
  stroke = "var(--primary)",
  strokeB = "var(--secondary)",
  unit,
}: {
  data: number[];
  dataB?: number[];
  className?: string;
  stroke?: string;
  strokeB?: string;
  unit?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<{
    i: number;
    x: number;
    y: number;
    yB?: number;
    v: number;
    vB?: number;
    left: number;
    top: number;
    place: "left" | "right";
  } | null>(null);

  if (data.length < 2) {
    return (
      <div
        className={cn("muted", className)}
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Collecting samples…
      </div>
    );
  }

  const combined = dataB && dataB.length === data.length ? [...data, ...dataB] : data;
  const max = Math.max(...combined);
  const min = Math.min(...combined);
  const pad = max === min ? Math.max(Math.abs(max) * 0.08, 0.5) : 0;
  const lo = min - pad;
  const hi = max + pad;
  const range = hi - lo || 1;
  const points = seriesPoints(data, lo, range);
  const pointsB = dataB && dataB.length === data.length ? seriesPoints(dataB, lo, range) : null;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const dB = pointsB?.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${d} L100,40 L0,40 Z`;
  const last = points[points.length - 1]!;
  const gradId = `rt-spark-${uid}`;

  function formatTip(v: number) {
    return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const i = Math.max(0, Math.min(data.length - 1, Math.round((xPct / 100) * (data.length - 1))));
    const p = points[i];
    if (!p) return;
    const pB = pointsB?.[i];
    const left = (p.x / 100) * rect.width;
    const top = (p.y / 40) * rect.height;
    setHover({
      i,
      x: p.x,
      y: p.y,
      yB: pB?.y,
      v: p.v,
      vB: pB?.v,
      left,
      top,
      place: left > rect.width * 0.62 ? "left" : "right",
    });
  }

  return (
    <div className="chart-tooltip-wrap">
      <motion.svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className={className}
        style={{ height: 72, width: "100%", cursor: "crosshair", display: "block" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.6 }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <motion.path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0 : 0.9, ease: SHADE_EASE }}
        />
        {dB ? (
          <motion.path
            d={dB}
            fill="none"
            stroke={strokeB}
            strokeWidth="1.2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 0.9, delay: reduced ? 0 : 0.12, ease: SHADE_EASE }}
          />
        ) : null}
        <circle cx={last.x} cy={last.y} r="1.6" fill={stroke} vectorEffect="non-scaling-stroke" />
        {hover ? (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1="0"
              y2="40"
              stroke="var(--muted-foreground)"
              strokeWidth="0.35"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hover.x} cy={hover.y} r="1.8" fill={stroke} vectorEffect="non-scaling-stroke" />
            {hover.yB != null ? (
              <circle cx={hover.x} cy={hover.yB} r="1.8" fill={strokeB} vectorEffect="non-scaling-stroke" />
            ) : null}
          </>
        ) : null}
      </motion.svg>
      {hover ? (
        <div
          role="tooltip"
          className={`chart-tooltip chart-tooltip-${hover.place}`}
          style={{ left: hover.left, top: hover.top }}
        >
          {hover.vB != null ? (
            <>
              <div className="chart-tooltip-row">
                <span className="chart-tooltip-swatch" style={{ background: stroke }} />
                <span className="tabular">{formatTip(hover.v)}</span>
              </div>
              <div className="chart-tooltip-row">
                <span className="chart-tooltip-swatch" style={{ background: strokeB }} />
                <span className="tabular">{formatTip(hover.vB)}</span>
              </div>
            </>
          ) : (
            <div className="chart-tooltip-row">
              <span className="tabular">{formatTip(hover.v)}</span>
              {unit ? <span className="muted">{unit}</span> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PrimaryCta({
  children,
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.button
      type="button"
      whileHover={disabled || reduced ? undefined : { y: -1 }}
      whileTap={disabled || reduced ? undefined : { scale: 0.98 }}
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{ width: "100%" }}
    >
      {children}
    </motion.button>
  );
}

export function SegmentTabs<T extends string>({
  layoutId,
  value,
  onChange,
  options,
}: {
  layoutId: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segment-tabs" role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "is-active" : undefined}
            onClick={() => onChange(o.value)}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="segment-tabs-pill"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span style={{ position: "relative" }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
