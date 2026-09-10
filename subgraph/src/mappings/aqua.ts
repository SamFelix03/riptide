import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

import { Docked, Pushed, Pulled, Shipped } from "../../generated/Aqua/Aqua";
import { ensureProtocol, ensureMaker, ensureMarket, SWAP_ROUTER_ADDRESS, DEMO_MARKET_ID, BASE_TOKEN, QUOTE_TOKEN } from "../helpers";
import { Strategy } from "../../generated/schema";

function loadOrCreateStrategy(strategyHash: Bytes, maker: Address): Strategy {
  const id = strategyHash.toHexString();
  let strategy = Strategy.load(id);
  if (strategy == null) {
    ensureMaker(maker);
    ensureMarket(DEMO_MARKET_ID);
    strategy = new Strategy(id);
    strategy.strategyKey = Bytes.empty();
    strategy.strategyHash = strategyHash;
    strategy.maker = maker.toHexString();
    strategy.market = DEMO_MARKET_ID.toHexString();
    strategy.reserveBaseWad = BigInt.zero();
    strategy.reserveQuoteWad = BigInt.zero();
    strategy.aquaBase = BigInt.zero();
    strategy.aquaQuote = BigInt.zero();
    strategy.docked = false;
    strategy.lastVersion = BigInt.zero();
  }
  return strategy;
}

export function handleShipped(event: Shipped): void {
  if (!event.params.app.equals(SWAP_ROUTER_ADDRESS)) return;
  ensureProtocol();
  const strategy = loadOrCreateStrategy(event.params.strategyHash, event.params.maker);
  strategy.docked = false;
  strategy.save();
}

export function handleDocked(event: Docked): void {
  if (!event.params.app.equals(SWAP_ROUTER_ADDRESS)) return;
  const strategy = loadOrCreateStrategy(event.params.strategyHash, event.params.maker);
  strategy.docked = true;
  strategy.save();
}

export function handlePushed(event: Pushed): void {
  if (!event.params.app.equals(SWAP_ROUTER_ADDRESS)) return;
  const strategy = loadOrCreateStrategy(event.params.strategyHash, event.params.maker);
  const token = Bytes.fromHexString(event.params.token.toHexString());
  if (token.equals(BASE_TOKEN)) {
    strategy.aquaBase = strategy.aquaBase.plus(event.params.amount);
  } else if (token.equals(QUOTE_TOKEN)) {
    strategy.aquaQuote = strategy.aquaQuote.plus(event.params.amount);
  }
  strategy.save();
}

export function handlePulled(event: Pulled): void {
  if (!event.params.app.equals(SWAP_ROUTER_ADDRESS)) return;
  const strategy = loadOrCreateStrategy(event.params.strategyHash, event.params.maker);
  const token = Bytes.fromHexString(event.params.token.toHexString());
  if (token.equals(BASE_TOKEN)) {
    strategy.aquaBase = strategy.aquaBase.minus(event.params.amount);
  } else if (token.equals(QUOTE_TOKEN)) {
    strategy.aquaQuote = strategy.aquaQuote.minus(event.params.amount);
  }
  strategy.save();
}
