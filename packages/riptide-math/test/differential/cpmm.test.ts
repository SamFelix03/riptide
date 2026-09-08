import { describe, it } from "vitest";
import { cpmmExactIn, cpmmExactOut, lvrRateCpmm, lvrRateGeneral } from "../../src/cpmm.js";
import { WAD } from "../../src/constants.js";
import { mulDiv, Rounding } from "../../src/fullPrecision.js";
import { bi, expectWad, loadVector } from "./vectors.js";

describe("cpmm vectors", () => {
  const file = loadVector("cpmm_swap_v1.json");
  for (const c of file.cases) {
    it(c.id, () => {
      const { reserveIn, reserveOut, feeBps, kind } = c.inputs;
      if (kind === "exact_in") {
        const out = cpmmExactIn(bi(reserveIn), bi(reserveOut), bi(c.inputs.amountIn!), bi(feeBps));
        expectWad(out, c.outputs!.amountOut);
        const sigma = bi("200000000000000000");
        const value = bi(reserveIn) + bi(reserveOut);
        const price = mulDiv(bi(reserveIn), WAD, bi(reserveOut), Rounding.Down);
        expectWad(lvrRateGeneral(sigma, price, value), c.outputs!.lvrGeneral);
        expectWad(lvrRateCpmm(sigma, value), c.outputs!.lvrCpmm);
      } else {
        const amountIn = cpmmExactOut(bi(reserveIn), bi(reserveOut), bi(c.inputs.amountOut!), bi(feeBps));
        expectWad(amountIn, c.outputs!.amountIn);
      }
    });
  }
});
