#!/usr/bin/env node
/**
 * Explorer verification stub — no-ops when manifest has empty explorerUrl.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chainId = Number.parseInt(process.env.CHAIN_ID ?? "31337", 10);
const manifestPath = path.join(root, "deployments", `${chainId}.json");

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (!manifest.explorerUrl) {
  console.log("explorerUrl empty — explorer verification deferred (local Anvil profile).");
  process.exit(0);
}

console.log(`Explorer verification not implemented for ${manifest.explorerUrl}.`);
console.log("Run forge verify-contract for each address in the manifest.");
process.exit(0);
