/** Public network metadata. Secrets and private RPCs stay in env; everything else lives here or in `deployments/<chainId>.json`. */

export const ANVIL_CHAIN_ID = 31337;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
/** Product default when `CHAIN_ID` is unset. */
export const PRODUCT_CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;

export const ANVIL_RPC_URL = "http://127.0.0.1:8545";
export const BASE_SEPOLIA_PUBLIC_RPC = "https://sepolia.base.org";
export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org";

export const SERVICE_PORTS = {
  web: 3000,
  solverApi: 8081,
  resolverBot: 8082,
  volIndexer: 8083,
  liquidityMcp: 8084,
} as const;

export const SERVICE_DEFAULTS = {
  maxShortlist: 8,
  resolverPollIntervalMs: 5_000,
  volIndexerPollIntervalMs: 60_000,
  minProfitWad: "0",
  priceGapBps: "100",
} as const;

export const ANVIL_GRAPH = {
  nodeUrl: "http://localhost:8020",
  ipfsUrl: "http://localhost:5001",
  subgraphName: "riptide/riptide-anvil",
  queryUrl: "http://localhost:8000/subgraphs/name/riptide/riptide-anvil",
  versionLabel: "v0.0.1",
} as const;

export type HexAddress = `0x${string}`;

export type PublicDeploymentConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  aqua: HexAddress;
  swapRouter: HexAddress;
  rebalanceRouter: HexAddress;
  kernel: HexAddress;
  oracle: HexAddress;
  feeProvider: HexAddress;
  settler: HexAddress;
  quoter: HexAddress;
  lens: HexAddress;
  batchExecutor: HexAddress;
  demoTokens: { base: HexAddress; quote: HexAddress };
  chainlinkFeed?: HexAddress;
  seededStrategies: Array<{
    id: string;
    maker: HexAddress;
    salt: string;
    strategyKey: string;
    orderHash: string;
  }>;
  subgraphUrl: string;
};

export type EnvMap = Record<string, string | undefined>;

function processEnv(): EnvMap {
  return (globalThis as { process?: { env?: EnvMap } }).process?.env ?? {};
}

export function graphNetworkName(chainId: number): string {
  if (chainId === ANVIL_CHAIN_ID) return "anvil";
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "base-sepolia";
  return `chain-${chainId}`;
}

export function networkDisplayName(chainId: number): string {
  if (chainId === ANVIL_CHAIN_ID) return "Anvil";
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "Base Sepolia";
  return `Chain ${chainId}`;
}

export function isLocalAnvil(chainId: number): boolean {
  return chainId === ANVIL_CHAIN_ID;
}

export function publicRpcUrl(chainId: number): string {
  if (chainId === ANVIL_CHAIN_ID) return ANVIL_RPC_URL;
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return BASE_SEPOLIA_PUBLIC_RPC;
  return ANVIL_RPC_URL;
}

export function publicExplorerUrl(chainId: number): string {
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return BASE_SEPOLIA_EXPLORER;
  return "";
}

export function anvilGraphQueryUrl(chainId: number): string | undefined {
  return isLocalAnvil(chainId) ? ANVIL_GRAPH.queryUrl : undefined;
}

export function defaultSolverApiUrl(): string {
  return `http://127.0.0.1:${SERVICE_PORTS.solverApi}`;
}

/** `CHAIN_ID` (or `NEXT_PUBLIC_CHAIN_ID`) overrides the product default. */
export function resolveChainId(env: EnvMap = processEnv()): number {
  const raw = env.CHAIN_ID || env.NEXT_PUBLIC_CHAIN_ID;
  if (!raw) return PRODUCT_CHAIN_ID;
  const chainId = Number.parseInt(raw, 10);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid CHAIN_ID: ${raw}`);
  }
  return chainId;
}

function isLoopbackUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes("127.0.0.1") || url.includes("localhost");
}

/**
 * RPC resolution: env override → deployment manifest → public default for the chain.
 * `RPC_URL` / `PUBLIC_RPC_URL` / `NEXT_PUBLIC_RPC_URL` are optional private-RPC overrides.
 * Loopback URLs are ignored on public chains so a local `.env` cannot point the UI at Anvil.
 */
export function resolveRpcUrl(
  chainId: number,
  options?: { env?: EnvMap; manifestRpcUrl?: string },
): string {
  const env = options?.env ?? processEnv();
  const candidates = [
    env.RPC_URL,
    env.PUBLIC_RPC_URL,
    env.NEXT_PUBLIC_RPC_URL,
    options?.manifestRpcUrl,
    publicRpcUrl(chainId),
  ];
  for (const url of candidates) {
    if (!url) continue;
    if (!isLocalAnvil(chainId) && isLoopbackUrl(url)) continue;
    return url;
  }
  return publicRpcUrl(chainId);
}

/** Subgraph URL: env override → manifest → Anvil default. Loopback is ignored on public chains. */
export function resolveSubgraphUrl(
  chainId: number,
  options?: { env?: EnvMap; manifestSubgraphUrl?: string },
): string | undefined {
  const env = options?.env ?? processEnv();
  const candidates = [env.SUBGRAPH_URL, options?.manifestSubgraphUrl, anvilGraphQueryUrl(chainId)];
  for (const url of candidates) {
    const trimmed = url?.trim();
    if (!trimmed) continue;
    if (!isLocalAnvil(chainId) && isLoopbackUrl(trimmed)) continue;
    return trimmed;
  }
  return undefined;
}

export function asHexAddress(value: string): HexAddress {
  return value as HexAddress;
}
