import "./load-env.js";

import {
  defaultSolverApiUrl,
  isLocalAnvil,
  resolveChainId,
  resolveRpcUrl,
  resolveSubgraphUrl,
  loadManifest,
} from "@riptide/contracts";

export type FrontendApiConfig = {
  rpcUrl: string;
  chainId: number;
  subgraphUrl?: string;
  solverApiUrl?: string;
  chainlinkFeed?: string;
};

export function loadFrontendApiConfig(opts?: { chainId?: number }): FrontendApiConfig {
  const chainId = opts?.chainId ?? resolveChainId();
  let subgraphUrl: string | undefined;
  let chainlinkFeed: string | undefined;
  let manifestRpc: string | undefined;
  try {
    const manifest = loadManifest(chainId);
    subgraphUrl = resolveSubgraphUrl(chainId, { manifestSubgraphUrl: manifest.subgraphUrl });
    chainlinkFeed = process.env.CHAINLINK_FEED_ADDRESS || manifest.chainlinkFeed;
    manifestRpc = manifest.rpcUrl;
  } catch {
    /* manifest not written yet */
  }
  return {
    rpcUrl: resolveRpcUrl(chainId, { manifestRpcUrl: manifestRpc }),
    chainId,
    subgraphUrl: subgraphUrl || undefined,
    solverApiUrl: process.env.SOLVER_API_URL || (isLocalAnvil(chainId) ? defaultSolverApiUrl() : undefined),
    chainlinkFeed: chainlinkFeed || undefined,
  };
}
