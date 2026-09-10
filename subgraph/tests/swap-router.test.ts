import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { assert, clearStore, describe, test, beforeEach, newMockEvent as defaultMockEvent } from "matchstick-as/assembly/index";

import { Strategy, StrategyKeyIndex } from "../generated/schema";
import { StrategyRuntimeInitialized, SwapFilled } from "../generated/RiptideSwapVMRouter/RiptideSwapVMRouter";
import { handleStrategyRuntimeInitialized, handleSwapFilled } from "../src/mappings/swap-router";

const MAKER = Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
const STRATEGY_KEY = Bytes.fromHexString("0x3c8e904cdb19937d60d41c8d984b1a8803ad6e0891b4f9e032dcec2a22c2c7f5");
const STRATEGY_HASH = Bytes.fromHexString("0x463dd4d17cda86f4f9a7cf5cbaa24a7b7f49869597664571129f2fe32a54bd3f");
const MARKET_ID = Bytes.fromHexString("0x5fda11de1a2ed0b5d3c2e74823b76e83e05972744e3f0b5695ce173a4fd62251");

function createInitEvent(): StrategyRuntimeInitialized {
  const ev = changetype<StrategyRuntimeInitialized>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("strategyKey", ethereum.Value.fromFixedBytes(STRATEGY_KEY)));
  ev.parameters.push(new ethereum.EventParam("marketId", ethereum.Value.fromFixedBytes(MARKET_ID)));
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(STRATEGY_HASH)));
  ev.parameters.push(
    new ethereum.EventParam("reserveBaseWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("100000000000000000000"))),
  );
  ev.parameters.push(
    new ethereum.EventParam("reserveQuoteWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("200000000000000000000000"))),
  );
  ev.parameters.push(new ethereum.EventParam("version", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))));
  return ev;
}

describe("swap router", () => {
  beforeEach(() => {
    clearStore();
  });

  test("StrategyRuntimeInitialized creates strategy and key index", () => {
    handleStrategyRuntimeInitialized(createInitEvent());
    assert.assertNotNull(Strategy.load(STRATEGY_HASH.toHexString()));
    assert.assertNotNull(StrategyKeyIndex.load(STRATEGY_KEY.toHexString()));
  });

  test("replay is idempotent", () => {
    const ev = createInitEvent();
    handleStrategyRuntimeInitialized(ev);
    handleStrategyRuntimeInitialized(ev);
    assert.fieldEquals("Strategy", STRATEGY_HASH.toHexString(), "lastVersion", "1");
    assert.entityCount("StrategyKeyIndex", 1);
  });
});

describe("swap filled", () => {
  beforeEach(() => {
    clearStore();
  });

  test("SwapFilled creates fill entity", () => {
    handleStrategyRuntimeInitialized(createInitEvent());
    handleSwapFilled(createSwapFilledEvent());
    assert.entityCount("Fill", 1);
  });
});

function createSwapFilledEvent(): SwapFilled {
  const ev = changetype<SwapFilled>(newMockEvent());
  ev.parameters = new Array<ethereum.EventParam>();
  ev.parameters.push(new ethereum.EventParam("routeId", ethereum.Value.fromFixedBytes(Bytes.fromHexString("0x1111111111111111111111111111111111111111111111111111111111111111"))));
  ev.parameters.push(new ethereum.EventParam("strategyKey", ethereum.Value.fromFixedBytes(STRATEGY_KEY)));
  ev.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(MAKER)));
  ev.parameters.push(new ethereum.EventParam("marketId", ethereum.Value.fromFixedBytes(MARKET_ID)));
  ev.parameters.push(new ethereum.EventParam("tokenIn", ethereum.Value.fromAddress(Address.fromString("0x0000000000000000000000000000000000000011"))));
  ev.parameters.push(new ethereum.EventParam("tokenOut", ethereum.Value.fromAddress(Address.fromString("0x0000000000000000000000000000000000000012"))));
  ev.parameters.push(new ethereum.EventParam("amountIn", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000"))));
  ev.parameters.push(new ethereum.EventParam("amountOut", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("2000000000000000000000"))));
  ev.parameters.push(new ethereum.EventParam("feeBpsApplied", ethereum.Value.fromI32(30)));
  ev.parameters.push(new ethereum.EventParam("sigmaWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000"))));
  ev.parameters.push(new ethereum.EventParam("reserveBaseAfterWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("990000000000000000000"))));
  ev.parameters.push(new ethereum.EventParam("reserveQuoteAfterWad", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("200200000000000000000000"))));
  ev.parameters.push(new ethereum.EventParam("versionAfter", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2))));
  return ev;
}

function newMockEvent(): ethereum.Event {
  const event = defaultMockEvent();
  event.address = Address.fromString("0x0000000000000000000000000000000000000002");
  event.logIndex = BigInt.fromI32(0);
  event.transaction.hash = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000001");
  event.block.number = BigInt.fromI32(100);
  event.block.timestamp = BigInt.fromI32(1_700_000_000);
  return event;
}
