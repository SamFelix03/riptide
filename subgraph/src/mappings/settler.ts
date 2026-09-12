import { BigInt } from "@graphprotocol/graph-ts";

import { AuctionSettled } from "../../generated/RiptideAuctionSettler/RiptideAuctionSettler";
import { Rebalance, RebalanceTxIndex, Resolver } from "../../generated/schema";

/**
 * The router's `RebalanceSettled` names the VM taker, which on this path is the settler
 * contract. This receipt names the address that funded the settlement and kept the rebate,
 * so per-resolver analytics attribute to a real wallet instead of to the settler.
 *
 * Both events land in the same transaction, router first (it fires inside the swap) and
 * settler second, so the `Rebalance` row already exists by the time this runs.
 */
export function handleAuctionSettled(event: AuctionSettled): void {
  const joinId = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(event.params.strategyKey.toHexString());
  const index = RebalanceTxIndex.load(joinId);
  if (index != null) {
    const rebalance = Rebalance.load(index.rebalance);
    if (rebalance != null) {
      rebalance.settledBy = event.params.settledBy;
      rebalance.save();
    }
  }

  const id = event.params.settledBy.toHexString();
  let resolver = Resolver.load(id);
  if (resolver == null) {
    resolver = new Resolver(id);
    resolver.settlementCount = BigInt.zero();
    resolver.paidToResolverWad = BigInt.zero();
    resolver.retainedForLPsWad = BigInt.zero();
    resolver.amountInWad = BigInt.zero();
    resolver.outWad = BigInt.zero();
    resolver.firstSeenTimestamp = event.block.timestamp;
  }
  resolver.settlementCount = resolver.settlementCount.plus(BigInt.fromI32(1));
  resolver.paidToResolverWad = resolver.paidToResolverWad.plus(event.params.payToResolverWad);
  resolver.retainedForLPsWad = resolver.retainedForLPsWad.plus(event.params.retainToLPWad);
  resolver.amountInWad = resolver.amountInWad.plus(event.params.amountInWad);
  resolver.outWad = resolver.outWad.plus(event.params.outWad);
  resolver.lastSeenTimestamp = event.block.timestamp;
  resolver.save();
}
