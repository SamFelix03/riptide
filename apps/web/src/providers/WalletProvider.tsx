"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppKit } from "@reown/appkit/react";
import { createPublicClient, http, type Address, type Hash, type Chain } from "viem";
import { useAccount, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";

import { defaultAppNetwork, viemChainFromNetwork, type AppNetwork } from "@/lib/chain";
import { BASE_SEPOLIA_CHAIN_ID } from "@riptide/contracts/networks";

type WalletState = {
  address: Address | null;
  chainId: number;
  isConnected: boolean;
  network: AppNetwork;
  connect: () => Promise<void>;
  disconnect: () => void;
  writeContract: (args: { address: Address; data: `0x${string}` }) => Promise<Hash>;
  waitForTransaction: (hash: Hash) => Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
  readContract: (args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<AppNetwork>(defaultAppNetwork);

  const { address: wagmiAddress, chainId: wagmiChainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { open } = useAppKit();

  const address = (wagmiAddress as Address | undefined) ?? null;
  const chainId = wagmiChainId ?? network.chainId;

  const viemChain: Chain = useMemo(() => viemChainFromNetwork(network), [network]);

  const publicClient = useMemo(
    () => createPublicClient({ chain: viemChain, transport: http(network.rpcUrl) }),
    [network.rpcUrl, viemChain],
  );

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: { chainId?: number; name?: string; rpcUrl?: string; explorerUrl?: string }) => {
        if (cfg?.chainId !== BASE_SEPOLIA_CHAIN_ID) return;
        setNetwork({
          chainId: BASE_SEPOLIA_CHAIN_ID,
          name: cfg.name ?? "Base Sepolia",
          rpcUrl: cfg.rpcUrl ?? defaultAppNetwork().rpcUrl,
          explorerUrl: cfg.explorerUrl ?? "",
        });
      })
      .catch(() => {
        /* keep Base Sepolia bootstrap */
      });
  }, []);

  const ensureChain = useCallback(async () => {
    if (wagmiChainId === network.chainId) return;
    await switchChainAsync({ chainId: network.chainId });
  }, [network.chainId, switchChainAsync, wagmiChainId]);

  const connect = useCallback(async () => {
    await open({ view: "Connect" });
  }, [open]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const writeContract = useCallback(
    async ({ address: to, data }: { address: Address; data: `0x${string}` }) => {
      if (!walletClient || !address) {
        throw new Error("No wallet connected");
      }
      await ensureChain();
      return walletClient.sendTransaction({
        account: address,
        to,
        data,
        chain: viemChain,
      });
    },
    [address, ensureChain, viemChain, walletClient],
  );

  const waitForTransaction = useCallback(
    async (hash: Hash) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { status: receipt.status, blockNumber: receipt.blockNumber };
    },
    [publicClient],
  );

  const readContract = useCallback(
    async ({
      address: contractAddress,
      abi,
      functionName,
      args = [],
    }: {
      address: Address;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }) => {
      return publicClient.readContract({
        address: contractAddress,
        abi: abi as never,
        functionName: functionName as never,
        args: args as never,
      });
    },
    [publicClient],
  );

  const value = useMemo(
    () => ({
      address,
      chainId,
      isConnected: Boolean(isConnected && address),
      network,
      connect,
      disconnect: handleDisconnect,
      writeContract,
      waitForTransaction,
      readContract,
    }),
    [address, chainId, connect, handleDisconnect, isConnected, network, readContract, waitForTransaction, writeContract],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
