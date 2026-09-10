import type { DeploymentManifest, SeededStrategy } from "@riptide/contracts";
import type { Strategy } from "@riptide/strategy-sdk";

const WAD = 1_000_000_000_000_000_000n;

function baseStrategy(
  maker: `0x${string}`,
  base: `0x${string}`,
  quote: `0x${string}`,
  feed: `0x${string}`,
  provider: `0x${string}`,
  salt: `0x${string}`,
): Strategy {
  return {
    maker,
    baseToken: base,
    quoteToken: quote,
    reserveBaseWad: 100n * WAD,
    reserveQuoteWad: 200_000n * WAD,
    fee: { feeMin: 0n, feeMax: 0n, lambda: 0n, kp: 0n, ki: 0n, iMax: 0n, sigmaMin: 0n, sigmaMax: 0n },
    auction: { beta: 0n, duration: 0, decay: 0n, antiSandwichPeriod: 0 },
    oracle: { feed, decimals: 8, maxStaleness: 3600 },
    feeProvider: provider,
    salt,
  };
}

function strategyS1(maker: `0x${string}`, base: `0x${string}`, quote: `0x${string}`, feed: `0x${string}`, provider: `0x${string}`, salt: `0x${string}`): Strategy {
  const s = baseStrategy(maker, base, quote, feed, provider, salt);
  s.fee = {
    feeMin: 10_000n,
    feeMax: 50_000n,
    lambda: 990_000_000_000_000_000n,
    kp: 100_000_000_000_000_000n,
    ki: 50_000_000_000_000_000n,
    iMax: 500_000_000_000_000_000n,
    sigmaMin: 5_000_000_000_000_000n,
    sigmaMax: 500_000_000_000_000_000n,
  };
  s.auction = { beta: 970_000_000_000_000_000n, duration: 7200, decay: 995_000_000_000_000_000n, antiSandwichPeriod: 600 };
  return s;
}

function strategyS2(maker: `0x${string}`, base: `0x${string}`, quote: `0x${string}`, feed: `0x${string}`, provider: `0x${string}`, salt: `0x${string}`): Strategy {
  const s = baseStrategy(maker, base, quote, feed, provider, salt);
  s.fee = {
    feeMin: 30_000n,
    feeMax: 500_000n,
    lambda: 100_000_000_000_000_000n,
    kp: 500_000_000_000_000_000n,
    ki: 100_000_000_000_000_000n,
    iMax: 1_000_000_000_000_000_000n,
    sigmaMin: 10_000_000_000_000_000n,
    sigmaMax: 1_000_000_000_000_000_000n,
  };
  s.auction = { beta: 950_000_000_000_000_000n, duration: 3600, decay: 990_000_000_000_000_000n, antiSandwichPeriod: 300 };
  return s;
}

function strategyS3(maker: `0x${string}`, base: `0x${string}`, quote: `0x${string}`, feed: `0x${string}`, provider: `0x${string}`, salt: `0x${string}`): Strategy {
  const s = baseStrategy(maker, base, quote, feed, provider, salt);
  s.fee = {
    feeMin: 50_000n,
    feeMax: 800_000n,
    lambda: 850_000_000_000_000_000n,
    kp: 800_000_000_000_000_000n,
    ki: 200_000_000_000_000_000n,
    iMax: 2_000_000_000_000_000_000n,
    sigmaMin: 20_000_000_000_000_000n,
    sigmaMax: 2_000_000_000_000_000_000n,
  };
  s.auction = { beta: 900_000_000_000_000_000n, duration: 1800, decay: 980_000_000_000_000_000n, antiSandwichPeriod: 120 };
  return s;
}

export function buildStrategyPreset(
  manifest: DeploymentManifest,
  seeded: SeededStrategy,
  feed: `0x${string}`,
): Strategy {
  const base = manifest.demoTokens.base;
  const quote = manifest.demoTokens.quote;
  const provider = manifest.feeProvider;
  const maker = seeded.maker as `0x${string}`;
  const salt = seeded.salt as `0x${string}`;

  switch (seeded.id) {
    case "S1":
      return strategyS1(maker, base, quote, feed, provider, salt);
    case "S2":
      return strategyS2(maker, base, quote, feed, provider, salt);
    case "S3":
      return strategyS3(maker, base, quote, feed, provider, salt);
    default:
      throw new Error(`Unknown strategy preset id: ${seeded.id}`);
  }
}

export const DEMO_MARKET = "RBASE-RQUOTE";

/** Anvil `ScriptConfig.TAKER_KEY` — demo UI uses this wallet as resolver unless the manifest overrides. */
export const DEMO_RESOLVER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as const;

export function demoResolverAddress(manifest?: { demoResolver?: string }): `0x${string}` {
  return (manifest?.demoResolver as `0x${string}`) ?? DEMO_RESOLVER;
}
