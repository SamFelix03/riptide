"use client";

import katex from "katex";
import "katex/dist/katex.min.css";

export function Equation({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    strict: "ignore",
    trust: false,
  });
  return (
    <span
      className={display ? "eq-block" : "eq-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
