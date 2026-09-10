#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseManifestFile } from "../dist/manifest.js";

const PACKAGE_ROOT = path.dirname(fileURLToPath(new URL(".", import.meta.url)));
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");

function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: validate-manifest <path/to/chainId.json>");
    return 1;
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(REPO_ROOT, fileArg);
  try {
    parseManifestFile(filePath);
    console.log(`Valid manifest: ${filePath}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

process.exit(main());
