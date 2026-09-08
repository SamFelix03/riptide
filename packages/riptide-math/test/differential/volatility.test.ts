import { describe, it } from "vitest";
import { applyStaleFreeze, ewmaVar, gkTerm, sigmaFromVar } from "../../src/volatility.js";
import { bi, expectWad, loadVector } from "./vectors.js";

describe("volatility vectors", () => {
  const file = loadVector("volatility_v1.json");
  for (const c of file.cases) {
    it(c.id, () => {
      if (c.id === "vol_stale_freeze") {
        const sigma = applyStaleFreeze(bi(c.inputs.sigmaPrev!), bi(c.inputs.sigmaCandidate!), c.inputs.isStale === "1");
        expectWad(sigma, c.outputs!.sigmaWad);
        return;
      }
      if (c.id === "vol_clamp_min") {
        const sigma = sigmaFromVar(0n, bi(c.inputs.dt!), bi(c.inputs.sigmaMin!), bi(c.inputs.sigmaMax!));
        expectWad(sigma, c.outputs!.sigmaWad);
        return;
      }
      if (c.id === "vol_clamp_max") {
        const varWad = ewmaVar(0n, bi(c.inputs.logReturn!), bi(c.inputs.lambda!), 0n, false);
        const sigma = sigmaFromVar(varWad, bi(c.inputs.dt!), bi(c.inputs.sigmaMin!), bi(c.inputs.sigmaMax!));
        expectWad(sigma, c.outputs!.sigmaWad);
        return;
      }
      const useGk = Boolean(c.inputs.high);
      const gk = useGk
        ? gkTerm(bi(c.inputs.high!), bi(c.inputs.low!), bi(c.inputs.close!), bi(c.inputs.open!))
        : 0n;
      if (c.outputs?.gkTerm) expectWad(gk, c.outputs.gkTerm);
      const varWad = ewmaVar(bi(c.inputs.prevVar!), bi(c.inputs.logReturn!), bi(c.inputs.lambda!), gk, useGk);
      if (c.outputs?.varWad) expectWad(varWad, c.outputs.varWad);
      const sigma = sigmaFromVar(varWad, bi(c.inputs.dt!), bi(c.inputs.sigmaMin!), bi(c.inputs.sigmaMax!));
      expectWad(sigma, c.outputs!.sigmaWad);
    });
  }
});
