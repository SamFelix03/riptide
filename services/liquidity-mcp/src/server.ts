import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import {
  compareLiquidityVsDex,
  getRiptideExecutableLiquidity,
  getRiptideRecaptureStats,
} from "./tools.js";

export async function startMcpServer(): Promise<void> {
  const config = loadConfig();
  const server = new McpServer({ name: "riptide-liquidity-mcp", version: "0.0.0" });

  server.tool(
    "get_riptide_executable_liquidity",
    "Curve-aware executable liquidity on RIPTIDE for a given market, kind, and size (Quoter ground truth).",
    {
      market: z.string().describe('Market id e.g. "RBASE-RQUOTE"'),
      kind: z.enum(["ExactInput", "ExactOutput"]),
      amountWad: z.string().describe("Amount in wei (wad for 18-decimal demo tokens)"),
    },
    async ({ market, kind, amountWad }) => {
      const result = await getRiptideExecutableLiquidity(config, market, kind, BigInt(amountWad));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_riptide_recapture_stats",
    "Protocol and per-market LVR recapture stats from the RIPTIDE subgraph.",
    {},
    async () => {
      const result = await getRiptideRecaptureStats(config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "compare_liquidity_vs_dex",
    "Compare RIPTIDE executable liquidity vs official Uniswap V3 mainnet (The Graph).",
    {
      market: z.string(),
      kind: z.enum(["ExactInput", "ExactOutput"]),
      amountWad: z.string(),
    },
    async ({ market, kind, amountWad }) => {
      const result = await compareLiquidityVsDex(config, market, kind, BigInt(amountWad));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
