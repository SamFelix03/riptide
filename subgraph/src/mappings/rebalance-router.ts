import { BigInt } from "@graphprotocol/graph-ts";

import { RebalanceSettled } from "../../generated/RiptideRebalanceRouter/RiptideRebalanceRouter";
import { MarketSnapshot, Rebalance, StrategyKeyIndex } from "../../generated/schema";
import { bucketStart, ensureMaker, ensureMarket, ensureProtocol } from "../helpers";

export function handleRebalanceSettled(event: RebalanceSettled): void {
  const protocol = ensureProtocol();
  ensureMarket(event.params.marketId);
  ensureMaker(event.params.maker);

  const index = StrategyKeyIndex.load(event.params.strategyKey.toHexString());
  const strategyId = index != null ? index.strategy : event.params.strategyKey.toHexString();

  const id = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());
  const rebalance = new Rebalance(id);
  rebalance.strategy = strategyId;
  rebalance.market = event.params.marketId.toHexString();
  rebalance.maker = event.params.maker.toHexString();
  rebalance.resolver = event.params.resolver;
  rebalance.tokenIn = event.params.tokenIn;
  rebalance.tokenOut = event.params.tokenOut;
  rebalance.executedInWad = event.params.executedInWad;
  rebalance.staleInWad = event.params.staleInWad;
  rebalance.surplusWad = event.params.surplusWad;
  rebalance.retainToLPWad = event.params.retainToLPWad;
  rebalance.payToResolverWad = event.params.payToResolverWad;
  rebalance.revealedPriceWad = event.params.revealedPriceWad;
  rebalance.versionAfter = event.params.versionAfter;
  rebalance.blockNumber = event.block.number;
  rebalance.timestamp = event.block.timestamp;
  rebalance.txHash = event.transaction.hash;
  rebalance.save();

  protocol.totalRecapture = protocol.totalRecapture.plus(event.params.retainToLPWad);
  protocol.rebalanceCount = protocol.rebalanceCount.plus(BigInt.fromI32(1));
  protocol.save();

  const market = ensureMarket(event.params.marketId);
  market.recaptureVolume = market.recaptureVolume.plus(event.params.retainToLPWad);
  market.save();

  const maker = ensureMaker(event.params.maker);
  maker.recaptureVolume = maker.recaptureVolume.plus(event.params.retainToLPWad);
  maker.save();

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
  snap.recaptureVolume = snap.recaptureVolume.plus(event.params.retainToLPWad);
  snap.save();
}
