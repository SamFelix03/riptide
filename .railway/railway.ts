import { defineRailway, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  // The RIPTIDE web app: a Next.js app inside a pnpm workspace. The build must compile
  // the workspace packages it depends on (@riptide/contracts, riptide-math,
  // strategy-sdk, solver-core, resolver-core, frontend-api) before Next builds, which
  // is exactly what `--filter "@riptide/web..."` does.
  const web = service("riptide-web", {
    build: 'pnpm install --frozen-lockfile && pnpm --filter "@riptide/web..." build',
    start: "pnpm --filter @riptide/web start",
    healthcheck: "/api/config",
    healthcheckTimeout: 120,
    variables: {
      // Base Sepolia. Contract addresses are never hardcoded — they are read at runtime
      // from deployments/84532.json, so RIPTIDE_REPO_ROOT must point at the repo root
      // inside the container.
      CHAIN_ID: "84532",
      RPC_URL: "https://sepolia.base.org",
      RIPTIDE_REPO_ROOT: "/app",
      NODE_ENV: "production",
      // contracts/out (Foundry artifacts) is not uploaded and Foundry is not installed
      // here; the generated ABIs are committed, so compile against those.
      RIPTIDE_SKIP_CODEGEN: "1",
      // "mock" is refused in production builds by apps/web/src/app/api/riptide/route.ts.
      NEXT_PUBLIC_PROTOCOL_MODE: "live",
      // Shown in the wallet-connect modal as the requesting app.
      NEXT_PUBLIC_APP_URL: "https://riptide-web-production-77f7.up.railway.app",
      // Reown/WalletConnect project id. Public (it ships in the browser bundle) but kept
      // out of the repo — set it on the service and IaC will leave it alone.
      NEXT_PUBLIC_PROJECT_ID: preserve(),
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: preserve(),
    },
  });

  return project("riptide", { resources: [web] });
});
