import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { queryMetaBlock } from "@riptide/solver-core";

import { isLocalAnvil } from "@riptide/contracts";

export type RedeploySubgraphResult = {
  subgraphUrl: string;
  indexedBlock: string;
};

function repoRoot(): string {
  return process.env.RIPTIDE_REPO_ROOT ?? path.resolve(process.cwd(), "../..");
}

/** Sync manifest → subgraph.yaml and redeploy to local Graph Node (Anvil only). */
export async function redeployLocalSubgraph(chainId: number): Promise<RedeploySubgraphResult> {
  if (!isLocalAnvil(chainId)) {
    throw new Error("redeploySubgraph is only available on local Anvil (chain 31337)");
  }

  const root = repoRoot();
  const manifestPath = path.join(root, `deployments/${chainId}.json`);

  execSync("node tools/subgraph/deploy-local.mjs", {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, DEPLOYMENT_MANIFEST: manifestPath },
  });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { subgraphUrl?: string };
  const subgraphUrl =
    manifest.subgraphUrl ?? `http://localhost:8000/subgraphs/name/riptide/riptide-anvil`;

  const meta = await queryMetaBlock(subgraphUrl);
  return { subgraphUrl, indexedBlock: String(meta.block.number) };
}
