import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deploymentManifestSchema, type DeploymentManifest } from "./manifest.schema.js";

const PACKAGE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");

function resolveRepoRoot(): string {
  if (process.env.RIPTIDE_REPO_ROOT) {
    return path.resolve(process.env.RIPTIDE_REPO_ROOT);
  }
  const fromCwd = path.resolve(process.cwd(), "../../deployments");
  if (fs.existsSync(fromCwd)) {
    return path.resolve(process.cwd(), "../..");
  }
  return REPO_ROOT;
}

export function manifestPath(chainId: number): string {
  return path.join(resolveRepoRoot(), "deployments", `${chainId}.json`);
}

export function loadManifest(chainId: number): DeploymentManifest {
  const filePath = manifestPath(chainId);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  const manifest = deploymentManifestSchema.parse(raw);
  if (manifest.chainId !== chainId) {
    throw new Error(`Manifest chainId ${manifest.chainId} does not match requested ${chainId}`);
  }
  return manifest;
}

export function saveManifest(manifest: DeploymentManifest): void {
  const filePath = manifestPath(manifest.chainId);
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function parseManifestFile(filePath: string): DeploymentManifest {
  const chainId = Number.parseInt(path.basename(filePath, ".json"), 10);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid manifest filename: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  const manifest = deploymentManifestSchema.parse(raw);
  if (manifest.chainId !== chainId) {
    throw new Error(`Manifest chainId ${manifest.chainId} does not match filename ${chainId}`);
  }
  return manifest;
}
