#!/usr/bin/env node
/**
 * Re-run Provenance fork test against official mainnet Aqua.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rpcUrl = process.env.RPC_URL_TARGET ?? "https://ethereum.publicnode.com";
const reportPath = path.join(root, "deployments/provenance-report.json");

console.log(`Running Provenance fork test via ${rpcUrl}...`);

try {
  execSync(
    `forge test --match-contract Provenance -vv`,
    {
      cwd: path.join(root, "contracts"),
      stdio: "inherit",
      env: { ...process.env, RPC_URL_TARGET: rpcUrl },
    },
  );
  const report = {
    status: "passed",
    verifiedAt: new Date().toISOString(),
    rpcUrl,
    note: "Official mainnet Aqua ship + safeBalances smoke test",
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report written: ${reportPath}`);
} catch {
  process.exit(1);
}
