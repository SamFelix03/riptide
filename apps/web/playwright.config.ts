import { defineConfig } from "@playwright/test";
import { BASE_SEPOLIA_CHAIN_ID } from "@riptide/contracts/networks";

process.env.CHAIN_ID ??= String(BASE_SEPOLIA_CHAIN_ID);

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: {
      ...process.env,
      CHAIN_ID: String(BASE_SEPOLIA_CHAIN_ID),
    },
  },
});
