import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenRouterClient } from "../client.js";

interface CreditsData { total_credits: number; total_usage: number; }
interface KeyInfo {
  label: string;
  is_management_key?: boolean;
  is_provisioning_key?: boolean;
  limit: number | null;
  usage: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  expires_at?: string | null;
}

export async function handleCredits(client: OpenRouterClient): Promise<string> {
  const d = await client.request<CreditsData>("GET", "/credits");
  const remaining = d.total_credits - d.total_usage;
  return `Credits:\n- Purchased: $${d.total_credits}\n- Used: $${d.total_usage}\n- Remaining: $${remaining.toFixed(4)}`;
}

export async function handleCurrentKey(client: OpenRouterClient): Promise<string> {
  const k = await client.request<KeyInfo>("GET", "/key");
  const flags = [
    k.is_management_key ? "management" : null,
    k.is_provisioning_key ? "provisioning" : null,
  ].filter(Boolean).join(", ") || "inference";
  const lines = [
    `Label: ${k.label}`,
    `Type: ${flags}`,
    `Limit: ${k.limit ?? "none"}`,
    `Usage: total=${k.usage}, day=${k.usage_daily ?? 0}, week=${k.usage_weekly ?? 0}, month=${k.usage_monthly ?? 0}`,
  ];
  if (k.expires_at) lines.push(`Expires: ${k.expires_at}`);
  return lines.join("\n");
}

export function registerCreditsTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_credits",
    "Show OpenRouter balance: total purchased, total used, remaining.",
    {},
    async () => ({ content: [{ type: "text" as const, text: await handleCredits(client) }] })
  );
  server.tool(
    "or_current_key",
    "Show metadata of the Provisioning key the server is using (label, type, limits, usage).",
    {},
    async () => ({ content: [{ type: "text" as const, text: await handleCurrentKey(client) }] })
  );
}
