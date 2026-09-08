import { BPS, WAD } from "./constants.js";
import { mulDiv, Rounding } from "./fullPrecision.js";
import { lvrRateCpmm, lvrRateGeneral } from "./lvr.js";

export function cpmmExactIn(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, feeBps: bigint): bigint {
  if (reserveIn === 0n || reserveOut === 0n || amountIn === 0n) throw new Error("invalid pool");
  const inNet = mulDiv(amountIn, BPS - feeBps, BPS, Rounding.Down);
  return mulDiv(reserveOut, inNet, reserveIn + inNet, Rounding.Down);
}

export function cpmmExactOut(reserveIn: bigint, reserveOut: bigint, amountOut: bigint, feeBps: bigint): bigint {
  if (reserveIn === 0n || reserveOut === 0n || amountOut === 0n || amountOut >= reserveOut) throw new Error("invalid pool");
  const inNet = mulDiv(reserveIn, reserveOut, reserveOut - amountOut, Rounding.Up) - reserveIn;
  return mulDiv(inNet, BPS, BPS - feeBps, Rounding.Up);
}

export { lvrRateCpmm, lvrRateGeneral };
