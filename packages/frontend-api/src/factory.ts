import type { RiptideFrontendApi } from "./interface.js";
import type { FrontendApiConfig } from "./config.js";
import { loadFrontendApiConfig } from "./config.js";
import { createLiveFrontendApi } from "./live/index.js";
import { createMockFrontendApi } from "./mock/index.js";

export type CreateFrontendApiOpts = {
  mode: "mock" | "live";
  config?: Partial<FrontendApiConfig>;
};

export function createFrontendApi(opts: CreateFrontendApiOpts): RiptideFrontendApi {
  if (opts.mode === "mock") return createMockFrontendApi();
  return createLiveFrontendApi({ ...loadFrontendApiConfig(), ...opts.config });
}
