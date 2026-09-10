import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { simulateTxPlan } = await import("@riptide/frontend-api");
    const txPlan = await req.json();
    const result = await simulateTxPlan(txPlan);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: { code: "SimulationFailed", message } }, { status: 500 });
  }
}
