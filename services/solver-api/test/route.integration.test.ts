import { createPublicClient, createWalletClient, decodeFunctionData, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";

import { ANVIL_CHAIN_ID, ANVIL_RPC_URL, getRiptideDemoToken, loadManifest, riptideBatchExecutorAbi } from "@riptide/contracts";

import { createApp } from "../src/server.js";
import type { SolverConfig } from "../src/config.js";

const RPC_URL = process.env.RPC_URL ?? ANVIL_RPC_URL;
const TAKER_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as const;
const HAS_RPC = process.env.RPC_URL !== undefined;

function solverConfig(): SolverConfig {
  return { rpcUrl: RPC_URL, port: 8081, chainId: ANVIL_CHAIN_ID, maxShortlist: 8 };
}

async function assertChainReady(app: ReturnType<typeof createApp>): Promise<void> {
  const res = await app.request("/v1/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ market: "RBASE-RQUOTE", kind: "ExactInput", amount: "1000000000000000000" }),
  });
  expect(res.status, await res.text()).toBe(200);
}

async function fundTaker(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  quoteToken: `0x${string}`,
  taker: `0x${string}`,
  batchExecutor: `0x${string}`,
) {
  const demo = getRiptideDemoToken(publicClient, quoteToken);
  await demo.write.faucet([10_000_000_000_000_000_000_000n], { account: taker, chain: walletClient.chain });
  await demo.write.approve([batchExecutor, 2n ** 256n - 1n], { account: taker, chain: walletClient.chain });
}

describe.skipIf(!HAS_RPC)("route integration", () => {
  it("POST /v1/route exact-in executes on BatchExecutor", async () => {
    const app = createApp(solverConfig());
    const manifest = loadManifest(31337);
    const account = privateKeyToAccount(TAKER_KEY);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account });

    await assertChainReady(app);
    await fundTaker(walletClient, publicClient, manifest.demoTokens.quote, account.address, manifest.batchExecutor);

    const res = await app.request("/v1/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        market: "RBASE-RQUOTE",
        kind: "ExactInput",
        amount: "1000000000000000000",
        payer: account.address,
        recipient: account.address,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { calldata: `0x${string}`; to: `0x${string}` };

    const hash = await walletClient.sendTransaction({
      to: body.to,
      data: body.calldata,
      account,
      chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  });

  it("POST /v1/route exact-out executes on BatchExecutor", async () => {
    const app = createApp(solverConfig());
    const manifest = loadManifest(31337);
    const account = privateKeyToAccount(TAKER_KEY);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account });

    await assertChainReady(app);
    await fundTaker(walletClient, publicClient, manifest.demoTokens.quote, account.address, manifest.batchExecutor);

    const res = await app.request("/v1/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        market: "RBASE-RQUOTE",
        kind: "ExactOutput",
        amount: "100000000000000000",
        payer: account.address,
        recipient: account.address,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { calldata: `0x${string}`; to: `0x${string}` };

    const hash = await walletClient.sendTransaction({
      to: body.to,
      data: body.calldata,
      account,
      chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  });

  it("multi-strategy split uses more than one strategy", async () => {
    const app = createApp(solverConfig());
    const manifest = loadManifest(31337);
    const account = privateKeyToAccount(TAKER_KEY);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account });

    await assertChainReady(app);
    await fundTaker(walletClient, publicClient, manifest.demoTokens.quote, account.address, manifest.batchExecutor);

    const res = await app.request("/v1/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        market: "RBASE-RQUOTE",
        kind: "ExactInput",
        amount: "5000000000000000000",
        payer: account.address,
        recipient: account.address,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fills: Array<{ candidateId: string }> };
    const ids = new Set(body.fills.map((f) => f.candidateId));
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });
});

describe.skipIf(!HAS_RPC)("adversarial stale version", () => {
  it("tampered expectedVersion reverts on simulate", async () => {
    const app = createApp(solverConfig());
    await assertChainReady(app);
    const manifest = loadManifest(31337);
    const account = privateKeyToAccount(TAKER_KEY);
    const chain = { ...foundry, id: 31337 };
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account });

    await fundTaker(walletClient, publicClient, manifest.demoTokens.quote, account.address, manifest.batchExecutor);

    const res = await app.request("/v1/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        market: "RBASE-RQUOTE",
        kind: "ExactInput",
        amount: "1000000000000000000",
        payer: account.address,
        recipient: account.address,
      }),
    });
    const routeJson = (await res.json()) as {
      calldata: `0x${string}`;
      to: `0x${string}`;
      fills: Array<{ expectedVersion: string }>;
    };

    const decoded = decodeFunctionData({
      abi: riptideBatchExecutorAbi,
      data: routeJson.calldata,
    });
    const route = decoded.args[0] as {
      fills: Array<{ expectedVersion: bigint }>;
    };
    const staleCalldata = encodeFunctionData({
      abi: riptideBatchExecutorAbi,
      functionName: "execute",
      args: [
        {
          ...decoded.args[0],
          fills: route.fills.map((fill, i) =>
            i === 0 ? { ...fill, expectedVersion: 99n } : fill,
          ),
        },
      ],
    });

    await expect(
      publicClient.call({
        to: routeJson.to,
        data: staleCalldata,
        account: account.address,
      }),
    ).rejects.toThrow();
  });
});
