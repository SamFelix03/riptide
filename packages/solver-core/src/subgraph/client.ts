import { loadManifest } from "@riptide/contracts";
import { marketId } from "@riptide/strategy-sdk";

export type GraphMeta = {
  block: { number: number; timestamp: number };
};

export type SubgraphStrategyRow = {
  id: string;
  strategyKey: string;
  strategyHash: string;
  maker: { id: string };
  docked: boolean;
  lastVersion: string;
  reserveBaseWad: string;
  reserveQuoteWad: string;
  aquaBase: string;
  aquaQuote: string;
};

export type SubgraphQueryResult = {
  _meta: GraphMeta;
  strategies: SubgraphStrategyRow[];
};

const ZERO_KEY = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function gql<T>(subgraphUrl: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`subgraph query failed: ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new Error("subgraph returned no data");
  return body.data;
}

const ACTIVE_STRATEGIES_QUERY = `
  query ActiveStrategies($market: String!) {
    _meta { block { number timestamp } }
    strategies(where: { docked: false, market: $market }) {
      id
      strategyKey
      strategyHash
      docked
      lastVersion
      reserveBaseWad
      reserveQuoteWad
      aquaBase
      aquaQuote
      maker { id }
    }
  }
`;

export async function queryActiveStrategies(
  subgraphUrl: string,
  marketIdParam: string,
): Promise<SubgraphQueryResult> {
  const data = await gql<SubgraphQueryResult>(subgraphUrl, ACTIVE_STRATEGIES_QUERY, { market: marketIdParam });
  data.strategies = data.strategies.filter(
    (s) => s.strategyKey.toLowerCase() !== ZERO_KEY && s.strategyKey !== "0x00000000",
  );
  return data;
}

export async function queryMetaBlock(subgraphUrl: string): Promise<GraphMeta> {
  const data = await gql<{ _meta: GraphMeta }>(subgraphUrl, `{ _meta { block { number timestamp } } }`);
  return data._meta;
}

/** Demo market id = keccak256(abi.encode(MARKET_ID_DOMAIN, base, quote)). Lazy — needs a live manifest. */
export function demoMarketId(chainId = 31337): string {
  const manifest = loadManifest(chainId);
  return marketId(manifest.demoTokens.base, manifest.demoTokens.quote);
}

export function demoMarketIdFromTokens(base: `0x${string}`, quote: `0x${string}`): string {
  return marketId(base, quote);
}

export type ProtocolStats = {
  id: string;
  totalFillVolume: string;
  totalRecapture: string;
  fillCount: string;
  rebalanceCount: string;
};

export type MarketRecaptureRow = {
  id: string;
  fillVolume: string;
  recaptureVolume: string;
};

const PROTOCOL_STATS_QUERY = `
  query ProtocolStats($id: ID!) {
    _meta { block { number timestamp } }
    protocol(id: $id) {
      id
      totalFillVolume
      totalRecapture
      fillCount
      rebalanceCount
    }
  }
`;

export async function queryProtocolStats(
  subgraphUrl: string,
  chainId = "31337",
): Promise<{ _meta: GraphMeta; protocol: ProtocolStats | null }> {
  return gql(subgraphUrl, PROTOCOL_STATS_QUERY, { id: chainId });
}

const MARKET_RECAPTURE_QUERY = `
  query MarketRecapture {
    markets {
      id
      fillVolume
      recaptureVolume
    }
  }
`;

export async function queryRecaptureByMarket(subgraphUrl: string): Promise<MarketRecaptureRow[]> {
  const data = await gql<{ markets: MarketRecaptureRow[] }>(subgraphUrl, MARKET_RECAPTURE_QUERY);
  return data.markets;
}
