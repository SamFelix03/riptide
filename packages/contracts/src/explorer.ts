import type { DeploymentManifest } from "./manifest.schema.js";

export function txUrl(manifest: DeploymentManifest, hash: string): string | null {
  if (!manifest.explorerUrl) return null;
  const base = manifest.explorerUrl.replace(/\/$/, "");
  return `${base}/tx/${hash}`;
}

export function addressUrl(manifest: DeploymentManifest, address: string): string | null {
  if (!manifest.explorerUrl) return null;
  const base = manifest.explorerUrl.replace(/\/$/, "");
  return `${base}/address/${address}`;
}
