export type * from "./types.js";
export type { RiptideFrontendApi } from "./interface.js";
export {
  decodeRiptideError,
  RiptideFrontendApiError,
  throwIfRiptideError,
  type RiptideErrorCode,
  type RiptideFrontendError,
} from "./errors.js";
export { createFrontendApi, type CreateFrontendApiOpts } from "./factory.js";
export { createMockFrontendApi } from "./mock/index.js";
export { createLiveFrontendApi } from "./live/index.js";
export { loadFrontendApiConfig, type FrontendApiConfig } from "./config.js";
export { simulateTxPlan, type SimulationResult } from "./simulate.js";
export { normalizeStrategy, serializeForJson } from "./json.js";

import { loadManifest } from "@riptide/contracts";
import { getRiptideLens } from "@riptide/contracts";
import type { PublicClient } from "viem";
import type { DeploymentManifest } from "@riptide/contracts";

/** @deprecated Use createFrontendApi({ mode: 'live' }) */
export function loadFrontendManifest(chainId: number): DeploymentManifest {
  return loadManifest(chainId);
}

/** @deprecated Prefer LiveFrontendApi.getStrategy */
export function getLensClient(client: PublicClient, manifest: DeploymentManifest) {
  return getRiptideLens(client, manifest.lens);
}
