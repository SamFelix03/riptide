import { test, expect } from "@playwright/test";

import { gotoGuarded, expectConnectPrompt } from "./helpers";

test.describe("Write pages require a connected wallet", () => {
  test("maker publish page asks to connect", async ({ page }) => {
    await gotoGuarded(page, "/make");
    await expectConnectPrompt(page);
  });

  test("taker swap page asks to connect", async ({ page }) => {
    await gotoGuarded(page, "/swap");
    await expectConnectPrompt(page);
  });

  test("resolver page asks to connect", async ({ page }) => {
    await gotoGuarded(page, "/resolve");
    await expectConnectPrompt(page);
  });

  test("positions page asks to connect", async ({ page }) => {
    await gotoGuarded(page, "/positions");
    await expectConnectPrompt(page);
  });
});
