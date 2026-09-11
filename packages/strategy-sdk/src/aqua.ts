import { AquaProtocolContract, Address, HexString } from "@1inch/aqua-sdk";

/**
 * Aqua lifecycle calldata, built with 1inch's official `@1inch/aqua-sdk`.
 *
 * These used to be hand-rolled `encodeFunctionData` calls against a locally declared
 * Aqua ABI. The SDK produces byte-identical calldata, so using it removes a duplicated
 * ABI and keeps us aligned with upstream if the interface ever moves.
 *
 * Note the swap-vm SDK is *not* used for order construction: RIPTIDE carries its 226-byte
 * policy payload in the MakerTraits program slice, and that SDK's `Order.encode()`
 * normalises those slice bits away, which would drop the payload and change every Aqua
 * strategy hash. Order bytes stay with RIPTIDE's own codec.
 */

export type AquaTokenAmount = { token: `0x${string}`; amount: bigint };

/** `Aqua.ship(app, strategy, tokens, amounts)` calldata. */
export function encodeAquaShip(
  app: `0x${string}`,
  strategyBytes: `0x${string}`,
  tokenAmounts: readonly AquaTokenAmount[],
): `0x${string}` {
  return AquaProtocolContract.encodeShipCallData({
    app: new Address(app),
    strategy: new HexString(strategyBytes),
    amountsAndTokens: tokenAmounts.map((t) => ({ token: new Address(t.token), amount: t.amount })),
  }).toString() as `0x${string}`;
}

/** `Aqua.dock(app, strategyHash, tokens)` calldata. */
export function encodeAquaDock(
  app: `0x${string}`,
  strategyHash: `0x${string}`,
  tokens: readonly `0x${string}`[],
): `0x${string}` {
  return AquaProtocolContract.encodeDockCallData({
    app: new Address(app),
    strategyHash: new HexString(strategyHash),
    tokens: tokens.map((t) => new Address(t)),
  }).toString() as `0x${string}`;
}

/**
 * `strategyHash = keccak256(abi.encode(order))` — the value Aqua commits on `ship` and
 * the key every `safeBalances` / `pull` / `push` call is scoped by.
 */
export function aquaStrategyHash(strategyBytes: `0x${string}`): `0x${string}` {
  return AquaProtocolContract.calculateStrategyHash(new HexString(strategyBytes)).toString() as `0x${string}`;
}
