import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { assert, clearStore, describe, test } from "matchstick-as/assembly/index";

import { Strategy } from "../generated/schema";
import { Shipped } from "../generated/Aqua/Aqua";
import { handleShipped } from "../src/mappings/aqua";

const MAKER = Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
const STRATEGY_HASH = Bytes.fromHexString("0x463dd4d17cda86f4f9a7cf5cbaa24a7b7f49869597664571129f2fe32a54bd3f");
const SWAP_ROUTER = Address.fromString("0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9");

describe("aqua", () => {
  beforeEach(() => {
    clearStore();
  });

  test("Shipped creates strategy when app is swap router", () => {
    const ev = changetype<Shipped>(newMockEvent());
    ev.parameters = new Array<ethereum.EventParam>();
    ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
    ev.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(SWAP_ROUTER)));
    ev.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(STRATEGY_HASH)));
    ev.parameters.push(new ethereum.EventParam("strategy", ethereum.Value.fromBytes(Bytes.fromUTF8("payload"))));

    handleShipped(ev);
    assert.assertNotNull(Strategy.load(STRATEGY_HASH.toHexString()));
    assert.fieldEquals("Strategy", STRATEGY_HASH.toHexString(), "docked", "false");
  });
});

function newMockEvent(): ethereum.Event {
  const event = new ethereum.Event();
  event.address = Address.fromString("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  event.logIndex = BigInt.fromI32(0);
  event.transaction = new ethereum.Transaction();
  event.transaction.hash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000002");
  event.block = new ethereum.Block();
  event.block.number = BigInt.fromI32(50);
  event.block.timestamp = BigInt.fromI32(1_700_000_000);
  return event;
}

function beforeEach(fn: () => void): void {
  fn();
}
