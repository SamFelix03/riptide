"use client";

import type { ReactNode } from "react";

import { Reveal } from "./primitives";

export function PageShell({
  act,
  title,
  intro,
  tags,
  children,
}: {
  act: string;
  title: string;
  intro: ReactNode;
  tags?: string[];
  children: ReactNode;
}) {
  return (
    <div>
      <div className="page-kicker">
        <div style={{ maxWidth: "32rem" }}>
          <p className="label-xs">{act}</p>
          <h1 className="page-title">{title}</h1>
          <p className="muted" style={{ marginTop: "1.15rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
            {intro}
          </p>
        </div>
        {tags?.length ? (
          <div className="page-tags">
            {tags.map((t) => (
              <p key={t} className="label-xs">
                [ {t} ]
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <Reveal y={12} className="page-shell-body">
        {children}
      </Reveal>
    </div>
  );
}
