import { BPS, WAD } from "./constants.js";
import { mulDiv, Rounding } from "./fullPrecision.js";

export type PiState = {
  feeReported: bigint;
  integral: bigint;
  kp: bigint;
  ki: bigint;
  iMax: bigint;
  feeMin: bigint;
  feeMax: bigint;
};

function clamp(value: bigint, lo: bigint, hi: bigint): bigint {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

export function feeTarget(sigmaWad: bigint, lambdaQ: bigint, feeMin: bigint, feeMax: bigint): bigint {
  const sigma2 = mulDiv(sigmaWad, sigmaWad, WAD, Rounding.Down);
  const phiStar = mulDiv(sigma2, WAD, 8n * lambdaQ, Rounding.Down);
  const raw = mulDiv(phiStar, BPS, WAD, Rounding.Down);
  return clamp(raw, feeMin, feeMax);
}

export function piStep(state: PiState, target: bigint): { feeReported: bigint; integral: bigint } {
  const error = target - state.feeReported;
  const kiError = mulDiv(state.ki, error, WAD, Rounding.Down);
  const maxI = state.iMax;
  const integral = clamp(state.integral + kiError, -maxI, maxI);
  const kpError = mulDiv(state.kp, error, WAD, Rounding.Down);
  const feeReported = clamp(state.feeReported + kpError + integral, state.feeMin, state.feeMax);
  return { feeReported, integral };
}
