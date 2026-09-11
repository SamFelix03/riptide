#!/usr/bin/env node
/**
 * Playwright global setup: ensure Anvil stack is reachable.
 * Set SKIP_E2E_STACK=1 to skip (mock-only E2E).
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default async function globalSetup() {
  if (process.env.SKIP_E2E_STACK === "1") {
    console.log("SKIP_E2E_STACK=1 — skipping stack setup");
    return;
  }

  const rpcUrl = "http://127.0.0.1:8545";
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const body = await res.json();
    if (body.result) {
      console.log("Anvil already running");
      return;
    }
  } catch {
    // start anvil
  }

  console.log("Starting Anvil for E2E…");
  const anvil = spawn("anvil", ["--host", "0.0.0.0", "--chain-id", "31337", "--code-size-limit", "100000", "--port", "8545"], {
    cwd: root,
    stdio: "ignore",
    detached: true,
  });
  anvil.unref();
  fs.writeFileSync(path.join(root, ".e2e-anvil.pid"), String(anvil.pid));

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) break;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  execSync("node tools/demo/reset.mjs", { cwd: root, stdio: "inherit", env: { ...process.env, RPC_URL: rpcUrl } });
}
