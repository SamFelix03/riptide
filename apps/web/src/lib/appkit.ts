import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { baseSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "wagmi";

import { BASE_SEPOLIA_PUBLIC_RPC } from "@riptide/contracts/networks";

export const projectId =
  process.env.NEXT_PUBLIC_PROJECT_ID ||
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "8c96fe0e9036ef1d39966c209288f85d";

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [baseSepolia];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }) as never,
  customRpcUrls: {
    "eip155:84532": [{ url: BASE_SEPOLIA_PUBLIC_RPC }],
  },
});

export const metadata = {
  name: "RIPTIDE",
  description: "Internalize LVR with volatility-indexed fees and resolver rebalancing auctions",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  icons: [] as string[],
};
