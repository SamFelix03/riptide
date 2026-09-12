import { createPublicClient, encodeAbiParameters, encodeFunctionData, http, keccak256, toHex } from "viem";
import { foundry } from "viem/chains";
import type { Strategy } from "@riptide/strategy-sdk";
import { marketId } from "@riptide/strategy-sdk";

import { evaluate } from "@riptide/resolver-core";
import {
  ANVIL_CHAIN_ID,
  getRiptideLens,
  getRiptideLvrFeeProvider,
  riptideDemoTokenAbi,
  getRiptideQuoter,
  getRiptideRebalanceRouter,
  getRiptideSwapVMRouter,
  loadManifest,
} from "@riptide/contracts";
import {
  DEMO_MARKET,
  QuoteKind as SolverQuoteKind,
  SWAP_ORDER_PROGRAM_DEADLINE,
  aggregateLimitForKind,
  assertChainSeeded,
  attachExpectedVersions,
  buildBatchRoute,
  buildStrategyPreset,
  createDiscoveryProvider,
  demoResolverAddress,
  encodeExecuteCalldata,
  encodeOrderBytes,
  isInactiveAquaStrategyError,
  isStrategyNotActiveError,
  optimize,
  queryLatestControllerStates,
  queryMetaBlock,
  queryProtocolStats,
  queryRecentFills,
  queryRecentRebalances,
  queryResolvers,
  queryRecentRoutes,
  queryRecaptureByMarket,
  queryStrategyCumulativeRecapture,
  queryTotalPaidToResolvers,
  resolveFeedAddress,
  scanProtocolFromRpc,
  strategyRecaptureFromRpc,
  strategyToContractTuple,
} from "@riptide/solver-core";

import type { RiptideFrontendApi } from "../interface.js";
import type {
  EventFeedFilter,
  Freshness,
  MarketId,
  QuoteKind,
  RecaptureStatsScope,
  RouteLimits,
} from "../types.js";
import type { FrontendApiConfig } from "../config.js";
import { scanOpenAuctions } from "./auctions.js";
import {
  buildDockTxPlan,
  buildSettleCalldata,
  buildShipTxPlan,
  buildSkewOracleTxPlan,
  DEMO_ORACLE_SKEW_ANSWER,
} from "./encode.js";
import { restoreDemoStrategiesLive, openDemoAuctionsLive } from "./restoreDemo.js";
import { redeployLocalSubgraph } from "./redeploySubgraph.js";
import { RiptideFrontendApiError, throwIfRiptideError } from "../errors.js";
import { normalizeStrategy } from "../json.js";

const WAD = 1_000_000_000_000_000_000n;
const MAX_UINT256 = 2n ** 256n - 1n;

/** ExactOutput rebalance: max quote in = stale baseline + surplus, with on-chain slippage headroom. */
function rebalanceMaxInWad(surplusWad: bigint, staleInWad: bigint): bigint {
  const amountInWad = surplusWad + staleInWad;
  return amountInWad === 0n ? 0n : (amountInWad * 10001n) / 10000n;
}

const staleBaselineInAbi = [
  {
    type: "function",
    name: "staleBaselineIn",
    inputs: [
      { name: "outWad", type: "uint256" },
      { name: "reserveInWad", type: "uint128" },
      { name: "reserveOutWad", type: "uint128" },
      { name: "kind", type: "uint8" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "pure",
  },
] as const;

function runtimeStrategyKey(maker: `0x${string}`, salt: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [maker, salt]));
}

function effPrice(amountIn: bigint, amountOut: bigint): string {
  if (amountIn === 0n) return "0";
  return ((amountOut * WAD) / amountIn).toString();
}

export class LiveFrontendApi implements RiptideFrontendApi {
  private config: FrontendApiConfig;
  private readonly client;

  constructor(config: FrontendApiConfig) {
    this.config = config;
    this.client = createPublicClient({
      chain: { ...foundry, id: config.chainId },
      transport: http(config.rpcUrl),
    });
  }

  private manifest() {
    return loadManifest(this.config.chainId);
  }

  private async resolveStrategy(maker: `0x${string}`, strategy: Strategy | `0x${string}`): Promise<Strategy> {
    if (typeof strategy === "string") {
      return this.getStrategyPreset(maker, strategy);
    }
    return normalizeStrategy(strategy);
  }

  async listMarkets() {
    const manifest = this.manifest();
    const id = DEMO_MARKET;
    return [
      {
        id,
        baseToken: manifest.demoTokens.base,
        quoteToken: manifest.demoTokens.quote,
        baseSymbol: "RBASE",
        quoteSymbol: "RQUOTE",
        marketHash: marketId(manifest.demoTokens.base, manifest.demoTokens.quote),
      },
    ];
  }

