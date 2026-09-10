import "./load-env.js";

import { resolveRuntimeEndpoints, SERVICE_DEFAULTS, SERVICE_PORTS } from "@riptide/contracts";

export type SolverConfig = {
  rpcUrl: string;
  rpcUrlFallback?: string;
  subgraphUrl?: string;
  port: number;
  chainId: number;
  maxShortlist: number;
  chainlinkFeed?: string;
};

export function loadConfig(): SolverConfig {
  const { rpcUrl, rpcUrlFallback, chainId, subgraphUrl, chainlinkFeed } = resolveRuntimeEndpoints();
  const port = Number.parseInt(process.env.PORT ?? String(SERVICE_PORTS.solverApi), 10);
  const maxShortlist = Number.parseInt(
    process.env.MAX_SHORTLIST ?? String(SERVICE_DEFAULTS.maxShortlist),
    10,
  );
  return { rpcUrl, rpcUrlFallback, subgraphUrl, port, chainId, maxShortlist, chainlinkFeed };
}
