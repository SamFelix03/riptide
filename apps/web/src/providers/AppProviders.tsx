"use client";

import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";

import { metadata, networks, projectId, wagmiAdapter } from "@/lib/appkit";
import { FrontendApiProvider } from "./FrontendApiProvider";
import { RiptideThemeProvider } from "./RiptideThemeProvider";
import { WalletProvider } from "./WalletProvider";
import { ToastProvider } from "@/components/shared/TxToast";

const queryClient = new QueryClient();

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  defaultNetwork: networks[0],
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#f4f1e8",
    "--w3m-border-radius-master": "2px",
    "--w3m-font-family": "var(--font-plex), ui-sans-serif, system-ui, sans-serif",
  },
  features: {
    analytics: true,
    email: false,
    socials: false,
  },
  enableInjected: true,
  enableEIP6963: true,
});

export function AppProviders({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as unknown as Config, cookies ?? null);

  return (
    <RiptideThemeProvider>
      <WagmiProvider config={wagmiAdapter.wagmiConfig as unknown as Config} initialState={initialState}>
        <QueryClientProvider client={queryClient}>
          <WalletProvider>
            <FrontendApiProvider>
              <ToastProvider>{children}</ToastProvider>
            </FrontendApiProvider>
          </WalletProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </RiptideThemeProvider>
  );
}
