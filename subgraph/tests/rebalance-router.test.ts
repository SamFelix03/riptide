import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { assert, clearStore, describe, test, beforeEach, newMockEvent as defaultMockEvent } from "matchstick-as/assembly/index";

import { MarketSnapshot, Rebalance } from "../generated/schema";
import { RebalanceSettled } from "../generated/RiptideRebalanceRouter/RiptideRebalanceRouter";
import { handleRebalanceSettled } from "../src/mappings/rebalance-router";

const STRATEGY_KEY = Bytes.fromHexString("0x3c8e904cdb19937d60d41c8d984b1a8803ad6e0891b4f9e032dcec2a22c2c7f5");
const MARKET_ID = Bytes.fromHexString("0x5fda11de1a2ed0b5d3c2e74823b76e83e05972744e3f0b5695ce173a4fd62251");
const MAKER = Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
const RESOLVER = Address.fromString("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65");
const TOKEN_IN = Address.fromString("0x0000000000000000000000000000000000000011");
const TOKEN_OUT = Address.fromString("0x0000000000000000000000000000000000000012");

function createRebalanceEvent(): RebalanceSettled {
  const ev = changetype<RebalanceSettled>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("strategyKey", ethereum.Value.fromFixedBytes(STRATEGY_KEY)));
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("resolver", ethereum.Value.fromAddress(RESOLVER)));
  ev.parameters.push(new ethereum.EventParam("marketId", ethereum.Value.fromFixedBytes(MARKET_ID)));
  ev.parameters.push(new ethereum.EventParam("tokenIn", ethereum.Value.fromAddress(TOKEN_IN)));
  ev.parameters.push(new ethereum.EventParam("tokenOut", ethereum.Value.fromAddress(TOKEN_OUT)));
  ev.parameters.push(
    new ethereum.EventParam("executedInWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000"))),
  );
  ev.parameters.push(new ethereum.EventParam("staleInWad", ethereum.Value.fromUnsignedBigInt(BigInt.zero())));
  ev.parameters.push(
    new ethereum.EventParam("surplusWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("500000000000000000"))),
  );
  ev.parameters.push(
    new ethereum.EventParam("retainToLPWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("400000000000000000"))),
  );
  ev.parameters.push(
    new ethereum.EventParam("payToResolverWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("100000000000000000"))),
  );
  ev.parameters.push(
    new ethereum.EventParam("revealedPriceWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("2000000000000000000000"))),
  );
  ev.parameters.push(new ethereum.EventParam("versionAfter", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2))));
  return ev;
}

describe("rebalance router", () => {
  beforeEach(() => {
    clearStore();
  });

  test("RebalanceSettled creates rebalance and market snapshot", () => {
    handleRebalanceSettled(createRebalanceEvent());
    const rebalanceId = "0x0000000000000000000000000000000000000000000000000000000000000005-0";
    assert.assertNotNull(Rebalance.load(rebalanceId));
    const bucket = BigInt.fromI32(1_700_000_100).div(BigInt.fromI32(3600)).times(BigInt.fromI32(3600));
    const snapId = MARKET_ID.toHexString().concat("-").concat(bucket.toString());
    assert.assertNotNull(MarketSnapshot.load(snapId));
  });

  test("replay is idempotent", () => {
    const ev = createRebalanceEvent();
    handleRebalanceSettled(ev);
    handleRebalanceSettled(ev);
    assert.entityCount("Rebalance", 1);
  });
});

function newMockEvent(): ethereum.Event {
  const event = defaultMockEvent();
  event.address = Address.fromString("0x0000000000000000000000000000000000000003");
  event.logIndex = BigInt.fromI32(0);
  event.transaction.hash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000005");
  event.block.number = BigInt.fromI32(400);
  event.block.timestamp = BigInt.fromI32(1_700_000_100);
  return event;
}
