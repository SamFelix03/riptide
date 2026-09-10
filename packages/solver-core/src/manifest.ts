import type { DeploymentManifest } from "@riptide/contracts";
import { loadManifest } from "@riptide/contracts";

export function loadSolverManifest(chainId: number): DeploymentManifest {
  return loadManifest(chainId);
}
