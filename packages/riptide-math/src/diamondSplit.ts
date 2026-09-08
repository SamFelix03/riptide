import { WAD } from "./constants.js";
import { mulDiv, Rounding } from "./fullPrecision.js";
import { powWadInt } from "./transcendental.js";

export function diamondSplit(surplusWad: bigint, beta: bigint): { payToResolver: bigint; retainToLP: bigint } {
  if (surplusWad < 0n) throw new Error("negative surplus");
  if (beta <= 0n || beta >= WAD) throw new Error("invalid beta");
  const payToResolver = mulDiv(WAD - beta, surplusWad, WAD, Rounding.Down);
  return { payToResolver, retainToLP: surplusWad - payToResolver };
}

export function dutchAuctionBalanceIn(balance: bigint, decay: bigint, elapsed: number): bigint {
  const factor = powWadInt(decay, elapsed);
  return mulDiv(balance, factor, WAD, Rounding.Down);
}
