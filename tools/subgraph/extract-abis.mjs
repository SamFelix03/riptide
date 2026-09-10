#!/usr/bin/env node
/** Copy Forge ABI JSON into subgraph/abis for graph codegen. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "contracts/out");
const destDir = path.join(root, "subgraph/abis");

const artifacts = {
  Aqua: ["Aqua.sol/Aqua.json", "IAqua.sol/IAqua.json"],
  RiptideSwapVMRouter: ["RiptideSwapVMRouter.sol/RiptideSwapVMRouter.json"],
  RiptideLvrFeeProvider: ["RiptideLvrFeeProvider.sol/RiptideLvrFeeProvider.json"],
  RiptideBatchExecutor: ["RiptideBatchExecutor.sol/RiptideBatchExecutor.json"],
  RiptideRebalanceRouter: ["RiptideRebalanceRouter.sol/RiptideRebalanceRouter.json"],
};

function findArtifact(relatives) {
  for (const rel of relatives) {
    const candidate = path.join(outDir, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Forge artifact not found for ${relatives.join(" | ")}. Run forge build in contracts/.`);
}

fs.mkdirSync(destDir, { recursive: true });

for (const [name, relatives] of Object.entries(artifacts)) {
  const artifactPath = findArtifact(relatives);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  if (!Array.isArray(artifact.abi)) {
    throw new Error(`No abi array in ${artifactPath}`);
  }
  const dest = path.join(destDir, `${name}.json`);
  fs.writeFileSync(dest, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, dest)} (${artifact.abi.length} items)`);
}
