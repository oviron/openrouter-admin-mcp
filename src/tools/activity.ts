import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenRouterClient } from "../client.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

interface ActivityRow {
  endpoint?: string;
  model?: string;
  usage?: number;
  requests?: number;
  [k: string]: unknown;
}

export async function handleActivity(
  client: OpenRouterClient,
  args: { date?: string; api_key_hash?: string; user_id?: string }
): Promise<string> {
  if (args.date !== undefined) dateSchema.parse(args.date);
  const data = await client.request<ActivityRow[]>("GET", "/activity", {
    query: {
      date: args.date,
      api_key_hash: args.api_key_hash,
      user_id: args.user_id,
    },
  });
  if (!data || data.length === 0) return "No activity in the requested window.";
  const lines = data.map((r) => {
    const label = r.endpoint ?? r.model ?? "(unknown)";
    const usage = typeof r.usage === "number" ? `$${r.usage.toFixed(4)}` : "—";
    const reqs = typeof r.requests === "number" ? `${r.requests} req` : "";
    return `- ${label}: ${usage} ${reqs}`.trim();
  });
  return `Activity (${data.length} rows):\n${lines.join("\n")}`;
}

export function registerActivityTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_activity",
    "Show OpenRouter usage grouped by endpoint for the last 30 UTC days. Optional filters: date (YYYY-MM-DD), api_key_hash, user_id.",
    {
      date: z.string().optional().describe("Single UTC date in YYYY-MM-DD"),
      api_key_hash: z.string().optional().describe("Filter by inference key hash"),
      user_id: z.string().optional().describe("Org member user_id (org accounts only)"),
    },
    async (args) => ({ content: [{ type: "text" as const, text: await handleActivity(client, args) }] })
  );
}
