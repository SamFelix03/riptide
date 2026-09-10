/** Official Uniswap V3 Ethereum mainnet subgraph (Uniswap Labs). MCP comparison only. */
export const DEFAULT_DEX_SUBGRAPH_ID = "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV";

export const DEX_SUBGRAPH_IDS = {
  uniswapV3OfficialMainnet: DEFAULT_DEX_SUBGRAPH_ID,
} as const;

export function graphGatewaySubgraphUrl(apiKey: string, subgraphId = DEFAULT_DEX_SUBGRAPH_ID): string {
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
}

/** @deprecated Use graphGatewaySubgraphUrl with GRAPH_API_KEY */
export function dexSubgraphUrl(): string | undefined {
  const key = process.env.GRAPH_API_KEY;
  const id = process.env.DEX_SUBGRAPH_ID ?? DEFAULT_DEX_SUBGRAPH_ID;
  if (!key) return process.env.DEX_SUBGRAPH_URL || undefined;
  return graphGatewaySubgraphUrl(key, id);
}
