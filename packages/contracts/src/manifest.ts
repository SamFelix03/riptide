import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deploymentManifestSchema, type DeploymentManifest } from "./manifest.schema.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Nearest ancestor of `from` that contains a `deployments` directory, or null. */
function findRepoRoot(from: string): string | null {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, "deployments"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Walk up rather than counting directories. This module is imported from source under
 * vitest (`packages/contracts/src`) and from the build under node (`packages/contracts/dist`),
 * and consumers run it from the repo root, from a service directory and from `contracts/` —
 * a fixed number of `..` hops is wrong for at least one of those every time.
 */
function resolveRepoRoot(): string {
  if (process.env.RIPTIDE_REPO_ROOT) {
    return path.resolve(process.env.RIPTIDE_REPO_ROOT);
  }
  return findRepoRoot(process.cwd()) ?? findRepoRoot(MODULE_DIR) ?? path.resolve(MODULE_DIR, "../..");
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
