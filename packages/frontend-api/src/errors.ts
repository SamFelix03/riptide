import {
  riptideAuctionSettlerAbi,
  riptideBatchExecutorAbi,
  riptideLensAbi,
  riptideQuoterAbi,
  riptideRebalanceRouterAbi,
  riptideSwapVMRouterAbi,
  riptideVolatilityOracleAbi,
  riptideErrorsAbi,
} from "@riptide/contracts/abis";
import { isInactiveAquaStrategyError, isAuctionWindowClosedError } from "@riptide/solver-core";
import { decodeErrorResult, type Abi } from "viem";

const RIPTIDE_ERROR_ABI = [
  ...riptideBatchExecutorAbi.filter((e) => e.type === "error"),
  ...riptideAuctionSettlerAbi.filter((e) => e.type === "error"),
  ...riptideSwapVMRouterAbi.filter((e) => e.type === "error"),
  ...riptideRebalanceRouterAbi.filter((e) => e.type === "error"),
  ...riptideQuoterAbi.filter((e) => e.type === "error"),
  ...riptideLensAbi.filter((e) => e.type === "error"),
  ...riptideVolatilityOracleAbi.filter((e) => e.type === "error"),
  ...riptideErrorsAbi,
] as const satisfies Abi;

export type RiptideErrorCode =
  | "RiptideZeroAddress"
  | "RiptideIdenticalTokens"
  | "RiptideUnsupportedTokenDecimals"
  | "RiptideInvalidEncodingLength"
  | "RiptideInvalidEncodingMagic"
  | "RiptideUnsupportedEncodingVersion"
  | "RiptideInvalidFeeBounds"
  | "RiptideInvalidLambda"
  | "RiptideInvalidBeta"
  | "RiptideInvalidDecay"
  | "RiptideInvalidSigmaBounds"
  | "RiptideStrategyHashMismatch"
  | "RiptideStaleVersion"
  | "RiptideStrategyNotActive"
  | "RiptideRebalanceAuctionStartMissing"
  | "RiptideDeadlineExpired"
  | "RiptideUnauthorizedResolver"
  | "RiptideUnauthorizedObserver"
  | "RiptideReentrantExecution"
  | "RiptideNoSurplus"
  | "RiptideAuctionWindowClosed"
  | "RiptideStaleBaseline"
  | "RiptideFeeOutOfRange"
  | "RiptideStaleOracleRound"
  | "RiptideNonPositivePrice"
  | "RiptideMathDivisionByZero"
  | "RiptideMathOverflow"
  | "RiptideMathUnderflow"
  | "RiptideAmountOverflow"
  | "RiptideLogInputOutOfDomain"
  | "RiptideExpInputOutOfDomain"
  | "RiptidePowOutOfDomain"
  | "RiptideSlippageExceeded"
  | "RiptideTooManyFills"
  | "RiptideDuplicateStrategy"
  | "RiptideSwapFailed";

export type RiptideFrontendError = {
  code: RiptideErrorCode;
  message: string;
  args?: Record<string, string | number | boolean>;
};

const USER_MESSAGES: Partial<Record<RiptideErrorCode, string>> = {
  RiptideStaleVersion: "Strategy version changed since the route was built. Refresh and try again.",
  RiptideSlippageExceeded: "Quote input exceeded the max-in bound. Refresh the settle plan and try again.",
  RiptideNoSurplus: "No profitable surplus for this rebalance.",
  RiptideStaleOracleRound: "Oracle price is stale.",
  RiptideDeadlineExpired: "Transaction deadline has passed.",
  RiptideStrategyNotActive: "Strategy is not active or has been docked.",
  RiptideRebalanceAuctionStartMissing: "Rebalance auction was not shipped — re-run seed.",
  RiptideAuctionWindowClosed: "Rebalance auction window has closed. Re-run demo seed (pnpm demo:reset).",
  RiptideUnauthorizedResolver: "This transaction must be sent by the strategy maker (or protocol owner).",
};

function extractRevertDataFromMessage(message: string): `0x${string}` | null {
  const custom = message.match(/custom error (0x[a-fA-F0-9]{8}[a-fA-F0-9]*)/);
  if (custom?.[1]) return custom[1] as `0x${string}`;
  const signature = message.match(/(?:signature|reason):\s*(0x[a-fA-F0-9]{8})/i);
  if (signature?.[1]) return signature[1] as `0x${string}`;
  return null;
}

function extractRevertData(err: unknown): `0x${string}` | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  if (typeof e.data === "string" && e.data.startsWith("0x") && e.data.length >= 10) {
    return e.data as `0x${string}`;
  }
  for (const key of ["shortMessage", "details", "message"] as const) {
    const text = e[key];
    if (typeof text === "string") {
      const fromText = extractRevertDataFromMessage(text);
      if (fromText) return fromText;
    }
  }
  if (e.cause) return extractRevertData(e.cause);
  return null;
}

export function decodeRiptideError(err: unknown): RiptideFrontendError | null {
  const data = extractRevertData(err);
  if (!data) return null;
  try {
    const decoded = decodeErrorResult({ abi: RIPTIDE_ERROR_ABI, data });
    const code = decoded.errorName as RiptideErrorCode;
    const args: Record<string, string | number | boolean> = {};
    const errorAbi = RIPTIDE_ERROR_ABI.find((e) => e.type === "error" && e.name === decoded.errorName);
    if (errorAbi && "inputs" in errorAbi && Array.isArray(decoded.args)) {
      for (let i = 0; i < errorAbi.inputs.length; i++) {
        const input = errorAbi.inputs[i]!;
        const v = decoded.args[i];
        args[input.name] = typeof v === "bigint" ? v.toString() : (v as string | number | boolean);
      }
    } else {
      for (const [k, v] of Object.entries(decoded.args ?? {})) {
        args[k] = typeof v === "bigint" ? v.toString() : (v as string | number | boolean);
      }
    }
    return {
      code,
      message: USER_MESSAGES[code] ?? code,
      args: Object.keys(args).length ? args : undefined,
    };
  } catch {
    return null;
  }
}

export class RiptideFrontendApiError extends Error {
  readonly riptide: RiptideFrontendError;

  constructor(riptide: RiptideFrontendError) {
    super(riptide.message);
    this.name = "RiptideFrontendApiError";
    this.riptide = riptide;
  }
}

export function throwIfRiptideError(err: unknown): never {
  const decoded = decodeRiptideError(err);
  if (decoded) throw new RiptideFrontendApiError(decoded);
  if (isInactiveAquaStrategyError(err)) {
    throw new RiptideFrontendApiError({
      code: "RiptideStrategyNotActive",
      message: "Rebalance Aqua order is out of sync with the quoter. Re-run demo seed (pnpm demo:reset).",
    });
  }
  if (isAuctionWindowClosedError(err)) {
    throw new RiptideFrontendApiError({
      code: "RiptideAuctionWindowClosed",
      message: USER_MESSAGES.RiptideAuctionWindowClosed ?? "Rebalance auction window has closed.",
    });
  }
  throw err instanceof Error ? err : new Error(String(err));
}
