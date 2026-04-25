import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenRouterClient } from "../client.js";

interface CreditsData {
  total_credits: number;
  total_usage: number;
}

interface KeyEntry {
  hash: string;
  name: string;
  label: string;
  disabled: boolean;
  limit: number | null;
  limit_remaining: number | null;
  limit_reset?: "daily" | "weekly" | "monthly" | null;
  usage: number;
  usage_daily?: number;
  expires_at?: string | null;
}

interface ActivityRow {
  date?: string;
  model?: string;
  api_key_hash?: string;
  provider_name?: string;
  usage?: number;
  requests?: number;
}

const money = (n: number | null | undefined): string => (n == null ? "—" : `$${n.toFixed(4)}`);

const moneyShort = (n: number | null | undefined): string => (n == null ? "—" : `$${n.toFixed(2)}`);

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleOverview(client: OpenRouterClient): Promise<string> {
  const [credits, keys, activity] = await Promise.all([
    client.request<CreditsData>("GET", "/credits"),
    client.request<KeyEntry[]>("GET", "/keys"),
    client
      .request<ActivityRow[]>("GET", "/activity", {
        query: { date: todayUtcDate() },
      })
      .catch(() => [] as ActivityRow[]),
  ]);

  const remaining = credits.total_credits - credits.total_usage;
  const lines: string[] = [];

  // ── Account ─────────────────────────────────────
  lines.push(
    `Account: ${moneyShort(remaining)} remaining of ${moneyShort(credits.total_credits)} purchased (used ${moneyShort(credits.total_usage)})`,
  );

  // ── Keys ────────────────────────────────────────
  const active = keys.filter((k) => !k.disabled);
  lines.push("");
  lines.push(
    `Keys (${active.length} active${keys.length > active.length ? `, ${keys.length - active.length} disabled` : ""}):`,
  );
  for (const k of active) {
    const parts: string[] = [];
    if (k.limit != null) {
      const reset = k.limit_reset ? ` ${k.limit_reset}` : " total";
      parts.push(`${moneyShort(k.usage_daily ?? k.usage)}/${moneyShort(k.limit)}${reset}`);
      // ⚠️ near limit
      if (k.limit > 0 && k.limit_remaining !== null && k.limit_remaining < k.limit * 0.1) {
        parts.push("⚠️");
      }
    } else {
      parts.push(`${moneyShort(k.usage)} used (no limit)`);
    }
    if (k.expires_at) parts.push(`expires ${k.expires_at.slice(0, 10)}`);
    lines.push(`  - ${k.name}: ${parts.join(" | ")}`);
  }

  // ── Today's burn (top 5 models) ─────────────────
  if (activity.length > 0) {
    const byModel = new Map<string, { usage: number; requests: number }>();
    let totalToday = 0;
    let totalReqs = 0;
    for (const r of activity) {
      const m = r.model ?? "(unknown)";
      const cur = byModel.get(m) ?? { usage: 0, requests: 0 };
      cur.usage += r.usage ?? 0;
      cur.requests += r.requests ?? 0;
      byModel.set(m, cur);
      totalToday += r.usage ?? 0;
      totalReqs += r.requests ?? 0;
    }
    const top = Array.from(byModel.entries())
      .sort((a, b) => b[1].usage - a[1].usage)
      .slice(0, 5);
    lines.push("");
    lines.push(`Today (UTC ${todayUtcDate()}): ${money(totalToday)}, ${totalReqs} req`);
    for (const [model, s] of top) {
      lines.push(`  - ${model.padEnd(40)} ${money(s.usage)} | ${s.requests} req`);
    }
  } else {
    lines.push("");
    lines.push(`Today (UTC ${todayUtcDate()}): no activity yet`);
  }

  return lines.join("\n");
}

export function registerOverviewTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_overview",
    "One-shot dashboard: account credits, all active keys (with daily/weekly/monthly reset info), and today's UTC burn by model. Combines credits + keys + activity into a single call. Use this first when investigating cost or checking key health.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await handleOverview(client) }],
    }),
  );
}
