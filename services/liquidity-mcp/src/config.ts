import "./load-env.js";

import { resolveRuntimeEndpoints, SERVICE_PORTS } from "@riptide/contracts";

/** Official Uniswap V3 Ethereum mainnet subgraph (Uniswap Labs). */
export const DEFAULT_DEX_SUBGRAPH_ID = "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV";

export type LiquidityMcpConfig = {
  rpcUrl: string;
  rpcUrlFallback?: string;
  chainId: number;
  subgraphUrl?: string;
  graphApiKey?: string;
  dexSubgraphId: string;
  dexPoolId?: string;
  healthPort: number;
};

export function loadConfig(): LiquidityMcpConfig {
  const { rpcUrl, rpcUrlFallback, chainId, subgraphUrl } = resolveRuntimeEndpoints();
  const graphApiKey = process.env.GRAPH_API_KEY || undefined;
  const dexSubgraphId = process.env.DEX_SUBGRAPH_ID ?? DEFAULT_DEX_SUBGRAPH_ID;
  const dexPoolId = process.env.DEX_POOL_ID || undefined;
  const healthPort = Number.parseInt(process.env.HEALTH_PORT ?? String(SERVICE_PORTS.liquidityMcp), 10);

  return { rpcUrl, rpcUrlFallback, chainId, subgraphUrl, graphApiKey, dexSubgraphId, dexPoolId, healthPort };
}

export function graphGatewaySubgraphUrl(apiKey: string, subgraphId: string): string {
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
}
