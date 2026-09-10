import type { RiptideFrontendApi } from "@riptide/frontend-api";
import { BASE_SEPOLIA_CHAIN_ID } from "@riptide/contracts/networks";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

process.env.RIPTIDE_REPO_ROOT ??= path.resolve(process.cwd(), "../..");

const PROTOCOL_MODE = process.env.NEXT_PUBLIC_PROTOCOL_MODE ?? "live";

async function getApi(): Promise<RiptideFrontendApi> {
  if (PROTOCOL_MODE === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: mock mode is forbidden in production builds");
    }
    const { createMockFrontendApi } = await import("@riptide/frontend-api/mock");
    return createMockFrontendApi();
  }
  const { createLiveFrontendApi, loadFrontendApiConfig } = await import("@riptide/frontend-api");
  return createLiveFrontendApi(
    loadFrontendApiConfig({ chainId: BASE_SEPOLIA_CHAIN_ID }),
  );
}

export async function POST(req: Request) {
  try {
    const api = await getApi();
    const { method, args } = (await req.json()) as { method: keyof RiptideFrontendApi; args: unknown[] };
    const fn = api[method] as (...a: unknown[]) => Promise<unknown>;
    if (typeof fn !== "function") {
      return NextResponse.json({ error: { message: `Unknown method ${String(method)}` } }, { status: 400 });
    }
    const result = await fn.apply(api, args as []);
    const { serializeForJson } = await import("@riptide/frontend-api");
    return NextResponse.json({ result: serializeForJson(result) });
  } catch (err) {
    const { RiptideFrontendApiError } = await import("@riptide/frontend-api");
    if (err instanceof RiptideFrontendApiError) {
      return NextResponse.json(
        { error: { code: err.riptide.code, message: err.riptide.message } },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
