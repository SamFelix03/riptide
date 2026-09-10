import { encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";

import { riptideBatchExecutorAbi, riptideErrorsAbi } from "@riptide/contracts";
import { decodeRiptideError, RiptideFrontendApiError } from "../src/errors.js";
import { createFrontendApi } from "../src/factory.js";

const PRIORITY_ERRORS = [
  "RiptideStaleVersion",
  "RiptideSlippageExceeded",
  "RiptideNoSurplus",
  "RiptideStaleOracleRound",
  "RiptideDeadlineExpired",
  "RiptideStrategyNotActive",
] as const;

describe("frontend-api errors", () => {
  it.each(PRIORITY_ERRORS)("mock exposes %s via forceError", async (code) => {
    const api = createFrontendApi({ mode: "mock" });
    await expect(api.listStrategies("RBASE-RQUOTE", { forceError: code })).rejects.toBeInstanceOf(
      RiptideFrontendApiError,
    );
  });

  it("decodes known revert selector", () => {
    const data = encodeErrorResult({
      abi: riptideBatchExecutorAbi,
      errorName: "RiptideStaleVersion",
      args: [1n, 2n],
    });
    const decoded = decodeRiptideError({ data });
    expect(decoded?.code).toBe("RiptideStaleVersion");
    expect(decoded?.args?.expected).toBe("1");
    expect(decoded?.args?.actual).toBe("2");
  });

  it("decodes RiptideNoSurplus from viem-style revert message", () => {
    const data = encodeErrorResult({
      abi: riptideErrorsAbi,
      errorName: "RiptideNoSurplus",
      args: [-123n],
    });
    const decoded = decodeRiptideError(
      new Error(
        `The contract function "previewRebalance" reverted with the following signature: 0x3c10eb25\nDetails: execution reverted: custom error ${data}`,
      ),
    );
    expect(decoded?.code).toBe("RiptideNoSurplus");
  });
});

const HAS_LIVE = process.env.RPC_URL !== undefined;
const HAS_SOLVER_API = HAS_LIVE && process.env.SOLVER_API_URL !== undefined;

describe.skipIf(!HAS_SOLVER_API)("frontend-api live errors", () => {
  it.skip("decodes typed revert from forced batch execute (requires solver-api route fixture)", () => {
    // Covered by mock forceError + encodeErrorResult unit tests until solver-api is up in CI.
  });
});
