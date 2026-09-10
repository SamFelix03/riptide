import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test("renders hero and persona links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("HeroExplainer")).toBeVisible();
    await expect(page.getByRole("link", { name: /Maker/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Taker/ })).toBeVisible();
  });
});
