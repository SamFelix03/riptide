import { WAD } from "./constants.js";

export enum Rounding {
  Down = "floor",
  Up = "ceiling",
}

export function mulDiv(x: bigint, y: bigint, d: bigint, rounding: Rounding): bigint {
  if (d === 0n) throw new Error("division by zero");
  const prod = x * y;
  let q = prod / d;
  if (rounding === Rounding.Up && prod % d !== 0n) q += 1n;
  return q;
}

export function toWad(amount: bigint, decimals: number): bigint {
  if (decimals > 18) throw new Error("unsupported decimals");
  if (decimals === 18) return amount;
  return amount * 10n ** BigInt(18 - decimals);
}

export function fromWad(amountWad: bigint, decimals: number): bigint {
  if (decimals > 18) throw new Error("unsupported decimals");
  if (decimals === 18) return amountWad;
  return amountWad / 10n ** BigInt(18 - decimals);
}

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrt negative");
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export function sqrtWad(x: bigint): bigint {
  return isqrt(x * WAD);
}
