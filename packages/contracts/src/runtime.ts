import { loadManifest } from "./manifest.js";
import {
  asHexAddress,
  publicExplorerUrl,
  resolveChainId,
  resolveRpcUrl,
  resolveSubgraphUrl,
  type EnvMap,
  type PublicDeploymentConfig,
} from "./networks.js";

export type RuntimeEndpoints = {
  chainId: number;
  rpcUrl: string;
  rpcUrlFallback?: string;
  subgraphUrl?: string;
  chainlinkFeed?: string;
};

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Chain, RPC, subgraph, and feed for services. Manifest first; env only for secrets/overrides. */
export function resolveRuntimeEndpoints(env: EnvMap = process.env): RuntimeEndpoints {
  const chainId = resolveChainId(env);
  const manifest = loadManifest(chainId);
  return {
    chainId,
    rpcUrl: resolveRpcUrl(chainId, { env, manifestRpcUrl: manifest.rpcUrl }),
    rpcUrlFallback: nonempty(env.RPC_URL_FALLBACK),
    subgraphUrl: resolveSubgraphUrl(chainId, { env, manifestSubgraphUrl: manifest.subgraphUrl }),
    chainlinkFeed: nonempty(env.CHAINLINK_FEED_ADDRESS) || nonempty(manifest.chainlinkFeed),
  };
}

/** Public slice of the deployment manifest for the web app (`GET /api/config`). */
export function loadPublicDeploymentConfig(chainId = resolveChainId()): PublicDeploymentConfig {
  const manifest = loadManifest(chainId);
  return {
    chainId: manifest.chainId,
    name: manifest.name,
    rpcUrl: resolveRpcUrl(chainId, { manifestRpcUrl: manifest.rpcUrl }),
    explorerUrl: manifest.explorerUrl || publicExplorerUrl(chainId),
    aqua: asHexAddress(manifest.aqua),
    swapRouter: asHexAddress(manifest.swapRouter),
    rebalanceRouter: asHexAddress(manifest.rebalanceRouter),
    kernel: asHexAddress(manifest.kernel),
    oracle: asHexAddress(manifest.oracle),
    feeProvider: asHexAddress(manifest.feeProvider),
    settler: asHexAddress(manifest.settler),
    quoter: asHexAddress(manifest.quoter),
    lens: asHexAddress(manifest.lens),
    batchExecutor: asHexAddress(manifest.batchExecutor),
    demoTokens: {
      base: asHexAddress(manifest.demoTokens.base),
      quote: asHexAddress(manifest.demoTokens.quote),
    },
    chainlinkFeed: manifest.chainlinkFeed ? asHexAddress(manifest.chainlinkFeed) : undefined,
    seededStrategies: manifest.seededStrategies.map((s) => ({
      id: s.id,
      maker: asHexAddress(s.maker),
      salt: s.salt,
      strategyKey: s.strategyKey,
      orderHash: s.orderHash,
    })),
    subgraphUrl: manifest.subgraphUrl,
  };
}