  async listStrategies(market: MarketId) {
    if (market !== DEMO_MARKET) return [];
    const manifest = this.manifest();
    const discovery = createDiscoveryProvider({
      manifest,
      client: this.client,
      subgraphUrl: this.config.subgraphUrl,
      feedAddress: this.config.chainlinkFeed,
    });
    const feed = await resolveFeedAddress(manifest, {
      envFeed: this.config.chainlinkFeed,
      client: this.client,
    });

    try {
      const { candidates } = await discovery.listCandidates(market);
      if (candidates.length > 0) {
        return candidates.map((c) => ({
          id: c.id,
          strategyKey: c.strategyKey,
          strategyHash: c.strategyKey,
          orderHash: c.orderHash,
          maker: c.strategy.maker,
          market,
          reserveBaseWad: c.reserveBaseWad.toString(),
          reserveQuoteWad: c.reserveQuoteWad.toString(),
          feeBps: c.feeBps,
          sigmaWad: c.sigmaWad.toString(),
          active: true,
          version: c.swapVersion.toString(),
        }));
      }
    } catch {
      // Fall through — show manifest strategies as inactive.
    }

    return manifest.seededStrategies.map((seeded) => {
      const strategy = buildStrategyPreset(manifest, seeded, feed);
      return {
        id: seeded.id,
        strategyKey: seeded.strategyKey as `0x${string}`,
        strategyHash: seeded.strategyKey as `0x${string}`,
        orderHash: seeded.orderHash as `0x${string}`,
        maker: seeded.maker as `0x${string}`,
        market,
        reserveBaseWad: strategy.reserveBaseWad.toString(),
        reserveQuoteWad: strategy.reserveQuoteWad.toString(),
        feeBps: Number(strategy.fee.feeMin) / 100,
        sigmaWad: "0",
        active: false,
        version: "0",
      };
    });
  }

  async getStrategy(maker: `0x${string}`, strategyHash: `0x${string}`) {
    const manifest = this.manifest();
    const seeded = manifest.seededStrategies.find((s) => s.strategyKey === strategyHash && s.maker === maker);
    const lens = getRiptideLens(this.client, manifest.lens);

    const orderHash = seeded
      ? (seeded.orderHash as `0x${string}`)
      : strategyHash;

    let state;
    try {
      state = await lens.read.strategyState([
        maker,
        orderHash,
        manifest.demoTokens.base,
        manifest.demoTokens.quote,
      ]);
    } catch (err) {
      if (isInactiveAquaStrategyError(err) || isStrategyNotActiveError(err)) {
        throw new Error("strategy not active");
      }
      throw err;
    }
    const view = (await this.listStrategies(DEMO_MARKET)).find((s) => s.strategyHash === strategyHash);
    if (!view) throw new Error("strategy not active");
    const cumulativeRecapture = this.config.subgraphUrl
      ? await queryStrategyCumulativeRecapture(this.config.subgraphUrl, strategyHash)
      : await strategyRecaptureFromRpc(this.client, manifest, strategyHash);
    return {
      ...view,
      policyHash: strategyHash,
      aquaBase: state.aquaBase.toString(),
      aquaQuote: state.aquaQuote.toString(),
      cumulativeRecapture,
    };
  }

  async getStrategyPreset(maker: `0x${string}`, strategyHash: `0x${string}`) {
    const manifest = this.manifest();
    const seeded = manifest.seededStrategies.find((s) => s.strategyKey === strategyHash && s.maker === maker);
    if (!seeded) throw new Error("strategy not found");
    const feed = await resolveFeedAddress(manifest, {
      envFeed: this.config.chainlinkFeed,
      client: this.client,
    });
    // Shipped Aqua rebalance orders encode manifest reserves in the order hash — do not substitute live balances here.
    return buildStrategyPreset(manifest, seeded, feed);
  }

