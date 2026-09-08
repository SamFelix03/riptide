import { encodeAbiParameters, keccak256, stringToBytes } from "viem";

export const MARKET_ID_DOMAIN = keccak256(stringToBytes("RIPTIDE.marketId.v1"));

export function policyHash(payload: Uint8Array): `0x${string}` {
  return keccak256(payload);
}

export function marketId(base: `0x${string}`, quote: `0x${string}`): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }],
      [MARKET_ID_DOMAIN, base, quote],
    ),
  );
}

export function strategyKey(maker: `0x${string}`, strategyHash: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [maker, strategyHash]));
}

export function strategyHashFromOrder(order: {
  maker: `0x${string}`;
  traits: bigint;
  data: `0x${string}`;
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [order.maker, order.traits, order.data],
    ),
  );
}
