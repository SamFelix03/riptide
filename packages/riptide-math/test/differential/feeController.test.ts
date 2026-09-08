import { describe, it } from "vitest";
import { feeTarget, piStep } from "../../src/feeController.js";
import { bi, expectWad, loadVector } from "./vectors.js";

describe("fee controller vectors", () => {
  const file = loadVector("fee_controller_v1.json");
  for (const c of file.cases) {
    it(c.id, () => {
      if (c.id === "fee_target_mid") {
        const target = feeTarget(bi(c.inputs.sigmaWad), bi(c.inputs.lambdaQ), bi(c.inputs.feeMin), bi(c.inputs.feeMax));
        expectWad(target, c.outputs!.feeTarget);
        return;
      }
      const state = {
        feeReported: bi(c.inputs.feeReportedPrev!),
        integral: bi(c.inputs.integralPrev!),
        kp: bi(c.inputs.kp!),
        ki: bi(c.inputs.ki!),
        iMax: bi(c.inputs.iMax!),
        feeMin: bi(c.inputs.feeMin!),
        feeMax: bi(c.inputs.feeMax!),
      };
      const { feeReported, integral } = piStep(state, bi(c.inputs.feeTarget!));
      expectWad(feeReported, c.outputs!.feeReported);
      expectWad(integral, c.outputs!.integral);
    });
  }
});
