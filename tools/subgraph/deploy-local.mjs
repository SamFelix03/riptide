#!/usr/bin/env node
/**
 * Deploy subgraph to a local Graph Node (Path A — Anvil).
 * Requires: Docker graph-node running, Anvil on host:8545 with --host 0.0.0.0
 */
import { config as loadEnv } from "dotenv";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const subgraphDir = path.join(root, "subgraph");
loadEnv({ path: path.join(subgraphDir, ".env") });

const nodeUrl = process.env.GRAPH_NODE_URL ?? "http://localhost:8020";
const ipfsUrl = process.env.GRAPH_IPFS_URL ?? "http://localhost:5001";
const subgraphName = process.env.GRAPH_SUBGRAPH_NAME ?? "riptide/riptide-anvil";
const queryUrl =
  process.env.GRAPH_QUERY_URL ?? `http://localhost:8000/subgraphs/name/${subgraphName}`;
const manifestPath = process.env.DEPLOYMENT_MANIFEST ?? path.join(root, "deployments/31337.json");
const versionLabel = process.env.GRAPH_VERSION_LABEL ?? "v0.0.1";

function patchEnvFile(envPath, key, value) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(envPath, `${next.filter((l, i) => i < next.length - 1 || l !== "").join("\n")}\n`);
}

async function waitForSubgraph(maxAttempts = 60) {
  const queryUrl = `${nodeUrl.replace(":8020", ":8000")}/subgraphs/name/${subgraphName}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(queryUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ _meta { block { number } } }" }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.data?._meta?.block) return;
      }
    } catch {
      // still indexing
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Subgraph not queryable at ${queryUrl}. Check graph-node logs: pnpm subgraph:up`);
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", ...opts });
}

console.log(`Graph Node: ${nodeUrl}`);
console.log(`IPFS:       ${ipfsUrl}`);
console.log(`Subgraph:   ${subgraphName}`);

run("node tools/subgraph/sync-from-manifest.mjs", { cwd: root, env: { ...process.env, DEPLOYMENT_MANIFEST: manifestPath } });

try {
  const health = await fetch(nodeUrl, { method: "GET" });
  // Graph Node admin returns 405 on GET — that still means it's up.
  if (!health.ok && health.status !== 404 && health.status !== 405) throw new Error("bad status");
} catch (err) {
  if (err instanceof Error && err.message === "bad status") {
    console.error(`\nGraph Node at ${nodeUrl} returned unexpected status.`);
    process.exit(1);
  }
  console.error(`\nGraph Node is not running at ${nodeUrl}.`);
  console.error("Start it with:  pnpm subgraph:up");
  console.error("Anvil must use: anvil --host 0.0.0.0 --chain-id 31337 --code-size-limit 100000 --port 8545");
  process.exit(1);
}

process.chdir(subgraphDir);
run("pnpm run codegen");
run("pnpm run build");

try {
  run(`npx graph create --node ${nodeUrl} ${subgraphName}`);
} catch {
  console.log("Subgraph namespace already exists — continuing deploy.");
}

run(`npx graph deploy --node ${nodeUrl} --ipfs ${ipfsUrl} ${subgraphName} --version-label ${versionLabel}`);

console.log("\nWaiting for subgraph to become queryable...");
await waitForSubgraph();

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.subgraphUrl = queryUrl;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated ${path.relative(root, manifestPath)} → subgraphUrl`);
}

const envTargets = [
  path.join(root, "services/solver-api/.env"),
  path.join(root, "services/resolver-bot/.env"),
  path.join(subgraphDir, ".env"),
];
for (const envPath of envTargets) {
  patchEnvFile(envPath, "SUBGRAPH_URL", queryUrl);
  patchEnvFile(envPath, "GRAPH_QUERY_URL", queryUrl);
  console.log(`Updated ${path.relative(root, envPath)} → SUBGRAPH_URL`);
}

console.log(`\nSubgraph ready: ${queryUrl}`);
console.log("Test query:");
console.log(`  curl -X POST ${queryUrl} -H "content-type: application/json" -d "{\\"query\\":\\"{ _meta { block { number } } strategies { id strategyKey docked } }\\"}"`);
