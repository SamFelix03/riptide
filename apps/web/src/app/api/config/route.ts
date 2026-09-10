import { loadPublicDeploymentConfig } from "@riptide/contracts";
import { BASE_SEPOLIA_CHAIN_ID } from "@riptide/contracts/networks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(loadPublicDeploymentConfig(BASE_SEPOLIA_CHAIN_ID));
}
