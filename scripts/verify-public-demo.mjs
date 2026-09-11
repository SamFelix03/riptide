#!/usr/bin/env node

/**
 * verify-public-demo.mjs — RIPTIDE public demo release gate.
 *
 * Public-demo release gate: validates the entire public topology (app, solver
 * API, subgraph, RPC) in one script. Runs manually or in CI before any release.
 *
 * Usage:
 *   PUBLIC_APP_URL=https://... \
 *   PUBLIC_API_URL=https://... \
 *   PUBLIC_SUBGRAPH_URL=https://... \
 *   PUBLIC_RPC_URL=https://... \
 *   PUBLIC_MANIFEST_URL=https://... \
 *   node scripts/verify-public-demo.mjs
 */

const {
  PUBLIC_APP_URL,
  PUBLIC_API_URL,
  PUBLIC_SUBGRAPH_URL,
  PUBLIC_RPC_URL,
  PUBLIC_MANIFEST_URL,
} = process.env;

const required = { PUBLIC_APP_URL, PUBLIC_API_URL, PUBLIC_SUBGRAPH_URL, PUBLIC_RPC_URL, PUBLIC_MANIFEST_URL };
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✕ ${name}: ${err.message}`);
    failed++;
  }
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

console.log("\n  RIPTIDE Public Demo Verification\n");

// 1. App serves HTML with RIPTIDE branding
await check("App serves HTML with RIPTIDE", async () => {
  const res = await fetch(PUBLIC_APP_URL);
  if (!res.ok) throw new Error(`App returned ${res.status}`);
  const html = await res.text();
  if (!html.includes("RIPTIDE") && !html.includes("riptide"))
    throw new Error("HTML does not contain RIPTIDE branding");
});

// 2. Manifest is public and valid
await check("Manifest is public and contains required fields", async () => {
  const manifest = await fetchJson(PUBLIC_MANIFEST_URL);
  for (const field of ["batchExecutor", "demoTokens", "seededStrategies"]) {
    if (!(field in manifest)) throw new Error(`Missing field: ${field}`);
  }
  if (!manifest.seededStrategies?.length) throw new Error("No seeded strategies");
  if (manifest.seededStrategies.length < 3)
    throw new Error(`Only ${manifest.seededStrategies.length} seeded strategies (need ≥3)`);
});

// 3. Solver API health
await check("Solver API health endpoint", async () => {
  const health = await fetchJson(`${PUBLIC_API_URL}/v1/health`);
  if (health.status !== "ok" && !health.healthy)
    throw new Error(`Solver unhealthy: ${JSON.stringify(health)}`);
});

// 4. Solver API bootstrap
await check("Solver API bootstrap returns markets", async () => {
  const body = await fetchJson(`${PUBLIC_API_URL}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method: "listMarkets", args: [] }),
  });
  if (!body.result?.length) throw new Error("No markets from API");
});

// 5. Subgraph responds with active strategies
await check("Subgraph has ≥3 active strategies", async () => {
  const query = `{ strategies(where: { active: true }) { id maker } }`;
  const body = await fetchJson(PUBLIC_SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const strategies = body.data?.strategies ?? [];
  if (strategies.length < 3)
    throw new Error(`Only ${strategies.length} active strategies (need ≥3)`);
});

// 6. RPC responds to eth_blockNumber
await check("RPC responds to eth_blockNumber", async () => {
  const body = await fetchJson(PUBLIC_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
  });
  if (!body.result) throw new Error("No block number");
});

// 7. No localhost/private URLs in manifest
await check("Manifest URLs are public (no localhost)", async () => {
  const manifest = await fetchJson(PUBLIC_MANIFEST_URL);
  const json = JSON.stringify(manifest);
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(json))
    throw new Error("Manifest contains private/localhost URLs");
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
