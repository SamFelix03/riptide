import { cpmmExactIn } from "@riptide/riptide-math";

/** Uniswap V3 official subgraph pool shape (schema.graphql Pool entity). */
export type UniswapV3Pool = {
  id: string;
  feeTier: string;
  totalValueLockedUSD: string;
  totalValueLockedToken0: string;
  totalValueLockedToken1: string;
  token0: { id: string; symbol: string; decimals: string };
  token1: { id: string; symbol: string; decimals: string };
};

export type DexLiquidityQuote = {
  source: string;
  poolId: string;
  poolName: string;
  amountIn: string;
  amountOut: string;
  feeBps: number;
  tvlUsd: string;
  note: string;
};

/** Official Uniswap V3 Ethereum mainnet — WETH/USDC 0.05% */
export const DEFAULT_WETH_USDC_POOL = "0x88e6a0c2ddd26feeb64f039a2200f558aeb0dbed";

const POOL_BY_ID_QUERY = `
  query PoolById($id: ID!) {
    pool(id: $id) {
      id feeTier totalValueLockedUSD totalValueLockedToken0 totalValueLockedToken1
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
  }
`;

const TOP_WETH_USDC_QUERY = `
  query TopWethUsdc($first: Int!) {
    pools(
      first: $first
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { token0_: { symbol: "WETH" }, token1_: { symbol: "USDC" } }
    ) {
      id feeTier totalValueLockedUSD totalValueLockedToken0 totalValueLockedToken1
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
  }
`;

async function dexGql<T>(url: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`dex subgraph failed: ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new Error("dex subgraph returned no data");
  return body.data;
}

/** Uniswap feeTier is hundredths of a bip (500 = 0.05% = 5 bps). */
function feeTierToBps(feeTier: string): number {
  const tier = Number(feeTier);
  if (!Number.isFinite(tier)) return 30;
  return Math.round(tier / 100);
}

function decimalToUnits(value: string, decimals: number): bigint {
  const [intPart, fracPart = ""] = value.split(".");
  const frac = fracPart.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(intPart + frac);
}

function poolName(pool: UniswapV3Pool): string {
  return `Uniswap V3 ${pool.token0.symbol}/${pool.token1.symbol} (${Number(pool.feeTier) / 10000}%)`;
}

function estimateExactIn(pool: UniswapV3Pool, amountInWad: bigint): DexLiquidityQuote {
  const dec0 = Number(pool.token0.decimals);
  const dec1 = Number(pool.token1.decimals);
  const reserve0 = decimalToUnits(pool.totalValueLockedToken0, dec0);
  const reserve1 = decimalToUnits(pool.totalValueLockedToken1, dec1);
  const feeBps = BigInt(feeTierToBps(pool.feeTier));
  const amountOut =
    reserve0 > 0n && reserve1 > 0n
      ? cpmmExactIn(reserve0, reserve1, amountInWad, feeBps)
      : 0n;

  return {
    source: "uniswap-v3-official-mainnet",
    poolId: pool.id,
    poolName: poolName(pool),
    amountIn: amountInWad.toString(),
    amountOut: amountOut.toString(),
    feeBps: Number(feeBps),
    tvlUsd: pool.totalValueLockedUSD,
    note: "Illustrative CPMM estimate from Uniswap V3 indexed TVL; not an on-chain quote.",
  };
}

export async function queryDexPoolQuote(
  gatewayUrl: string,
  amountInWad: bigint,
  poolId?: string,
): Promise<DexLiquidityQuote> {
  if (poolId) {
    const normalized = poolId.toLowerCase();
    let data = await dexGql<{ pool: UniswapV3Pool | null }>(gatewayUrl, POOL_BY_ID_QUERY, { id: normalized });
    if (!data.pool) {
      data = await dexGql<{ pool: UniswapV3Pool | null }>(gatewayUrl, POOL_BY_ID_QUERY, { id: poolId });
    }
    if (!data.pool) throw new Error(`pool not found: ${poolId}`);
    return estimateExactIn(data.pool, amountInWad);
  }

  const data = await dexGql<{ pools: UniswapV3Pool[] }>(gatewayUrl, TOP_WETH_USDC_QUERY, { first: 3 });
  const pool = data.pools[0];
  if (!pool) throw new Error("no WETH/USDC pools in Uniswap V3 subgraph");
  return estimateExactIn(pool, amountInWad);
}

export function quoteFromFixture(pool: UniswapV3Pool, amountInWad: bigint): DexLiquidityQuote {
  return estimateExactIn(pool, amountInWad);
}
