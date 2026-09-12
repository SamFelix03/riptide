import type { DeploymentManifest } from "@riptide/contracts";
import { getRiptideLens } from "@riptide/contracts";
import type { PublicClient } from "viem";

export class ChainNotSeededError extends Error {
  constructor(message = "Riptide strategies not seeded on chain — run deploy + seed scripts") {
    super(message);
    this.name = "ChainNotSeededError";
  }
}

export function isStrategyNotActiveError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("RiptideStrategyNotActive") || msg.includes("0xff605709");
}

export function isNoSurplusError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("RiptideNoSurplus") || msg.includes("0x3c10eb25");
}

export function isInactiveAquaStrategyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("SafeBalancesForTokenNotInActiveStrategy") || msg.includes("0xb63386a6");
}

export function isAuctionWindowClosedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("RiptideAuctionWindowClosed") ||
    // Thrown by RIPTIDE's own auction schedule instruction (RiptideAuctionSchedule.sol).
    msg.includes("RiptideAuctionWindowExpired") ||
    msg.includes("DutchAuctionExpired") ||
    msg.includes("0x0ad72b41") ||
    msg.includes("0x1f9809eb") ||
    msg.includes("0x35820154")
  );
}

export async function assertChainSeeded(client: PublicClient, manifest: DeploymentManifest): Promise<void> {
  if (!manifest.seededStrategies.length) {
    throw new ChainNotSeededError("manifest has no seededStrategies");
  }

  const lens = getRiptideLens(client, manifest.lens);
  for (const seeded of manifest.seededStrategies) {
    try {
      const state = await lens.read.strategyState([
        seeded.maker,
        seeded.orderHash as `0x${string}`,
        manifest.demoTokens.base,
        manifest.demoTokens.quote,
      ]);
      if (BigInt(state.aquaBase) > 0n && BigInt(state.aquaQuote) > 0n) {
        return;
      }
    } catch (err) {
      if (isStrategyNotActiveError(err) || isInactiveAquaStrategyError(err)) continue;
      throw err;
    }
  }
  throw new ChainNotSeededError("no active seeded strategies on chain — re-run demo seed (pnpm demo:reset)");
}

export async function isChainSeeded(client: PublicClient, manifest: DeploymentManifest): Promise<boolean> {
  try {
    await assertChainSeeded(client, manifest);
    return true;
  } catch (err) {
    if (err instanceof ChainNotSeededError) return false;
    throw err;
  }
}
