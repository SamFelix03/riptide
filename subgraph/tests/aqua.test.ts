import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { assert, clearStore, describe, test, beforeEach, newMockEvent as defaultMockEvent } from "matchstick-as/assembly/index";

import { Strategy } from "../generated/schema";
import { Docked, Pushed, Shipped } from "../generated/Aqua/Aqua";
import { handleDocked, handlePushed, handleShipped } from "../src/mappings/aqua";
import { SWAP_ROUTER_ADDRESS } from "../src/helpers";

const MAKER = Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
const STRATEGY_HASH = Bytes.fromHexString("0x463dd4d17cda86f4f9a7cf5cbaa24a7b7f49869597664571129f2fe32a54bd3f");
const OTHER_APP = Address.fromString("0x00000000000000000000000000000000000000aa");

describe("aqua", () => {
  beforeEach(() => {
    clearStore();
  });

  test("Shipped creates strategy when app is swap router", () => {
    handleShipped(createShipped(SWAP_ROUTER_ADDRESS));
    assert.assertNotNull(Strategy.load(STRATEGY_HASH.toHexString()));
    assert.fieldEquals("Strategy", STRATEGY_HASH.toHexString(), "docked", "false");
  });

  test("Shipped ignores a non-router app", () => {
    handleShipped(createShipped(OTHER_APP));
    assert.entityCount("Strategy", 0);
  });

  test("Docked marks strategy inactive", () => {
    handleShipped(createShipped(SWAP_ROUTER_ADDRESS));
    handleDocked(createDocked(SWAP_ROUTER_ADDRESS));
    assert.fieldEquals("Strategy", STRATEGY_HASH.toHexString(), "docked", "true");
  });

  test("Pushed increases aquaBase", () => {
    handleShipped(createShipped(SWAP_ROUTER_ADDRESS));
    handlePushed(createPushed(SWAP_ROUTER_ADDRESS, Address.fromString("0x0000000000000000000000000000000000000011"), BigInt.fromString("100")));
    assert.fieldEquals("Strategy", STRATEGY_HASH.toHexString(), "aquaBase", "100");
  });
});

function createShipped(app: Address): Shipped {
  const ev = changetype<Shipped>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(app)));
  ev.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(STRATEGY_HASH)));
  ev.parameters.push(new ethereum.EventParam("strategy", ethereum.Value.fromBytes(Bytes.fromUTF8("payload"))));
  return ev;
}

function createDocked(app: Address): Docked {
  const ev = changetype<Docked>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(app)));
  ev.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(STRATEGY_HASH)));
  return ev;
}

function createPushed(app: Address, token: Address, amount: BigInt): Pushed {
  const ev = changetype<Pushed>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(app)));
  ev.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(STRATEGY_HASH)));
  ev.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(token)));
  ev.parameters.push(new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount)));
  return ev;
}

function newMockEvent(): ethereum.Event {
  const event = defaultMockEvent();
  event.address = Address.fromString("0x0000000000000000000000000000000000000001");
  event.logIndex = BigInt.fromI32(0);
  event.transaction.hash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000002");
  event.block.number = BigInt.fromI32(50);
  event.block.timestamp = BigInt.fromI32(1_700_000_000);
  return event;
}
