import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { createMockFrontendApi } from "@riptide/frontend-api/mock";

class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

vi.stubGlobal("IntersectionObserver", MockObserver);
vi.stubGlobal("ResizeObserver", MockObserver);

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

vi.mock("@reown/appkit/react", () => ({
  createAppKit: vi.fn(),
  useAppKit: () => ({ open: vi.fn(), close: vi.fn() }),
  useAppKitAccount: () => ({ address: undefined, isConnected: false }),
  useAppKitNetwork: () => ({ chainId: undefined, caipNetwork: undefined, switchNetwork: vi.fn() }),
}));

vi.mock("@/lib/appkit", () => ({
  projectId: "test",
  networks: [{}],
  metadata: { name: "RIPTIDE", description: "", url: "http://localhost:3000", icons: [] },
  wagmiAdapter: { wagmiConfig: {} },
}));

vi.mock("wagmi", async () => {
  const React = await import("react");
  return {
    WagmiProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    cookieToInitialState: () => undefined,
    useAccount: () => ({ address: undefined, chainId: undefined, isConnected: false }),
    useDisconnect: () => ({ disconnect: vi.fn() }),
    useWalletClient: () => ({ data: undefined }),
    useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

const mockApi = createMockFrontendApi();

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/api/riptide/simulate")) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }
  if (url.includes("/api/riptide")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: keyof typeof mockApi; args: unknown[] };
    const fn = mockApi[body.method] as (...a: unknown[]) => Promise<unknown>;
    const result = await fn(...body.args);
    return new Response(JSON.stringify({ result }), { status: 200 });
  }
  if (url.includes("/api/config")) {
    return new Response(JSON.stringify({
      chainId: 84532,
      name: "base-sepolia",
      rpcUrl: "https://sepolia.base.org",
      explorerUrl: "https://sepolia.basescan.org",
      aqua: "0x0000000000000000000000000000000000000000",
    }), { status: 200 });
  }
  return originalFetch(input, init);
};
