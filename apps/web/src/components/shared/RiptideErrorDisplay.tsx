"use client";

import type { RiptideFrontendError } from "@riptide/frontend-api";

export function RiptideErrorDisplay({ error }: { error: RiptideFrontendError | { code: string; message: string } }) {
  return (
    <div className="card error corner-ticks" data-testid="riptide-error">
      <strong>{error.code}</strong>
      <div>{error.message}</div>
    </div>
  );
}
