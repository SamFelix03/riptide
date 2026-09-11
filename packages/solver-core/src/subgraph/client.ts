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
  /** Raw abi.encode(ISwapVM.Order) from Aqua's Shipped event; null for pre-upgrade rows. */
  orderBytes: string | null;
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
      orderBytes
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

export type FillRow = {
  id: string;
  amountIn: string;
  amountOut: string;
  feeBpsApplied: number;
  sigmaWad: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
  strategy: { id: string; strategyKey: string };
  market: { id: string };
};

export type RebalanceRow = {
  id: string;
  retainToLPWad: string;
  payToResolverWad: string;
  surplusWad: string;
  revealedPriceWad: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
  strategy: { id: string; strategyKey: string };
  market: { id: string };
};

export type ControllerStateRow = {
  id: string;
  sigmaWad: string;
  feeTarget: number;
  feeReported: number;
  timestamp: string;
  blockNumber: string;
  strategy: { id: string; strategyKey: string };
};

const RECENT_FILLS_QUERY = `
  query RecentFills($first: Int!) {
    fills(first: $first, orderBy: timestamp, orderDirection: desc) {
      id amountIn amountOut feeBpsApplied sigmaWad blockNumber timestamp txHash
      strategy { id strategyKey }
      market { id }
    }
  }
`;

export async function queryRecentFills(subgraphUrl: string, first = 20): Promise<FillRow[]> {
  const data = await gql<{ fills: FillRow[] }>(subgraphUrl, RECENT_FILLS_QUERY, { first });
  return data.fills;
}

const RECENT_REBALANCES_QUERY = `
  query RecentRebalances($first: Int!) {
    rebalances(first: $first, orderBy: timestamp, orderDirection: desc) {
      id retainToLPWad payToResolverWad surplusWad revealedPriceWad blockNumber timestamp txHash
      strategy { id strategyKey }
      market { id }
    }
  }
`;

export async function queryRecentRebalances(subgraphUrl: string, first = 20): Promise<RebalanceRow[]> {
  const data = await gql<{ rebalances: RebalanceRow[] }>(subgraphUrl, RECENT_REBALANCES_QUERY, { first });
  return data.rebalances;
}

const CONTROLLER_STATES_QUERY = `
  query ControllerStates($first: Int!) {
    controllerStates(first: $first, orderBy: timestamp, orderDirection: desc) {
      id sigmaWad feeTarget feeReported timestamp blockNumber
      strategy { id strategyKey }
    }
  }
`;

export async function queryLatestControllerStates(
  subgraphUrl: string,
  first = 50,
): Promise<ControllerStateRow[]> {
  const data = await gql<{ controllerStates: ControllerStateRow[] }>(
    subgraphUrl,
    CONTROLLER_STATES_QUERY,
    { first },
  );
  return data.controllerStates;
}

const REBALANCE_SUMS_PAGE = 1000;

const REBALANCES_PAGE_QUERY = `
  query RebalancesPage($first: Int!, $skip: Int!, $market: String) {
    rebalances(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: asc
      where: { market: $market }
    ) {
      payToResolverWad
      retainToLPWad
      market { id }
    }
  }
`;

const REBALANCES_PAGE_ALL_QUERY = `
  query RebalancesPageAll($first: Int!, $skip: Int!) {
    rebalances(first: $first, skip: $skip, orderBy: timestamp, orderDirection: asc) {
      payToResolverWad
      retainToLPWad
      market { id }
    }
  }
`;

type RebalanceSumRow = {
  payToResolverWad: string;
  retainToLPWad: string;
  market: { id: string };
};

async function queryRebalancesPage(
  subgraphUrl: string,
  first: number,
  skip: number,
  marketId?: string,
): Promise<RebalanceSumRow[]> {
  if (marketId) {
    const data = await gql<{ rebalances: RebalanceSumRow[] }>(subgraphUrl, REBALANCES_PAGE_QUERY, {
      first,
      skip,
      market: marketId,
    });
    return data.rebalances;
  }
  const data = await gql<{ rebalances: RebalanceSumRow[] }>(subgraphUrl, REBALANCES_PAGE_ALL_QUERY, {
    first,
    skip,
  });
  return data.rebalances;
}

async function sumRebalanceVolumes(
  subgraphUrl: string,
  marketId?: string,
): Promise<{ paidToResolvers: bigint; recaptureToLps: bigint }> {
  let paidToResolvers = 0n;
  let recaptureToLps = 0n;
  let skip = 0;

  while (true) {
    const page = await queryRebalancesPage(subgraphUrl, REBALANCE_SUMS_PAGE, skip, marketId);
    if (page.length === 0) break;
    for (const row of page) {
      paidToResolvers += BigInt(row.payToResolverWad);
      recaptureToLps += BigInt(row.retainToLPWad);
    }
    if (page.length < REBALANCE_SUMS_PAGE) break;
    skip += REBALANCE_SUMS_PAGE;
  }

  return { paidToResolvers, recaptureToLps };
}

export async function queryTotalPaidToResolvers(subgraphUrl: string, marketId?: string): Promise<string> {
  const { paidToResolvers } = await sumRebalanceVolumes(subgraphUrl, marketId);
  return paidToResolvers.toString();
}

const STRATEGY_RECAPTURE_QUERY = `
  query StrategyRecapture($strategyKey: Bytes!) {
    rebalances(where: { strategy_: { strategyKey: $strategyKey } }, first: 1000) {
      retainToLPWad
    }
  }
`;

export async function queryStrategyCumulativeRecapture(
  subgraphUrl: string,
  strategyKey: `0x${string}`,
): Promise<string> {
  const data = await gql<{ rebalances: Array<{ retainToLPWad: string }> }>(
    subgraphUrl,
    STRATEGY_RECAPTURE_QUERY,
    { strategyKey },
  );
  let total = 0n;
  for (const row of data.rebalances) {
    total += BigInt(row.retainToLPWad);
  }
  return total.toString();
}
