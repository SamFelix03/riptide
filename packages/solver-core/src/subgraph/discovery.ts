import type { DeploymentManifest } from "@riptide/contracts";
import { getRiptideLens, getRiptideQuoter } from "@riptide/contracts";
import type { PublicClient } from "viem";

import { buildStrategyPreset, DEMO_MARKET } from "../presets.js";
import { resolveFeedAddress } from "../feed.js";
import { tryDecodeStrategyFromOrderBytes } from "../orderPayload.js";
import type { DiscoveryProvider, DiscoveryResult } from "../discovery.js";
import type { FreshnessMeta, MarketId, StrategyCandidate } from "../types.js";
import { DEMO_MARKET_ID, demoMarketId, queryActiveStrategies, queryMetaBlock } from "./client.js";

export type SubgraphDiscoveryConfig = {
  subgraphUrl: string;
  manifest: DeploymentManifest;
  client: PublicClient;
  feedAddress?: string;
};

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

export class SubgraphDiscoveryProvider implements DiscoveryProvider {
  private readonly subgraphUrl: string;
  private readonly manifest: DeploymentManifest;
  private readonly client: PublicClient;
  private readonly feedPromise: Promise<`0x${string}`>;

  constructor(config: SubgraphDiscoveryConfig) {
    this.subgraphUrl = config.subgraphUrl;
    this.manifest = config.manifest;
    this.client = config.client;
    this.feedPromise = resolveFeedAddress(config.manifest, {
      envFeed: config.feedAddress,
      client: config.client,
    });
  }

  async listCandidates(market: MarketId, blockHint?: bigint): Promise<DiscoveryResult> {
    if (market !== DEMO_MARKET) {
      return { candidates: [], freshness: await this.freshness(0n, 0) };
    }

    const data = await queryActiveStrategies(this.subgraphUrl, demoMarketId(this.manifest.chainId));
    const indexedBlock = BigInt(data._meta.block.number);
    const chainHead = blockHint ?? (await this.client.getBlockNumber());
    const headBlock = await this.client.getBlock({ blockNumber: chainHead });
    const laggingSeconds = Math.max(0, Number(headBlock.timestamp) - data._meta.block.timestamp);

    const seededByKey = new Map(
      this.manifest.seededStrategies.map((s) => [s.strategyKey.toLowerCase(), s]),
    );
    const lens = getRiptideLens(this.client, this.manifest.lens);
    const quoter = getRiptideQuoter(this.client, this.manifest.quoter);
    const feed = await this.feedPromise;

    const candidates: StrategyCandidate[] = [];

    for (const row of data.strategies) {
      const key = row.strategyKey.toLowerCase();
      const seeded = seededByKey.get(key);

      if (seeded) {
        const strategy = buildStrategyPreset(this.manifest, seeded, feed);
        let state;
        try {
          state = await lens.read.strategyState([
            seeded.maker as `0x${string}`,
            seeded.orderHash as `0x${string}`,
            strategy.baseToken,
            strategy.quoteToken,
          ]);
        } catch {
          continue;
        }

        const aquaBase = BigInt(state.aquaBase);
        const aquaQuote = BigInt(state.aquaQuote);
        const strategyTuple = toStrategyTuple(strategy, strategy.reserveBaseWad, strategy.reserveQuoteWad);
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
      } else {
        // A strategy shipped by a maker rather than seeded by the deploy script. Its
        // policy and salt live only in the 226-byte payload inside the Aqua order, which
        // the subgraph captures from the `Shipped` event. Decode it to get a real,
        // priceable strategy. Rows indexed before that field existed (or non-RIPTIDE
        // orders shipped to the same app) decode to null and are skipped — emitting a
        // zeroed policy would make the Quoter revert and take down every aggregate quote.
        const makerAddr = row.maker.id as `0x${string}`;
        const strategy = tryDecodeStrategyFromOrderBytes(row.orderBytes, makerAddr);
        if (!strategy) continue;

        const orderHash = row.strategyHash as `0x${string}`;
        let state;
        try {
          state = await lens.read.strategyState([
            makerAddr,
            orderHash,
            strategy.baseToken,
            strategy.quoteToken,
          ]);
        } catch {
          continue;
        }

        const aquaBase = BigInt(state.aquaBase);
        const aquaQuote = BigInt(state.aquaQuote);
        if (aquaBase === 0n || aquaQuote === 0n) continue;

        // Price it exactly as a seeded strategy is priced: a 1-WAD probe through the
        // real Quoter, which rebuilds the SwapVM order from this decoded policy. If the
        // decode were wrong the order hash would differ and this call would revert.
        let quote;
        try {
          const strategyTuple = toStrategyTuple(strategy, strategy.reserveBaseWad, strategy.reserveQuoteWad);
          quote = await quoter.read.quoteSwap([strategyTuple, 0, 1_000_000_000_000_000_000n]);
        } catch {
          continue;
        }

        candidates.push({
          id: row.strategyKey.slice(0, 10),
          strategy,
          strategyKey: row.strategyKey as `0x${string}`,
          orderHash,
          reserveBaseWad: strategy.reserveBaseWad,
          reserveQuoteWad: strategy.reserveQuoteWad,
          feeBps: Number(quote[2]),
          sigmaWad: BigInt(quote[3]),
          aquaBase,
          aquaQuote,
          swapVersion: BigInt(state.runtime.version),
        });
      }
    }

    return {
      candidates,
      freshness: {
        indexedBlock,
        chainHead,
        laggingSeconds,
        source: "subgraph",
        refreshedAt: Date.now(),
      },
    };
  }

  private async freshness(indexedBlock: bigint, laggingSeconds: number): Promise<FreshnessMeta> {
    const chainHead = await this.client.getBlockNumber();
    return {
      indexedBlock,
      chainHead,
      laggingSeconds,
      source: "subgraph",
      refreshedAt: Date.now(),
    };
  }
}

export async function checkSubgraphReachable(subgraphUrl: string): Promise<boolean> {
  try {
    await queryMetaBlock(subgraphUrl);
    return true;
  } catch {
    return false;
  }
}

export async function listActiveStrategyKeys(subgraphUrl: string, marketIdHex = DEMO_MARKET_ID): Promise<Set<string>> {
  const data = await queryActiveStrategies(subgraphUrl, marketIdHex);
  return new Set(data.strategies.map((s) => s.strategyKey.toLowerCase()));
}
