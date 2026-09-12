import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { assert, clearStore, describe, test } from "matchstick-as/assembly/index";

import { Rebalance, Resolver } from "../generated/schema";
import { AuctionSettled } from "../generated/RiptideAuctionSettler/RiptideAuctionSettler";
import { RebalanceSettled } from "../generated/RiptideRebalanceRouter/RiptideRebalanceRouter";
import { handleAuctionSettled } from "../src/mappings/settler";
import { handleRebalanceSettled } from "../src/mappings/rebalance-router";

const STRATEGY_KEY = Bytes.fromHexString("0x3c8e904cdb19937d60d41c8d984b1a8803ad6e0891b4f9e032dcec2a22c2c7f5");
const MARKET_ID = Bytes.fromHexString("0x5fda11de1a2ed0b5d3c2e74823b76e83e05972744e3f0b5695ce173a4fd62251");
const MAKER = Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
// The VM taker on the settler path: the settler contract itself.
const SETTLER_CONTRACT = Address.fromString("0x0165878A594ca255338adfa4d48449f69242Eb8F");
// The wallet that actually paid and was paid.
const CALLER = Address.fromString("0x90F79bf6EB2c4f870365E785982E1f101E93b906");
const TOKEN_IN = Address.fromString("0x610178da211fef7d417bc0e6fed39f05609ad788");
const TOKEN_OUT = Address.fromString("0xb7f8bc63bbcad18155201308c8f3540b07f84f5e");

const REBALANCE_ID = "0x0000000000000000000000000000000000000000000000000000000000000005-0";

function wad(v: string): ethereum.Value {
  return ethereum.Value.fromUnsignedBigInt(BigInt.fromString(v));
}

function routerEvent(): RebalanceSettled {
  const ev = changetype<RebalanceSettled>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("strategyKey", ethereum.Value.fromFixedBytes(STRATEGY_KEY)));
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("resolver", ethereum.Value.fromAddress(SETTLER_CONTRACT)));
  ev.parameters.push(new ethereum.EventParam("marketId", ethereum.Value.fromFixedBytes(MARKET_ID)));
  ev.parameters.push(new ethereum.EventParam("tokenIn", ethereum.Value.fromAddress(TOKEN_IN)));
  ev.parameters.push(new ethereum.EventParam("tokenOut", ethereum.Value.fromAddress(TOKEN_OUT)));
  ev.parameters.push(new ethereum.EventParam("executedInWad", wad("1000000000000000000")));
  ev.parameters.push(new ethereum.EventParam("staleInWad", wad("500000000000000000")));
  ev.parameters.push(new ethereum.EventParam("surplusWad", wad("500000000000000000")));
  ev.parameters.push(new ethereum.EventParam("retainToLPWad", wad("400000000000000000")));
  ev.parameters.push(new ethereum.EventParam("payToResolverWad", wad("100000000000000000")));
  ev.parameters.push(new ethereum.EventParam("revealedPriceWad", wad("2000000000000000000000")));
  ev.parameters.push(new ethereum.EventParam("versionAfter", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2))));
  return ev;
}

function settlerEvent(): AuctionSettled {
  const ev = changetype<AuctionSettled>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("strategyKey", ethereum.Value.fromFixedBytes(STRATEGY_KEY)));
  ev.parameters.push(new ethereum.EventParam("settledBy", ethereum.Value.fromAddress(CALLER)));
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("outWad", wad("1000000000000000000")));
  ev.parameters.push(new ethereum.EventParam("amountInWad", wad("1000000000000000000")));
  ev.parameters.push(new ethereum.EventParam("surplusWad", wad("500000000000000000")));
  ev.parameters.push(new ethereum.EventParam("payToResolverWad", wad("100000000000000000")));
  ev.parameters.push(new ethereum.EventParam("retainToLPWad", wad("400000000000000000")));
  return ev;
}

describe("auction settler", () => {
  beforeEach(() => {
    clearStore();
  });

  test("AuctionSettled re-attributes the rebalance to the calling wallet", () => {
    handleRebalanceSettled(routerEvent());
    // Before the settler receipt the row credits the VM taker, which is the contract.
    assert.fieldEquals("Rebalance", REBALANCE_ID, "settledBy", SETTLER_CONTRACT.toHexString());

    handleAuctionSettled(settlerEvent());
    assert.fieldEquals("Rebalance", REBALANCE_ID, "settledBy", CALLER.toHexString());
    // `resolver` still records what the router saw — the two are deliberately different.
    assert.fieldEquals("Rebalance", REBALANCE_ID, "resolver", SETTLER_CONTRACT.toHexString());
  });

  test("AuctionSettled aggregates per-resolver totals", () => {
    handleRebalanceSettled(routerEvent());
    handleAuctionSettled(settlerEvent());

    const id = CALLER.toHexString();
    assert.fieldEquals("Resolver", id, "settlementCount", "1");
    assert.fieldEquals("Resolver", id, "paidToResolverWad", "100000000000000000");
    assert.fieldEquals("Resolver", id, "retainedForLPsWad", "400000000000000000");

    handleAuctionSettled(settlerEvent());
    assert.fieldEquals("Resolver", id, "settlementCount", "2");
    assert.fieldEquals("Resolver", id, "paidToResolverWad", "200000000000000000");
    assert.assertNotNull(Resolver.load(id));
  });

  test("a settler receipt with no matching rebalance still records the resolver", () => {
    handleAuctionSettled(settlerEvent());
    assert.fieldEquals("Resolver", CALLER.toHexString(), "settlementCount", "1");
    assert.assertNull(Rebalance.load(REBALANCE_ID));
  });
});

function newMockEvent(): ethereum.Event {
  const event = new ethereum.Event();
  event.address = SETTLER_CONTRACT;
  event.logIndex = BigInt.fromI32(0);
  event.transaction = new ethereum.Transaction();
  event.transaction.hash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000005");
  event.block = new ethereum.Block();
  event.block.number = BigInt.fromI32(400);
  event.block.timestamp = BigInt.fromI32(1_700_000_100);
  return event;
}

function beforeEach(fn: () => void): void {
  fn();
}
