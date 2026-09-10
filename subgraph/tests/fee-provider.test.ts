import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { assert, clearStore, describe, test, beforeEach, newMockEvent as defaultMockEvent } from "matchstick-as/assembly/index";

import { ControllerState, StrategyKeyIndex } from "../generated/schema";
import { FeeControllerUpdated } from "../generated/RiptideLvrFeeProvider/RiptideLvrFeeProvider";
import { handleFeeControllerUpdated } from "../src/mappings/fee-provider";

const STRATEGY_KEY = Bytes.fromHexString("0x3c8e904cdb19937d60d41c8d984b1a8803ad6e0891b4f9e032dcec2a22c2c7f5");
const STRATEGY_ID = "0x463dd4d17cda86f4f9a7cf5cbaa24a7b7f49869597664571129f2fe32a54bd3f";

function seedKeyIndex(): void {
  const index = new StrategyKeyIndex(STRATEGY_KEY.toHexString());
  index.strategy = STRATEGY_ID;
  index.save();
}

function createFeeEvent(): FeeControllerUpdated {
  const ev = changetype<FeeControllerUpdated>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("strategyKey", ethereum.Value.fromFixedBytes(STRATEGY_KEY)));
  ev.parameters.push(new ethereum.EventParam("sigmaWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000"))));
  ev.parameters.push(new ethereum.EventParam("feeTarget", ethereum.Value.fromI32(30)));
  ev.parameters.push(new ethereum.EventParam("feeReported", ethereum.Value.fromI32(25)));
  return ev;
}

describe("fee provider", () => {
  beforeEach(() => {
    clearStore();
  });

  test("FeeControllerUpdated creates controller state when strategy key indexed", () => {
    seedKeyIndex();
    handleFeeControllerUpdated(createFeeEvent());
    const id = "0x0000000000000000000000000000000000000000000000000000000000000003-0";
    assert.assertNotNull(ControllerState.load(id));
    assert.fieldEquals("ControllerState", id, "feeTarget", "30");
  });

  test("FeeControllerUpdated ignores unknown strategy key", () => {
    handleFeeControllerUpdated(createFeeEvent());
    assert.entityCount("ControllerState", 0);
  });
});

function newMockEvent(): ethereum.Event {
  const event = defaultMockEvent();
  event.address = Address.fromString("0x0000000000000000000000000000000000000006");
  event.logIndex = BigInt.fromI32(0);
  event.transaction.hash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000003");
  event.block.number = BigInt.fromI32(200);
  event.block.timestamp = BigInt.fromI32(1_700_000_000);
  return event;
}
