import { BigInt, Bytes } from "@graphprotocol/graph-ts";

import {
  StrategyRuntimeInitialized,
  SwapFilled,
} from "../../generated/RiptideSwapVMRouter/RiptideSwapVMRouter";
import { Fill, MarketSnapshot, Strategy, StrategyKeyIndex } from "../../generated/schema";
import { bucketStart, ensureMaker, ensureMarket, ensureProtocol, ensureToken, BASE_TOKEN, QUOTE_TOKEN } from "../helpers";

export function handleStrategyRuntimeInitialized(event: StrategyRuntimeInitialized): void {
  ensureProtocol();
  const strategyHash = event.params.strategyHash;
  const id = strategyHash.toHexString();
  ensureMaker(event.params.maker);
  ensureMarket(event.params.marketId);

  let strategy = Strategy.load(id);
  if (strategy == null) {
    strategy = new Strategy(id);
    strategy.strategyHash = strategyHash;
    strategy.aquaBase = BigInt.zero();
    strategy.aquaQuote = BigInt.zero();
    strategy.docked = false;
  }
  strategy.strategyKey = event.params.strategyKey;
  strategy.maker = event.params.maker.toHexString();
  strategy.market = event.params.marketId.toHexString();
  strategy.reserveBaseWad = event.params.reserveBaseWad;
  strategy.reserveQuoteWad = event.params.reserveQuoteWad;
  strategy.lastVersion = event.params.version;
  strategy.save();

  const keyIndex = new StrategyKeyIndex(event.params.strategyKey.toHexString());
  keyIndex.strategy = strategy.id;
  keyIndex.save();
}

function strategyForKey(strategyKey: Bytes): Strategy | null {
  const index = StrategyKeyIndex.load(strategyKey.toHexString());
  if (index == null) return null;
  return Strategy.load(index.strategy);
}

export function handleSwapFilled(event: SwapFilled): void {
  const protocol = ensureProtocol();
  ensureToken(BASE_TOKEN, "RBASE", 18);
  ensureToken(QUOTE_TOKEN, "RQUOTE", 18);

  const strategy = strategyForKey(event.params.strategyKey);
  const strategyId = strategy != null ? strategy.id : event.params.strategyKey.toHexString();

  const fillId = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());
  const fill = new Fill(fillId);
  fill.strategy = strategyId;
  fill.market = event.params.marketId.toHexString();
  fill.maker = event.params.maker.toHexString();
  fill.tokenIn = event.params.tokenIn;
  fill.tokenOut = event.params.tokenOut;
  fill.amountIn = event.params.amountIn;
  fill.amountOut = event.params.amountOut;
  fill.feeBpsApplied = event.params.feeBpsApplied;
  fill.sigmaWad = event.params.sigmaWad;
  fill.reserveBaseAfterWad = event.params.reserveBaseAfterWad;
  fill.reserveQuoteAfterWad = event.params.reserveQuoteAfterWad;
  fill.versionAfter = event.params.versionAfter;
  fill.blockNumber = event.block.number;
  fill.timestamp = event.block.timestamp;
  fill.txHash = event.transaction.hash;
  fill.save();

  if (strategy != null) {
    strategy.lastVersion = event.params.versionAfter;
    strategy.save();
  }

  protocol.totalFillVolume = protocol.totalFillVolume.plus(event.params.amountIn);
  protocol.fillCount = protocol.fillCount.plus(BigInt.fromI32(1));
  protocol.save();

  const market = ensureMarket(event.params.marketId);
  market.fillVolume = market.fillVolume.plus(event.params.amountIn);
  market.save();

  const maker = ensureMaker(event.params.maker);
  maker.fillVolume = maker.fillVolume.plus(event.params.amountIn);
  maker.save();

  // Hourly market bucket. Only the rebalance handler used to touch MarketSnapshot, so
  // fillVolume/fillCount stayed zero forever and any hourly volume series read as flat.
  const snapId = event.params.marketId
    .toHexString()
    .concat("-")
    .concat(bucketStart(event.block.timestamp).toString());
  let snap = MarketSnapshot.load(snapId);
  if (snap == null) {
    snap = new MarketSnapshot(snapId);
    snap.market = event.params.marketId.toHexString();
    snap.bucketStart = bucketStart(event.block.timestamp);
    snap.fillVolume = BigInt.zero();
    snap.recaptureVolume = BigInt.zero();
    snap.fillCount = BigInt.zero();
  }
  snap.fillVolume = snap.fillVolume.plus(event.params.amountIn);
  snap.fillCount = snap.fillCount.plus(BigInt.fromI32(1));
  snap.save();
}
