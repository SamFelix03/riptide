import type { DeploymentManifest } from "@riptide/contracts";
import { getRiptideLens, getRiptideQuoter } from "@riptide/contracts";
import type { PublicClient } from "viem";

import { buildStrategyPreset, DEMO_MARKET } from "./presets.js";
import { isInactiveAquaStrategyError, isStrategyNotActiveError } from "./chainReady.js";
import { resolveFeedAddress } from "./feed.js";
import type { FreshnessMeta, MarketId, StrategyCandidate } from "./types.js";
import { SubgraphDiscoveryProvider } from "./subgraph/discovery.js";

export type DiscoveryResult = {
  candidates: StrategyCandidate[];
  freshness: FreshnessMeta;
};

export interface DiscoveryProvider {
  listCandidates(market: MarketId, blockHint?: bigint): Promise<DiscoveryResult>;
}

function toStrategyTuple(
  strategy: ReturnType<typeof buildStrategyPreset>,
  reserveBaseWad: bigint,
  reserveQuoteWad: bigint,
) {
  return {
    maker: strategy.maker,
    baseToken: strategy.baseToken,
    quoteToken: strategy.quoteToken,
    reserveBaseWad,
    reserveQuoteWad,
    fee: {
      feeMin: Number(strategy.fee.feeMin),
      feeMax: Number(strategy.fee.feeMax),
      lambda: strategy.fee.lambda,
      kp: strategy.fee.kp,
      ki: strategy.fee.ki,
      iMax: strategy.fee.iMax,
      sigmaMin: strategy.fee.sigmaMin,
      sigmaMax: strategy.fee.sigmaMax,
    },
    auction: {
      beta: strategy.auction.beta,
      duration: strategy.auction.duration,
      decay: strategy.auction.decay,
      antiSandwichPeriod: strategy.auction.antiSandwichPeriod,
    },
    oracle: strategy.oracle,
    feeProvider: strategy.feeProvider,
    salt: strategy.salt,
  };
}

export type RpcDiscoveryConfig = {
  manifest: DeploymentManifest;
  client: PublicClient;
  feedAddress?: string;
};

export class RpcDiscoveryProvider implements DiscoveryProvider {
  private readonly manifest: DeploymentManifest;
  private readonly client: PublicClient;
  private readonly feedPromise: Promise<`0x${string}`>;

  constructor(config: RpcDiscoveryConfig) {
    this.manifest = config.manifest;
    this.client = config.client;
    this.feedPromise = resolveFeedAddress(config.manifest, {
      envFeed: config.feedAddress,
      client: config.client,
    });
  }

  async listCandidates(market: MarketId, blockHint?: bigint): Promise<DiscoveryResult> {
    if (market !== DEMO_MARKET) {
      return { candidates: [], freshness: await this.freshness(blockHint) };
    }

    const blockNumber = blockHint ?? (await this.client.getBlockNumber());
    const lens = getRiptideLens(this.client, this.manifest.lens);
    const quoter = getRiptideQuoter(this.client, this.manifest.quoter);

    const candidates: StrategyCandidate[] = [];

    const feed = await this.feedPromise;

    for (const seeded of this.manifest.seededStrategies) {
      const strategy = buildStrategyPreset(this.manifest, seeded, feed);

      let state;
      try {
        state = await lens.read.strategyState([
          seeded.maker,
          seeded.orderHash as `0x${string}`,
          strategy.baseToken,
          strategy.quoteToken,
        ]);
      } catch (err) {
        if (isStrategyNotActiveError(err) || isInactiveAquaStrategyError(err)) continue;
        throw err;
      }

      const aquaBase = BigInt(state.aquaBase);
      const aquaQuote = BigInt(state.aquaQuote);
      if (aquaBase === 0n || aquaQuote === 0n) continue;
      // quoteSwap builds the SwapVM order from committed strategy reserves; aqua caps liquidity separately.
      const strategyTuple = toStrategyTuple(
        strategy,
        strategy.reserveBaseWad,
        strategy.reserveQuoteWad,
      );

      const quote = await quoter.read.quoteSwap([strategyTuple, 0, 1_000_000_000_000_000_000n]);

      candidates.push({
        id: seeded.id,
        strategy,
        strategyKey: seeded.strategyKey as `0x${string}`,
        orderHash: seeded.orderHash as `0x${string}`,
        reserveBaseWad: strategy.reserveBaseWad,
        reserveQuoteWad: strategy.reserveQuoteWad,
        feeBps: Number(quote[2]),
        sigmaWad: BigInt(quote[3]),
        aquaBase,
        aquaQuote,
        swapVersion: BigInt(state.runtime.version),
      });
    }

    return { candidates, freshness: await this.freshness(blockNumber) };
  }

  private async freshness(indexedBlock?: bigint): Promise<FreshnessMeta> {
    const chainHead = await this.client.getBlockNumber();
    return {
      indexedBlock: indexedBlock ?? chainHead,
      chainHead,
      laggingSeconds: 0,
      source: "rpc",
      refreshedAt: Date.now(),
    };
  }
}

export { SubgraphDiscoveryProvider, checkSubgraphReachable, listActiveStrategyKeys } from "./subgraph/discovery.js";
export { DEMO_MARKET_ID } from "./subgraph/client.js";

export function createDiscoveryProvider(config: {
  manifest: DeploymentManifest;
  client: PublicClient;
  subgraphUrl?: string;
  feedAddress?: string;
}): DiscoveryProvider {
  const rpc = new RpcDiscoveryProvider({
    manifest: config.manifest,
    client: config.client,
    feedAddress: config.feedAddress,
  });

  if (config.subgraphUrl) {
    const subgraph = new SubgraphDiscoveryProvider({
      subgraphUrl: config.subgraphUrl,
      manifest: config.manifest,
      client: config.client,
      feedAddress: config.feedAddress,
    });
    return {
      async listCandidates(market, blockHint) {
        const result = await subgraph.listCandidates(market, blockHint);
        if (result.candidates.length > 0 || !config.manifest.seededStrategies?.length) {
          return result;
        }
        return rpc.listCandidates(market, blockHint);
      },
    };
  }
  return rpc;
}
