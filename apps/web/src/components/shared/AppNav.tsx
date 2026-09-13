"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

import { ChainBanner } from "@/components/shared/NetworkGuard";
import { HeaderTokenBalances } from "@/components/shared/HeaderTokenBalances";
import { WalletConnectButton } from "@/components/shared/WalletConnectButton";

const LINKS = [
  { href: "/", label: "Hub" },
  { href: "/make", label: "Make" },
  { href: "/swap", label: "Swap" },
  { href: "/resolve", label: "Resolve" },
  { href: "/positions", label: "Positions" },
  { href: "/analytics", label: "Analytics" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M3 12c4.5-6 7.5-9 9-9s4.5 3 9 9c-4.5 6-7.5 9-9 9s-4.5-3-9-9Zm9-4.2A4.2 4.2 0 1 0 12 16.2 4.2 4.2 0 0 0 12 7.8Z" />
              </svg>
            </span>
            <span className="brand-name">Riptide</span>
          </Link>

          <nav className="desktop-nav" aria-label="Primary">
            {LINKS.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} className="nav-link" style={{ position: "relative" }}>
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="nav-pill-bg"
                    />
                  )}
                  <span style={{ position: "relative" }} className={active ? "" : "muted"}>
                    {l.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="header-wallet">
            <HeaderTokenBalances />
            <WalletConnectButton />
          </div>
        </div>
      </header>
      <ChainBanner />
      <nav className="mobile-nav" aria-label="Mobile">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={active ? "active" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
