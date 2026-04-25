import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OpenRouterClient } from "../client.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

interface ActivityRow {
  date?: string;
  model?: string;
  model_permaslug?: string;
  endpoint_id?: string;
  provider_name?: string;
  api_key_hash?: string;
  usage?: number;
  byok_usage_inference?: number;
  requests?: number;
  byok_requests?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  [k: string]: unknown;
}

const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(4)}`);

const tokens = (n: number | null | undefined) =>
  n == null || n === 0 ? "—" : `${n.toLocaleString("en-US")}`;

function shortDate(d: string | undefined): string {
  return d ? d.slice(0, 10) : "—";
}

function rowLabel(r: ActivityRow): string {
  return r.model ?? (r as { endpoint?: string }).endpoint ?? "?";
}

function fmtRowDetailed(r: ActivityRow): string {
  const parts: string[] = [];
  parts.push(shortDate(r.date));
  parts.push(rowLabel(r).padEnd(40));
  parts.push(money(r.usage));
  parts.push(`${r.requests ?? 0} req`);
  if (r.prompt_tokens || r.completion_tokens || r.reasoning_tokens) {
    parts.push(
      `tok in/out/reason: ${tokens(r.prompt_tokens)}/${tokens(r.completion_tokens)}/${tokens(r.reasoning_tokens)}`,
    );
  }
  if (r.provider_name) parts.push(`via ${r.provider_name}`);
  if (r.byok_usage_inference || r.byok_requests) {
    parts.push(`byok ${money(r.byok_usage_inference)} (${r.byok_requests ?? 0} req)`);
  }
  return `- ${parts.join(" | ")}`;
}

function aggregateBy(
  rows: ActivityRow[],
  keyFn: (r: ActivityRow) => string,
): Array<{ key: string; usage: number; requests: number; rows: number }> {
  const map = new Map<string, { key: string; usage: number; requests: number; rows: number }>();
  for (const r of rows) {
    const k = keyFn(r);
    const cur = map.get(k) ?? { key: k, usage: 0, requests: 0, rows: 0 };
    cur.usage += r.usage ?? 0;
    cur.requests += r.requests ?? 0;
    cur.rows += 1;
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.usage - a.usage);
}

export type AggregateMode = "none" | "by_model" | "by_day" | "by_provider" | "by_key";

export async function handleActivity(
  client: OpenRouterClient,
  args: {
    date?: string;
    api_key_hash?: string;
    user_id?: string;
    aggregate?: AggregateMode;
    limit?: number;
  },
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

  const totalUsage = data.reduce((s, r) => s + (r.usage ?? 0), 0);
  const totalReqs = data.reduce((s, r) => s + (r.requests ?? 0), 0);
  const header = `Activity: ${data.length} rows | total ${money(totalUsage)} | ${totalReqs} req`;
  const limit = args.limit ?? 50;
  const mode = args.aggregate ?? "none";

  if (mode === "by_model") {
    const agg = aggregateBy(data, (r) => r.model ?? "(unknown)");
    const lines = agg
      .slice(0, limit)
      .map((a) => `- ${a.key.padEnd(40)} ${money(a.usage)} | ${a.requests} req | ${a.rows} rows`);
    return `${header}\nBy model (top ${Math.min(limit, agg.length)}):\n${lines.join("\n")}`;
  }

  if (mode === "by_day") {
    const agg = aggregateBy(data, (r) => shortDate(r.date));
    agg.sort((a, b) => a.key.localeCompare(b.key));
    const lines = agg.map((a) => `- ${a.key} ${money(a.usage)} | ${a.requests} req`);
    return `${header}\nBy day:\n${lines.join("\n")}`;
  }

  if (mode === "by_provider") {
    const agg = aggregateBy(data, (r) => r.provider_name ?? "(unknown)");
    const lines = agg
      .slice(0, limit)
      .map((a) => `- ${a.key.padEnd(30)} ${money(a.usage)} | ${a.requests} req | ${a.rows} rows`);
    return `${header}\nBy provider (top ${Math.min(limit, agg.length)}):\n${lines.join("\n")}`;
  }

  if (mode === "by_key") {
    const agg = aggregateBy(data, (r) => r.api_key_hash ?? "(unknown)");
    const lines = agg
      .slice(0, limit)
      .map((a) => `- ${a.key.padEnd(64)} ${money(a.usage)} | ${a.requests} req | ${a.rows} rows`);
    return `${header}\nBy api_key_hash (top ${Math.min(limit, agg.length)}):\n${lines.join("\n")}`;
  }

  // none — detailed rows, sorted by usage desc, capped
  const sorted = [...data].sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0));
  const shown = sorted.slice(0, limit);
  const lines = shown.map(fmtRowDetailed);
  const truncMsg =
    data.length > limit
      ? `\n…${data.length - limit} more rows (use limit= to see more or aggregate=by_model/by_day/by_provider).`
      : "";
  return `${header}\n${lines.join("\n")}${truncMsg}`;
}

export function registerActivityTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_activity",
    "Show OpenRouter usage grouped by endpoint for the last 30 UTC days. Optional filters: date (YYYY-MM-DD), api_key_hash, user_id.",
    {
      date: z.string().optional().describe("Single UTC date in YYYY-MM-DD"),
      api_key_hash: z.string().optional().describe("Filter by inference key hash"),
      user_id: z.string().optional().describe("Org member user_id (org accounts only)"),
      aggregate: z
        .enum(["none", "by_model", "by_day", "by_provider", "by_key"])
        .optional()
        .describe(
          "Aggregation: none=raw rows sorted by usage; by_model/by_day/by_provider/by_key=grouped totals",
        ),
      limit: z.number().int().positive().optional().describe("Max rows in output (default 50)"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleActivity(client, args) }],
    }),
  );
}
