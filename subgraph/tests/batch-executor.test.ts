import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { assert, clearStore, describe, test, beforeEach, newMockEvent as defaultMockEvent } from "matchstick-as/assembly/index";

import { Route } from "../generated/schema";
import { RouteExecuted } from "../generated/RiptideBatchExecutor/RiptideBatchExecutor";
import { handleRouteExecuted } from "../src/mappings/batch-executor";

const ROUTE_ID = Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111");
const MARKET_ID = Bytes.fromHexString("0x5fda11de1a2ed0b5d3c2e74823b76e83e05972744e3f0b5695ce173a4fd62251");
const PAYER = Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
const RECIPIENT = Address.fromString("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
const TOKEN_IN = Address.fromString("0x0000000000000000000000000000000000000011");
const TOKEN_OUT = Address.fromString("0x0000000000000000000000000000000000000012");

function createRouteEvent(): RouteExecuted {
  const ev = changetype<RouteExecuted>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("routeId", ethereum.Value.fromFixedBytes(ROUTE_ID)));
  ev.parameters.push(new ethereum.EventParam("marketId", ethereum.Value.fromFixedBytes(MARKET_ID)));
  ev.parameters.push(new ethereum.EventParam("payer", ethereum.Value.fromAddress(PAYER)));
  ev.parameters.push(new ethereum.EventParam("recipient", ethereum.Value.fromAddress(RECIPIENT)));
  ev.parameters.push(new ethereum.EventParam("kind", ethereum.Value.fromI32(1)));
  ev.parameters.push(new ethereum.EventParam("tokenIn", ethereum.Value.fromAddress(TOKEN_IN)));
  ev.parameters.push(new ethereum.EventParam("tokenOut", ethereum.Value.fromAddress(TOKEN_OUT)));
  ev.parameters.push(
    new ethereum.EventParam("amountIn", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000"))),
  );
  ev.parameters.push(
    new ethereum.EventParam("amountOut", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("2000000000000000000000"))),
  );
  ev.parameters.push(
    new ethereum.EventParam("limit", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1900000000000000000000"))),
  );
  ev.parameters.push(new ethereum.EventParam("fillCount", ethereum.Value.fromI32(2)));
  return ev;
}

describe("batch executor", () => {
  beforeEach(() => {
    clearStore();
  });

  test("RouteExecuted creates route entity", () => {
    handleRouteExecuted(createRouteEvent());
    const id = ROUTE_ID.toHexString();
    assert.assertNotNull(Route.load(id));
    assert.fieldEquals("Route", id, "fillCount", "2");
  });

  test("replay is idempotent", () => {
    const ev = createRouteEvent();
    handleRouteExecuted(ev);
    handleRouteExecuted(ev);
    assert.entityCount("Route", 1);
  });
});

function newMockEvent(): ethereum.Event {
  const event = defaultMockEvent();
  event.address = Address.fromString("0x000000000000000000000000000000000000000a");
  event.logIndex = BigInt.fromI32(0);
  event.transaction.hash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000004");
  event.block.number = BigInt.fromI32(300);
  event.block.timestamp = BigInt.fromI32(1_700_000_100);
  return event;
}
