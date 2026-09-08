import { WAD } from "./constants.js";
import { mulDiv, Rounding } from "./fullPrecision.js";

export function lvrRateCpmm(sigmaWad: bigint, valueWad: bigint): bigint {
  const sigma2 = mulDiv(sigmaWad, sigmaWad, WAD, Rounding.Down);
  return mulDiv(sigma2, valueWad, 8n * WAD, Rounding.Down);
}

export function lvrRateGeneral(sigmaWad: bigint, priceWad: bigint, valueWad: bigint): bigint {
  const vDoublePrime = mulDiv(
    valueWad,
    WAD,
    mulDiv(priceWad, priceWad, WAD, Rounding.Down),
    Rounding.Down,
  ) / 4n;
  const sigma2P2 = mulDiv(
    mulDiv(sigmaWad, sigmaWad, WAD, Rounding.Down),
    mulDiv(priceWad, priceWad, WAD, Rounding.Down),
    WAD,
    Rounding.Down,
  );
  return mulDiv(sigma2P2, vDoublePrime, 2n * WAD, Rounding.Down);
}
