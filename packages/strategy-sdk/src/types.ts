export type FeePolicy = {
  feeMin: bigint;
  feeMax: bigint;
  lambda: bigint;
  kp: bigint;
  ki: bigint;
  iMax: bigint;
  sigmaMin: bigint;
  sigmaMax: bigint;
};

export type AuctionPolicy = {
  beta: bigint;
  duration: number;
  decay: bigint;
  antiSandwichPeriod: number;
};

export type OracleConfig = {
  feed: `0x${string}`;
  decimals: number;
  maxStaleness: number;
};

export type Strategy = {
  maker: `0x${string}`;
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  reserveBaseWad: bigint;
  reserveQuoteWad: bigint;
  fee: FeePolicy;
  auction: AuctionPolicy;
  oracle: OracleConfig;
  feeProvider: `0x${string}`;
  salt: `0x${string}`;
};
