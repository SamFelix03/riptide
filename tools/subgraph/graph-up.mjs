#!/usr/bin/env node
/** Start local Graph Node stack (postgres + ipfs + graph-node). */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const composeFile = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  "subgraph/docker/docker-compose.yml",
);

console.log("Starting local Graph Node (Docker)...");
console.log("Ensure Anvil is running with: --host 0.0.0.0 --chain-id 31337 --port 8545\n");

execSync(`docker compose -f "${composeFile}" up -d`, { stdio: "inherit" });

console.log("\nGraph Node endpoints:");
console.log("  GraphQL:  http://localhost:8000");
console.log("  Admin:    http://localhost:8020");
console.log("  IPFS:     http://localhost:5001");
console.log("\nDeploy subgraph:  pnpm subgraph:deploy-local");
