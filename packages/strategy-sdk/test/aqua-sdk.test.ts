import { describe, expect, it } from "vitest";
import { encodeFunctionData, keccak256 } from "viem";

import { aquaStrategyHash, encodeAquaDock, encodeAquaShip } from "../src/aqua.js";

// Arbitrary fixture addresses - this test only compares two encoders, it makes no calls.
const APP = "0x6Ad25D6111E1DfFD6d809cab5e4D012A95a341cD" as const;
const BASE = "0xCd75c96a6659d94004EFBe528D95eAF933A916be" as const;
const QUOTE = "0x5A2858D733295000199CA9030e4A094e9E9EF846" as const;
const STRATEGY = "0xdeadbeefcafe" as const;
const HASH = "0x0c87ecd32ef7c1b25337634ac6175858d7af147ba2d7fa27e68944e058661478" as const;

const shipAbi = [
  {
    type: "function",
    name: "ship",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "nonpayable",
  },
] as const;

const dockAbi = [
  {
    type: "function",
    name: "dock",
    inputs: [
      { name: "router", type: "address" },
      { name: "orderHash", type: "bytes32" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

describe("Aqua calldata via @1inch/aqua-sdk", () => {
  it("ship calldata matches the raw ABI encoding", () => {
    const amounts = [100n * 10n ** 18n, 200_000n * 10n ** 18n];
    expect(
      encodeAquaShip(APP, STRATEGY, [
        { token: BASE, amount: amounts[0]! },
        { token: QUOTE, amount: amounts[1]! },
      ]).toLowerCase(),
    ).toBe(
      encodeFunctionData({
        abi: shipAbi,
        functionName: "ship",
        args: [APP, STRATEGY, [BASE, QUOTE], amounts],
      }).toLowerCase(),
    );
  });

  it("dock calldata matches the raw ABI encoding", () => {
    expect(encodeAquaDock(APP, HASH, [BASE, QUOTE]).toLowerCase()).toBe(
      encodeFunctionData({ abi: dockAbi, functionName: "dock", args: [APP, HASH, [BASE, QUOTE]] }).toLowerCase(),
    );
  });

  it("strategyHash is keccak256 of the encoded order", () => {
    expect(aquaStrategyHash(STRATEGY).toLowerCase()).toBe(keccak256(STRATEGY).toLowerCase());
  });
});