  async quoteSwap(market: MarketId, kind: QuoteKind, amount: string) {
    if (this.config.solverApiUrl) {
      try {
        const res = await fetch(`${this.config.solverApiUrl}/v1/quote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ market, kind, amount }),
          signal: AbortSignal.timeout(2_000),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            amountIn: string;
            amountOut: string;
            feeBps: number;
            sigmaWad: string;
            freshness: Freshness;
          };
          return {
            market,
            kind,
            amountIn: body.amountIn,
            amountOut: body.amountOut,
            feeBpsApplied: body.feeBps,
            sigmaWad: body.sigmaWad,
            effPrice: effPrice(BigInt(body.amountIn), BigInt(body.amountOut)),
            freshness: {
              indexedBlock: body.freshness.indexedBlock,
              chainHead: body.freshness.chainHead,
              laggingSeconds: body.freshness.laggingSeconds,
              source: body.freshness.source,
              refreshedAt: body.freshness.refreshedAt,
            },
          };
        }
      } catch {
        /* solver-api optional on public testnet */
      }
    }

    const manifest = this.manifest();
    await assertChainSeeded(this.client, manifest);
    const discovery = createDiscoveryProvider({
      manifest,
      client: this.client,
      subgraphUrl: this.config.subgraphUrl,
      feedAddress: this.config.chainlinkFeed,
    });
    const { candidates, freshness } = await discovery.listCandidates(market);
    const quoter = getRiptideQuoter(this.client, manifest.quoter);
    const qKind = kind === "ExactInput" ? SolverQuoteKind.ExactInput : SolverQuoteKind.ExactOutput;
    const amountWad = BigInt(amount);

    let totalIn = 0n;
    let totalOut = 0n;
    let feeBps = 0;
    let sigmaWad = 0n;
    const per = candidates.length > 0 ? amountWad / BigInt(candidates.length) : amountWad;
    let remainder = amountWad - per * BigInt(Math.max(candidates.length, 1));

    for (const c of candidates) {
      const slice = per + (remainder > 0n ? 1n : 0n);
      if (remainder > 0n) remainder -= 1n;
      if (slice === 0n) continue;
      const quote = await quoter.read.quoteSwap([
        strategyToContractTuple({
          ...c.strategy,
          reserveBaseWad: c.reserveBaseWad,
          reserveQuoteWad: c.reserveQuoteWad,
        }),
        qKind,
        slice,
      ]);
      const inAmt = qKind === SolverQuoteKind.ExactInput ? slice : BigInt(quote[0]);
      const outAmt = qKind === SolverQuoteKind.ExactInput ? BigInt(quote[1]) : slice;
      totalIn += inAmt;
      totalOut += outAmt;
      feeBps = Number(quote[2]);
      sigmaWad = BigInt(quote[3]);
    }

    return {
      market,
      kind,
      amountIn: totalIn.toString(),
      amountOut: totalOut.toString(),
      feeBpsApplied: feeBps,
      sigmaWad: sigmaWad.toString(),
      effPrice: effPrice(totalIn, totalOut),
      freshness: {
        indexedBlock: freshness.indexedBlock.toString(),
        chainHead: freshness.chainHead.toString(),
        laggingSeconds: freshness.laggingSeconds,
        source: freshness.source,
        refreshedAt: freshness.refreshedAt,
      },
    };
  }

  /**
   * Contracts that pull tokens (the batch executor, the auction settler) need an ERC20
   * allowance from whoever sends the transaction. A wallet that has never used this
   * deployment has none, so the plan carries the approval as its first step and drops it
   * again once the allowance is in place - otherwise every fresh wallet's first click
   * reverts with ERC20InsufficientAllowance.
   */
  private async approvalStep(
    token: `0x${string}`,
    owner: `0x${string}` | undefined,
    spender: `0x${string}`,
    amount: bigint,
  ): Promise<{ to: `0x${string}`; data: `0x${string}`; label: string } | null> {
    if (owner) {
      const current = (await this.client.readContract({
        address: token,
        abi: riptideDemoTokenAbi,
        functionName: "allowance",
        args: [owner, spender],
      })) as bigint;
      if (current >= amount) return null;
    }
    return {
      to: token,
      data: encodeFunctionData({
        abi: riptideDemoTokenAbi,
        functionName: "approve",
        args: [spender, MAX_UINT256],
      }),
      label: "Approve quote token",
    };
  }

  async buildSwapRoute(market: MarketId, kind: QuoteKind, amount: string, limits: RouteLimits) {
    if (this.config.solverApiUrl) {
      try {
        const res = await fetch(`${this.config.solverApiUrl}/v1/route`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            market,
            kind,
            amount,
            recipient: limits.recipient,
            payer: limits.payer,
          }),
          signal: AbortSignal.timeout(3_000),
        });
        const body = (await res.json()) as {
          to?: `0x${string}`;
          calldata?: `0x${string}`;
          sendable?: true;
          error?: string;
          amountIn?: string;
          amountOut?: string;
          fills?: Array<{
            candidateId: string;
            maker: `0x${string}`;
            strategyKey: `0x${string}`;
            amountIn: string;
            amountOut: string;
            feeBps: number;
            expectedVersion: string;
          }>;
          freshness?: Freshness;
        };
        if (res.ok && body.to && body.calldata && body.sendable) {
          return {
            to: body.to,
            data: body.calldata,
            steps: [{ to: body.to, data: body.calldata, label: "Execute batch swap route" }],
            sendable: body.sendable,
            description: `Swap route ${market} ${kind}`,
            fills: body.fills ?? [],
            amountIn: body.amountIn,
            amountOut: body.amountOut,
            freshness: body.freshness,
          };
        }
      } catch {
        /* solver-api optional on public testnet */
      }
    }

    const manifest = this.manifest();
    await assertChainSeeded(this.client, manifest);
    const discovery = createDiscoveryProvider({
      manifest,
      client: this.client,
      subgraphUrl: this.config.subgraphUrl,
      feedAddress: this.config.chainlinkFeed,
    });
    const { candidates, freshness } = await discovery.listCandidates(market);
    const qKind = kind === "ExactInput" ? SolverQuoteKind.ExactInput : SolverQuoteKind.ExactOutput;
    const totalAmount = BigInt(amount);
    const shortlisted = candidates.slice(0, 8);
    const route = optimize({
      candidates: shortlisted,
      kind: qKind,
      totalAmount,
      indexedBlock: freshness.indexedBlock,
      refreshedAt: Date.now(),
    });
    const certificate = attachExpectedVersions(route.fills, shortlisted, freshness.indexedBlock, Date.now());
    route.fills = certificate.fills;

    const swapRouter = getRiptideSwapVMRouter(this.client, manifest.swapRouter);
    const head = await this.client.getBlock();
    const orders = new Map<string, `0x${string}`>();
    for (const fill of route.fills) {
      const c = shortlisted.find((x) => x.id === fill.candidateId);
      if (!c) throw new Error(`missing candidate ${fill.candidateId}`);
      const order = await swapRouter.read.buildSwapOrder([
        c.strategy.maker,
        strategyToContractTuple({
          ...c.strategy,
          reserveBaseWad: c.strategy.reserveBaseWad,
          reserveQuoteWad: c.strategy.reserveQuoteWad,
        }),
        SWAP_ORDER_PROGRAM_DEADLINE,
      ]);
      orders.set(fill.candidateId, encodeOrderBytes(order));
    }

    const payer = (limits.payer ?? demoResolverAddress(manifest)) as `0x${string}`;
    const recipient = (limits.recipient ?? payer) as `0x${string}`;
    const batchRoute = buildBatchRoute({
      base: manifest.demoTokens.base,
      quote: manifest.demoTokens.quote,
      kind: qKind,
      payer,
      recipient,
      refundRecipient: payer,
      deadline: Number(head.timestamp + 3600n),
      salt: keccak256(toHex(Date.now())),
      aggregateLimit: aggregateLimitForKind(qKind, {
        amountIn: route.totalAmountIn,
        amountOut: route.totalAmountOut,
      }),
      fills: route.fills,
      orders,
    });

    const data = encodeExecuteCalldata(batchRoute);
    // The executor pulls the input token from the payer, so a wallet that has never swapped
    // here needs an allowance first. Carrying it in the plan means the stepper walks a fresh
    // wallet through approve -> execute instead of reverting on the first click.
    const quoteIn = qKind === SolverQuoteKind.ExactInput
      ? route.totalAmountIn
      : aggregateLimitForKind(qKind, { amountIn: route.totalAmountIn, amountOut: route.totalAmountOut });
    const approve = await this.approvalStep(
      manifest.demoTokens.quote as `0x${string}`,
      limits.payer as `0x${string}` | undefined,
      manifest.batchExecutor as `0x${string}`,
      quoteIn,
    );
    const execStep = { to: manifest.batchExecutor as `0x${string}`, data, label: "Execute batch swap route" };
    const steps = approve ? [{ ...approve, label: "Approve quote token for the batch executor" }, execStep] : [execStep];
    return {
      to: steps[0]!.to,
      data: steps[0]!.data,
      // The executor pulls from and pays to the payer, so an eth_call with no `from`
      // simulates as address(0) and reverts on the authorisation check rather than on
      // anything real. Carrying it here makes every consumer's simulation meaningful.
      from: payer,
      steps,
      sendable: true as const,
      description: `Swap route ${market} ${kind}`,
      fills: route.fills.map((f) => ({
        candidateId: f.candidateId,
        maker: f.maker,
        strategyKey: f.strategyKey,
        amountIn: f.amountIn.toString(),
        amountOut: f.amountOut.toString(),
        feeBps: f.feeBps,
        expectedVersion: f.expectedVersion.toString(),
      })),
      amountIn: route.totalAmountIn.toString(),
      amountOut: route.totalAmountOut.toString(),
      freshness: {
        indexedBlock: freshness.indexedBlock.toString(),
        chainHead: freshness.chainHead.toString(),
        laggingSeconds: freshness.laggingSeconds,
        source: freshness.source,
        refreshedAt: Date.now(),
      },
    };
  }

  async listOpenAuctions(market?: MarketId) {
    return scanOpenAuctions(this.client, this.config.chainId, market ?? DEMO_MARKET, this.config.subgraphUrl);
  }

  async previewRebalance(
    maker: `0x${string}`,
    strategy: Strategy | `0x${string}`,
    outWad: string,
  ) {
    const strategyLive = await this.resolveStrategy(maker, strategy);
    const manifest = this.manifest();
    const quoter = getRiptideQuoter(this.client, manifest.quoter);
    const rebalanceRouter = getRiptideRebalanceRouter(this.client, manifest.rebalanceRouter);
    const strategyKey = runtimeStrategyKey(strategyLive.maker, strategyLive.salt);
    const auctionStart = Number(await rebalanceRouter.read.rebalanceAuctionStart([strategyKey]));

    try {
      const [preview, auctionPriceNowWad] = await quoter.read.previewRebalance([
        strategyToContractTuple(strategyLive),
        BigInt(outWad),
      ]);
      const block = await this.client.getBlock();
      const evaluation = evaluate({
        auction: {
          strategyId: "preview",
          beta: strategyLive.auction.beta,
          decay: strategyLive.auction.decay,
          duration: strategyLive.auction.duration,
          antiSandwichPeriod: strategyLive.auction.antiSandwichPeriod,
          auctionStartTs: auctionStart > 0 ? auctionStart : Number(block.timestamp),
          initialBalanceIn: strategyLive.reserveQuoteWad,
          executedInWad: preview.surplusWad + 1n,
          staleInWad: 1n,
        },
        nowTs: Number(block.timestamp),
      });
      const staleInWad = await this.client.readContract({
        address: manifest.kernel,
        abi: staleBaselineInAbi,
        functionName: "staleBaselineIn",
        args: [
          BigInt(outWad),
          strategyLive.reserveBaseWad,
          strategyLive.reserveQuoteWad,
          1, // QuoteKind.ExactOutput
        ],
      });
      const amountInWad = preview.surplusWad + staleInWad;
      const maxInWad = rebalanceMaxInWad(preview.surplusWad, staleInWad);
      return {
        surplusWad: preview.surplusWad.toString(),
        payToResolver: preview.payToResolver.toString(),
        retainToLP: preview.retainToLP.toString(),
        auctionPriceNowWad: auctionPriceNowWad.toString(),
        amountInWad: amountInWad.toString(),
        maxInWad: maxInWad.toString(),
        profitable: evaluation.profitable && preview.surplusWad > 0n,
      };
    } catch (err) {
      throwIfRiptideError(err);
    }
  }

  async buildDemoOracleSkew(skewAnswer?: string) {
    const manifest = this.manifest();
    const feed = await resolveFeedAddress(manifest, {
      envFeed: this.config.chainlinkFeed,
      client: this.client,
    });
    const block = await this.client.getBlock();
    const answer = skewAnswer ? BigInt(skewAnswer) : DEMO_ORACLE_SKEW_ANSWER;
    return buildSkewOracleTxPlan(feed, answer, block.timestamp);
  }

  async openDemoAuctions() {
    if (this.config.chainId !== ANVIL_CHAIN_ID) {
      throw new Error("openDemoAuctions is Anvil-only. On testnet, skew the feed from the connected wallet on Resolve.");
    }
    const manifest = this.manifest();
    return openDemoAuctionsLive(
      this.client,
      manifest,
      this.config.rpcUrl,
      this.config.chainId,
      this.config.chainlinkFeed,
    );
  }

  async buildSettleRebalance(
    maker: `0x${string}`,
    strategy: Strategy | `0x${string}`,
    outWad: string,
    maxIn: string,
    deadline: number,
    resolver?: `0x${string}`,
  ) {
    const strategyLive = await this.resolveStrategy(maker, strategy);
    const manifest = this.manifest();
    const maxInWad = maxIn ? BigInt(maxIn) : BigInt(strategyLive.reserveQuoteWad);
    const data = buildSettleCalldata(maker, strategyLive, BigInt(outWad), maxInWad, deadline);
    // The settler pulls maxIn of the quote token from whoever sends the transaction and
    // refunds the unspent part in the same call, so the plan has to carry the approval.
    // Without it a first-time resolver hits ERC20InsufficientAllowance.
    const approve = await this.approvalStep(
      strategyLive.quoteToken,
      resolver,
      manifest.settler as `0x${string}`,
      maxInWad,
    );
    const settleStep = { to: manifest.settler as `0x${string}`, data, label: "settleRebalance" };
    const steps = approve ? [{ ...approve, label: "Approve quote token for the settler" }, settleStep] : [settleStep];
    return {
      to: steps[0]!.to,
      data: steps[0]!.data,
      from: resolver,
      steps,
      sendable: true,
      description: approve
        ? "Settle rebalance auction: approve quote + settleRebalance"
        : "Settle rebalance auction",
    };
  }

  async buildShipStrategy(strategy: Strategy) {
    const s = normalizeStrategy(strategy);
    const manifest = this.manifest();
    const swapRouter = getRiptideSwapVMRouter(this.client, manifest.swapRouter);
    const rebalanceRouter = getRiptideRebalanceRouter(this.client, manifest.rebalanceRouter);
    const order = await swapRouter.read.buildSwapOrder([
      s.maker,
      strategyToContractTuple(s),
      SWAP_ORDER_PROGRAM_DEADLINE,
    ]);
    const strategyKey = runtimeStrategyKey(s.maker, s.salt);
    const orderHash = await swapRouter.read.hash([order]);
    const orderBytes = encodeOrderBytes(order);

    const block = await this.client.getBlock();
    const auctionStart = Number(block.timestamp);
    const rebOrder = await rebalanceRouter.read.buildRebalanceOrderWithAuctionStart([
      s.maker,
      strategyToContractTuple(s),
      SWAP_ORDER_PROGRAM_DEADLINE,
      WAD,
      true,
      auctionStart,
    ]);
    const rebOrderHash = (await rebalanceRouter.read.hash([rebOrder])) as `0x${string}`;
    const rebOrderBytes = encodeOrderBytes(rebOrder);

    return buildShipTxPlan(manifest, s, orderBytes, strategyKey, orderHash, true, {
      orderBytes: rebOrderBytes,
      orderHash: rebOrderHash,
      auctionStart,
    });
  }

  /**
   * `strategyHash` here is what the UI lists, which is the runtime strategy *key*. Aqua
   * addresses inventory by the order hash instead, so it has to be resolved first. The
   * manifest only knows the seeded pools; anything a maker shipped themselves has to come
   * from discovery, which recovers the order hash from the indexed order bytes. Falling
   * back to treating the key as an order hash - as this used to - made `dock` revert with
   * `DockingShouldCloseAllTokens` for every maker-shipped strategy.
   */
  async buildDockStrategy(_maker: `0x${string}`, strategyHash: `0x${string}`) {
    const manifest = this.manifest();
    const seeded = manifest.seededStrategies.find((s) => s.strategyKey === strategyHash);
    if (seeded) {
      return buildDockTxPlan(manifest, seeded.maker as `0x${string}`, seeded.orderHash as `0x${string}`, true);
    }

    const discovery = createDiscoveryProvider({
      manifest,
      client: this.client,
      subgraphUrl: this.config.subgraphUrl,
      feedAddress: this.config.chainlinkFeed,
    });
    const { candidates } = await discovery.listCandidates(DEMO_MARKET);
    const found = candidates.find((c) => c.strategyKey === strategyHash || c.orderHash === strategyHash);
    if (!found) {
      throw new RiptideFrontendApiError({
        code: "RiptideStrategyNotActive",
        message: `No active strategy for ${strategyHash}. It may already be docked.`,
      });
    }
    return buildDockTxPlan(manifest, found.strategy.maker, found.orderHash, true);
  }

  async restoreDemoStrategies() {
    if (this.config.chainId !== ANVIL_CHAIN_ID) {
      throw new Error("restoreDemoStrategies is Anvil-only. On testnet, ship from the connected maker wallet.");
    }
    const manifest = this.manifest();
    const result = await restoreDemoStrategiesLive(
      this.client,
      manifest,
      this.config.rpcUrl,
      this.config.chainId,
      this.config.chainlinkFeed,
    );
    if (result.subgraphRedeployed) {
      const refreshed = this.manifest();
      if (refreshed.subgraphUrl) this.config.subgraphUrl = refreshed.subgraphUrl;
    }
    return result;
  }

  async redeploySubgraph() {
    const result = await redeployLocalSubgraph(this.config.chainId);
    this.config.subgraphUrl = result.subgraphUrl;
    return result;
  }

  async getControllerState(maker: `0x${string}`, strategyHash: `0x${string}`) {
    const manifest = this.manifest();
    const lens = getRiptideLens(this.client, manifest.lens);
    const seeded = manifest.seededStrategies.find((s) => s.strategyKey === strategyHash);

    const orderHash = seeded
      ? (seeded.orderHash as `0x${string}`)
      : strategyHash;

    let state;
    try {
      state = await lens.read.strategyState([
        maker,
        orderHash,
        manifest.demoTokens.base,
        manifest.demoTokens.quote,
      ]);
    } catch (err) {
      if (isInactiveAquaStrategyError(err) || isStrategyNotActiveError(err)) {
        throw new Error("strategy not active");
      }
      throw err;
    }

    // The router's `runtime` struct only gets a controller snapshot written to it by a
    // *rebalance* (RiptideRebalanceModule._advanceRuntime). A strategy that has only ever
    // been swapped against therefore has runtime.feeReported == 0, which is not the fee it
    // is charging. RiptideLvrFeeProvider is the source of truth for both numbers, so read
    // it directly and fall back to the router runtime only if the strategy is unregistered.
    const provider = getRiptideLvrFeeProvider(this.client, manifest.feeProvider);
    let feeReportedValue = Number(state.runtime.feeReported);
    let integralValue = state.runtime.integral.toString();
    let feeTargetValue = feeReportedValue;
    try {
      const [reported, integral] = await provider.read.controllerState([strategyHash]);
      feeReportedValue = Number(reported);
      integralValue = integral.toString();
      feeTargetValue = Number(await provider.read.feeTarget([strategyHash]));
    } catch {
      // Unregistered on the provider — keep the router-runtime values.
    }

    let indexedBlock = "0";
    if (this.config.subgraphUrl) {
      const rows = await queryLatestControllerStates(this.config.subgraphUrl, 20);
      const row = rows.find((r) => r.strategy.id.includes(strategyHash.slice(2, 10)));
      if (row) indexedBlock = row.blockNumber;
    }

    return {
      maker,
      strategyHash,
      sigmaWad: state.sigmaWad.toString(),
      feeTarget: feeTargetValue,
      feeReported: feeReportedValue,
      integral: integralValue,
      indexedBlock,
    };
  }

  /**
   * Atomic multi-fill taker settlements. Each row is one RiptideBatchExecutor.execute
   * call: several maker fills that either all settled or all reverted together.
   * Indexed from RouteExecuted; requires a subgraph (the RPC fallback does not scan it).
   */
  async listRoutes(limit = 20) {
    if (!this.config.subgraphUrl) return [];
    const rows = await queryRecentRoutes(this.config.subgraphUrl, limit);
    return rows.map((r) => ({
      routeId: r.id,
      txHash: r.txHash,
      blockNumber: r.blockNumber,
      timestamp: r.timestamp,
      payer: r.payer,
      recipient: r.recipient,
      kind: (r.kind === 0 ? "ExactInput" : "ExactOutput") as "ExactInput" | "ExactOutput",
      amountIn: r.amountIn,
      amountOut: r.amountOut,
      limit: r.limit,
      fillCount: r.fillCount,
    }));
  }

  async listResolvers(limit = 25) {
    if (!this.config.subgraphUrl) return [];
    const rows = await queryResolvers(this.config.subgraphUrl, limit);
    return rows.map((r) => ({
      address: r.id,
      settlementCount: Number(r.settlementCount),
      paidToResolverWad: r.paidToResolverWad,
      retainedForLPsWad: r.retainedForLPsWad,
      amountInWad: r.amountInWad,
      outWad: r.outWad,
      firstSeenTimestamp: r.firstSeenTimestamp,
      lastSeenTimestamp: r.lastSeenTimestamp,
    }));
  }

  async getRecaptureStats(scope: RecaptureStatsScope) {
    if (!this.config.subgraphUrl) {
      const { stats } = await scanProtocolFromRpc(this.client, this.manifest());
      if (scope !== "protocol") {
        const m = stats.perMarket.find((x) => x.marketId === scope);
        return {
          scope,
          totalRecapture: m?.recaptureVolume ?? "0",
          totalFillVolume: m?.fillVolume ?? "0",
          paidToResolvers: stats.paidToResolvers,
          perMarket: stats.perMarket,
          indexedBlock: stats.indexedBlock,
        };
      }
      return {
        scope,
        totalRecapture: stats.totalRecapture,
        totalFillVolume: stats.totalFillVolume,
        paidToResolvers: stats.paidToResolvers,
        perMarket: stats.perMarket,
        indexedBlock: stats.indexedBlock,
      };
    }
    const [{ _meta, protocol }, markets, paidToResolvers] = await Promise.all([
      queryProtocolStats(this.config.subgraphUrl, String(this.config.chainId)),
      queryRecaptureByMarket(this.config.subgraphUrl),
      queryTotalPaidToResolvers(this.config.subgraphUrl, scope === "protocol" ? undefined : scope),
    ]);
    const totalRecapture = protocol?.totalRecapture ?? "0";
    const totalFill = protocol?.totalFillVolume ?? "0";
    const perMarket = markets.map((m) => ({
      marketId: m.id,
      recaptureVolume: m.recaptureVolume,
      fillVolume: m.fillVolume,
    }));
    if (scope !== "protocol") {
      const m = perMarket.find((x) => x.marketId === scope);
      return {
        scope,
        totalRecapture: m?.recaptureVolume ?? "0",
        totalFillVolume: m?.fillVolume ?? "0",
        paidToResolvers,
        perMarket,
        indexedBlock: String(_meta.block.number),
      };
    }
    return {
      scope,
      totalRecapture,
      totalFillVolume: totalFill,
      paidToResolvers,
      perMarket,
      indexedBlock: String(_meta.block.number),
    };
  }

  async streamEvents(filter: EventFeedFilter) {
    if (!this.config.subgraphUrl) {
      const { events } = await scanProtocolFromRpc(this.client, this.manifest());
      return events
        .filter((e) => !filter.market || ("market" in e && e.market === filter.market))
        .slice(0, filter.limit ?? 20);
    }
    const limit = filter.limit ?? 20;
    const [fills, rebalances, controllers] = await Promise.all([
      queryRecentFills(this.config.subgraphUrl, limit),
      queryRecentRebalances(this.config.subgraphUrl, limit),
      queryLatestControllerStates(this.config.subgraphUrl, limit),
    ]);

    const events = [
      ...fills.map((f) => ({
        type: "SwapFilled" as const,
        id: f.id,
        market: f.market.id,
        strategyKey: f.strategy.strategyKey,
        amountIn: f.amountIn,
        amountOut: f.amountOut,
        feeBpsApplied: f.feeBpsApplied,
        blockNumber: f.blockNumber,
        timestamp: f.timestamp,
        txHash: f.txHash,
      })),
      ...rebalances.map((r) => ({
        type: "RebalanceSettled" as const,
        id: r.id,
        market: r.market.id,
        strategyKey: r.strategy.strategyKey,
        surplusWad: r.surplusWad,
        payToResolver: r.payToResolverWad,
        retainToLP: r.retainToLPWad,
        settledBy: r.settledBy,
        blockNumber: r.blockNumber,
        timestamp: r.timestamp,
        txHash: r.txHash,
      })),
      ...controllers.map((c) => ({
        type: "FeeControllerUpdated" as const,
        id: c.id,
        strategyKey: c.strategy.strategyKey,
        sigmaWad: c.sigmaWad,
        feeTarget: c.feeTarget,
        feeReported: c.feeReported,
        blockNumber: c.blockNumber,
        timestamp: c.timestamp,
      })),
    ];

    return events
      .filter((e) => !filter.market || ("market" in e && e.market === filter.market))
      .slice(0, limit);
  }

  async getFreshness(): Promise<Freshness> {
    const chainHead = await this.client.getBlockNumber();
    if (!this.config.subgraphUrl) {
      return {
        indexedBlock: chainHead.toString(),
        chainHead: chainHead.toString(),
        laggingSeconds: 0,
        source: "rpc",
      };
    }
    const meta = await queryMetaBlock(this.config.subgraphUrl);
    const headBlock = await this.client.getBlock({ blockNumber: chainHead });
    const indexedTs = meta.block.timestamp;
    const laggingSeconds = Math.max(0, Number(headBlock.timestamp) - indexedTs);
    return {
      indexedBlock: String(meta.block.number),
      chainHead: chainHead.toString(),
      laggingSeconds,
      source: "subgraph",
      refreshedAt: Date.now(),
    };
  }
}

export function createLiveFrontendApi(config: FrontendApiConfig): RiptideFrontendApi {
  return new LiveFrontendApi(config);
}
