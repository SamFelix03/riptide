import { RouteExecuted } from "../../generated/RiptideBatchExecutor/RiptideBatchExecutor";
import { Route } from "../../generated/schema";
import { ensureMarket, ensureProtocol } from "../helpers";

export function handleRouteExecuted(event: RouteExecuted): void {
  ensureProtocol();
  ensureMarket(event.params.marketId);

  const route = new Route(event.params.routeId.toHexString());
  route.market = event.params.marketId.toHexString();
  route.payer = event.params.payer;
  route.recipient = event.params.recipient;
  route.kind = event.params.kind;
  route.tokenIn = event.params.tokenIn;
  route.tokenOut = event.params.tokenOut;
  route.amountIn = event.params.amountIn;
  route.amountOut = event.params.amountOut;
  route.limit = event.params.limit;
  route.fillCount = event.params.fillCount;
  route.blockNumber = event.block.number;
  route.timestamp = event.block.timestamp;
  route.txHash = event.transaction.hash;
  route.save();
}
