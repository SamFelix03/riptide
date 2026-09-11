/** Canonical RiptideErrors custom errors (contracts/src/types/RiptideErrors.sol). */
export const riptideErrorsAbi = [
  { type: "error", name: "RiptideNoSurplus", inputs: [{ name: "surplusWad", type: "int256" }] },
  {
    type: "error",
    name: "RiptideAuctionWindowClosed",
    inputs: [
      { name: "start", type: "uint40" },
      { name: "duration", type: "uint16" },
      { name: "nowTs", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "RiptideRebalanceAuctionStartMissing",
    inputs: [{ name: "strategyKey", type: "bytes32" }],
  },
  { type: "error", name: "RiptideStrategyNotActive", inputs: [{ name: "strategyHash", type: "bytes32" }] },
  {
    type: "error",
    name: "RiptideStaleOracleRound",
    inputs: [
      { name: "updatedAt", type: "uint256" },
      { name: "maxStaleness", type: "uint16" },
    ],
  },
] as const;
