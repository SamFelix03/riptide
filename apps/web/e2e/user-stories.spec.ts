import { test, expect } from "@playwright/test";

import { gotoGuarded, expectConnectPrompt } from "./helpers";

const connectStories = [
  { id: "M1", name: "make requires wallet", path: "/make" },
  { id: "T1", name: "swap requires wallet", path: "/swap" },
  { id: "R1", name: "resolve requires wallet", path: "/resolve" },
  { id: "P1", name: "positions requires wallet", path: "/positions" },
];

for (const story of connectStories) {
  test(`${story.id}: ${story.name}`, async ({ page }) => {
    await gotoGuarded(page, story.path);
    await expectConnectPrompt(page);
  });
}

test("Landing: hero explainer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/RIPTIDE internalizes LVR/)).toBeVisible();
  await expect(page.getByText("LiveProtocolStats")).toBeVisible();
});

test("Analyst A1: recapture headline", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByText("RecaptureHeadline").or(page.getByText("Recapture Dashboard"))).toBeVisible();
});

test("Analyst A4: honesty panel", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByTestId("honesty-badge").first()).toBeVisible();
});
