import { LN2_COEFF_WAD, WAD } from "./constants.js";
import { mulDiv, Rounding, sqrtWad } from "./fullPrecision.js";
import { lnWad } from "./transcendental.js";

export function ewmaVar(prevVar: bigint, logReturn: bigint, lambda: bigint, gkTerm = 0n, useGk = false): bigint {
  const r = logReturn < 0n ? -logReturn : logReturn;
  let obs = mulDiv(r, r, WAD, Rounding.Down);
  if (useGk) obs += gkTerm;
  const oneMinus = WAD - lambda;
  return mulDiv(lambda, prevVar, WAD, Rounding.Down) + mulDiv(oneMinus, obs, WAD, Rounding.Down);
}

export function gkTerm(high: bigint, low: bigint, close: bigint, open: bigint): bigint {
  const hl = lnWad(mulDiv(high, WAD, low, Rounding.Down));
  const co = lnWad(mulDiv(close, WAD, open, Rounding.Down));
  const hl2 = mulDiv(hl < 0n ? -hl : hl, hl < 0n ? -hl : hl, WAD, Rounding.Down) / 2n;
  const co2 = mulDiv(co < 0n ? -co : co, co < 0n ? -co : co, WAD, Rounding.Down);
  const termCo = mulDiv(LN2_COEFF_WAD, co2, WAD, Rounding.Down);
  return hl2 > termCo ? hl2 - termCo : 0n;
}

export function sigmaFromVar(varWad: bigint, dt: bigint, sigmaMin: bigint, sigmaMax: bigint): bigint {
  let sigma = 0n;
  if (varWad > 0n) sigma = sqrtWad(mulDiv(varWad, WAD, dt, Rounding.Down));
  if (sigma < sigmaMin) return sigmaMin;
  if (sigma > sigmaMax) return sigmaMax;
  return sigma;
}

export function applyStaleFreeze(sigmaPrev: bigint, sigmaCandidate: bigint, isStale: boolean): bigint {
  return isStale ? sigmaPrev : sigmaCandidate;
}
