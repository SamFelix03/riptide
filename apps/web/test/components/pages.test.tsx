import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LandingPage from "@/app/page";
import AnalyticsPage from "@/app/analytics/page";
import { FormField } from "@/components/shared/FormField";
import { AppProviders } from "@/providers/AppProviders";

function renderWithProviders(ui: React.ReactElement) {
  return render(<AppProviders>{ui}</AppProviders>);
}

afterEach(() => {
  cleanup();
});

describe("Landing page", () => {
  it("renders hero and stats", async () => {
    renderWithProviders(<LandingPage />);
    expect(await screen.findByText(/RIPTIDE internalizes LVR/)).toBeInTheDocument();
    expect(await screen.findByTestId("live-protocol-stats")).toBeInTheDocument();
    expect(await screen.findByTestId("landing-story")).toBeInTheDocument();
    expect(await screen.findByText(/Pools bleed to whoever is fastest/)).toBeInTheDocument();
    expect(await screen.findByTestId("landing-math")).toBeInTheDocument();
  });
});

describe("Analytics page", () => {
  it("shows honesty badges", async () => {
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByTestId("honesty-panel")).toBeInTheDocument();
    expect((await screen.findAllByTestId("honesty-badge")).length).toBeGreaterThan(0);
  });

  it("surfaces atomic multi-fill routes", async () => {
    renderWithProviders(<AnalyticsPage />);
    // RiptideBatchExecutor.execute settlements are indexed as Route entities; before this
    // they were indexed but never shown anywhere in the app.
    expect(await screen.findByTestId("atomic-routes")).toBeInTheDocument();
    expect(await screen.findByText(/3 makers/)).toBeInTheDocument();
  });
});

describe("NetworkGuard", () => {
  it("prompts wallet connect on protected pages", async () => {
    const Swap = (await import("@/app/swap/page")).default;
    renderWithProviders(<Swap />);
    expect(await screen.findByText(/Connect your wallet/)).toBeInTheDocument();
  });
});

describe("FormField", () => {
  it("renders a single-line label, suffix, and hint", () => {
    render(
      <FormField label="Amount" suffix="RBASE" hint="human-1.00">
        <input aria-label="Amount" defaultValue="1" />
      </FormField>,
    );
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("RBASE")).toBeInTheDocument();
    expect(screen.getByText("human-1.00")).toBeInTheDocument();
  });
});
