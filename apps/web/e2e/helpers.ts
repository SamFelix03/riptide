import type { Page } from "@playwright/test";

/** Navigate a write page. Without an AppKit session the app asks to connect. */
export async function gotoGuarded(page: Page, path: string) {
  await page.goto(path);
}

export async function expectConnectPrompt(page: Page) {
  await page.getByText(/Connect your wallet/).waitFor({ timeout: 10_000 });
}
