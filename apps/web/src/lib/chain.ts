import type { Chain } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_EXPLORER,
  BASE_SEPOLIA_PUBLIC_RPC,
} from "@riptide/contracts/networks";

export { BASE_SEPOLIA_CHAIN_ID } from "@riptide/contracts/networks";

export type AppNetwork = {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
};

/** The product UI is Base Sepolia only. Addresses still come from `/api/config`. */
export function defaultAppNetwork(): AppNetwork {
  return {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    name: "Base Sepolia",
    rpcUrl: BASE_SEPOLIA_PUBLIC_RPC,
    explorerUrl: BASE_SEPOLIA_EXPLORER,
  };
}

export function viemChainFromNetwork(network: AppNetwork): Chain {
  return {
    id: network.chainId,
    name: network.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [network.rpcUrl] } },
    ...(network.explorerUrl
      ? { blockExplorers: { default: { name: "Explorer", url: network.explorerUrl } } }
      : {}),
  };
}
