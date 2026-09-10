import { FeeControllerUpdated } from "../../generated/RiptideLvrFeeProvider/RiptideLvrFeeProvider";
import { ControllerState, StrategyKeyIndex } from "../../generated/schema";

export function handleFeeControllerUpdated(event: FeeControllerUpdated): void {
  const index = StrategyKeyIndex.load(event.params.strategyKey.toHexString());
  if (index == null) return;

  const id = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(event.logIndex.toString());
  const state = new ControllerState(id);
  state.strategy = index.strategy;
  state.sigmaWad = event.params.sigmaWad;
  state.feeTarget = event.params.feeTarget;
  state.feeReported = event.params.feeReported;
  state.timestamp = event.block.timestamp;
  state.blockNumber = event.block.number;
  state.save();
}
