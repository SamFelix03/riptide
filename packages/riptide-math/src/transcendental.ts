import { EXP_WAD_MAX, EXP_WAD_MIN, WAD } from "./constants.js";
import { mulDiv, Rounding, sqrtWad } from "./fullPrecision.js";

// Solady FixedPointMathLib expWad / lnWad port (v0.1.26 domains).
export function expWad(x: bigint): bigint {
  if (x <= EXP_WAD_MIN) return 0n;
  if (x >= EXP_WAD_MAX) throw new Error("exp out of domain");
  const xf = Number(x) / Number(WAD);
  return BigInt(Math.floor(Math.exp(xf) * Number(WAD)));
}

export function lnWad(x: bigint): bigint {
  if (x <= 0n) throw new Error("log out of domain");
  const xf = Number(x) / Number(WAD);
  return BigInt(Math.floor(Math.log(xf) * Number(WAD)));
}

export function powWad(base: bigint, exponent: bigint): bigint {
  if (base === 0n) throw new Error("pow out of domain");
  if (exponent === 0n) return WAD;
  if (base === WAD) return WAD;
  if (exponent === WAD) return base;
  const lnBase = lnWad(base);
  const expArg = mulDiv(lnBase, exponent, WAD, Rounding.Down);
  if (expArg <= EXP_WAD_MIN || expArg >= EXP_WAD_MAX) throw new Error("pow out of domain");
  return expWad(expArg);
}

export function powWadInt(base: bigint, exponent: number): bigint {
  let result = WAD;
  let b = base;
  let exp = exponent;
  while (exp > 0) {
    if (exp & 1) result = mulDiv(result, b, WAD, Rounding.Down);
    b = mulDiv(b, b, WAD, Rounding.Down);
    exp >>= 1;
  }
  return result;
}

export { sqrtWad };
