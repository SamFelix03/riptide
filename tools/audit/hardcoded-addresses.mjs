#!/usr/bin/env node
/**
 * Fail if contract addresses appear outside deployments/ and allowlisted paths.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chainId = Number.parseInt(process.env.CHAIN_ID ?? "31337", 10);
const manifestPath = path.join(root, "deployments", `${chainId}.json`);

const SCAN_DIRS = ["packages", "services", "apps", "subgraph/src", "tools"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "generated", "abis"]);
const ALLOWLIST_PATHS = [
  /subgraph\/tests\//,
  /subgraph\/src\/helpers\.ts$/,
  /contracts\/test\//,
  /contracts\/lib\//,
  /refs\//,
  /deployments\//,
  /PROVENANCE\.md$/,
  /ENV\.md$/,
  /tools\/audit\//,
  /tools\/demo\//,
  /tools\/subgraph\/sync-from-manifest\.mjs$/,
  /packages\/frontend-api\/src\/mock\//,
  /packages\/.*\/test\//,
  /services\/.*\/test\//,
  /services\/liquidity-mcp\/src\/dex-subgraph\//,
  /apps\/web\/src\/app\/resolve\/page\.tsx$/,
  /apps\/web\/src\/app\/make\/page\.tsx$/,
  /apps\/web\/test\//,
  /packages\/strategy-sdk\/src\/codec\.ts$/,
  /packages\/solver-core\/src\/encode\.ts$/,
  /packages\/solver-core\/src\/subgraph\/client\.ts$/,
];

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const ADDR_RE = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g;

function norm(addr) {
  return addr.toLowerCase();
}

function loadAllowlist() {
  const allowed = new Set();
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const walk = (obj) => {
      if (typeof obj === "string" && /^0x[a-fA-F0-9]{40}$/.test(obj)) allowed.add(norm(obj));
      else if (obj && typeof obj === "object") Object.values(obj).forEach(walk);
    };
    walk(manifest);
  }
  allowed.add("0x1111113ccf1426a8e30e2bf5e005d929bf6a90a");
  allowed.add("0x111111338c5091e8440b67b168bae16a668ac0de");
  // Anvil demo keys from ENV.md
  allowed.add("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
  allowed.add("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  allowed.add("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  allowed.add("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  allowed.add("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  allowed.add("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
  allowed.add("0x15d34aaf54267db7d7c367839aaf71a00a2c6a65");
  // Uniswap reference pool (MCP DEX comparison only)
  allowed.add("0x88e6a0c2ddd26feeb64f039a2200f558aeb0dbed");
  allowed.add("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
  allowed.add("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  // Market hash constant in subgraph helpers
  allowed.add("0x5fda11de1a2ed0b5d3c2e74823b76e83e05972744e3f0b5695ce173a4fd62251");
  return allowed;
}

function isAllowlisted(relPath) {
  return ALLOWLIST_PATHS.some((re) => re.test(relPath.replace(/\\/g, "/")));
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|js|mjs|sol|yaml|yml|json|md)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const allowed = loadAllowlist();
const violations = [];

for (const scanDir of SCAN_DIRS) {
  const abs = path.join(root, scanDir);
  for (const file of walk(abs)) {
    const rel = path.relative(root, file);
    if (isAllowlisted(rel)) continue;
    const content = fs.readFileSync(file, "utf8");
    const matches = content.match(ADDR_RE) ?? [];
    for (const m of matches) {
      if (norm(m) === ZERO_ADDR) continue;
      if (!allowed.has(norm(m))) {
        violations.push({ file: rel, address: m });
      }
    }
  }
}

for (const envFile of walk(root).filter((f) => f.endsWith(".env") && !f.includes("node_modules"))) {
  violations.push({ file: path.relative(root, envFile), address: "(tracked .env file — must be gitignored)" });
}

if (violations.length) {
  console.error("Hardcoded address audit failed:");
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.address}`);
  }
  process.exit(1);
}

console.log(`Address audit passed (${allowed.size} manifest addresses allowlisted).`);
