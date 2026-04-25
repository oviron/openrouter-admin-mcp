import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenRouterClient } from "../client.js";

interface KeyEntry {
  hash: string;
  name: string;
  label: string;
  disabled: boolean;
  limit: number | null;
  limit_remaining: number | null;
  usage: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  created_at: string;
  updated_at: string;
}

function fmtKey(k: KeyEntry): string {
  const status = k.disabled ? " (disabled)" : "";
  const lim = k.limit !== null ? `limit $${k.limit}, remaining $${k.limit_remaining}` : "no limit";
  return `- **${k.name}**${status} | usage $${k.usage.toFixed(2)} | ${lim} | hash: \`${k.hash}\` | label: ${k.label}`;
}

export async function handleKeysList(
  client: OpenRouterClient,
  args: { include_disabled?: boolean; offset?: number }
): Promise<string> {
  const data = await client.request<KeyEntry[]>("GET", "/keys", {
    query: { offset: args.offset },
  });
  const filtered = args.include_disabled === false ? data.filter((k) => !k.disabled) : data;
  if (filtered.length === 0) return "No keys.";
  return `Keys (${filtered.length}):\n\n${filtered.map(fmtKey).join("\n")}`;
}

export async function handleKeyGet(client: OpenRouterClient, hash: string): Promise<string> {
  const k = await client.request<KeyEntry>("GET", `/keys/${encodeURIComponent(hash)}`);
  return [
    `Name: ${k.name}`,
    `Label: ${k.label}`,
    `Hash: ${k.hash}`,
    `Disabled: ${k.disabled}`,
    `Limit: ${k.limit ?? "none"} (remaining: ${k.limit_remaining ?? "—"})`,
    `Usage: total=$${k.usage}, day=$${k.usage_daily ?? 0}, week=$${k.usage_weekly ?? 0}, month=$${k.usage_monthly ?? 0}`,
    `Created: ${k.created_at}`,
    `Updated: ${k.updated_at}`,
  ].join("\n");
}

export function registerKeysReadTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_keys_list",
    "List all OpenRouter inference API keys with usage and limits.",
    {
      include_disabled: z.boolean().optional().default(true).describe("Include disabled keys"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
    },
    async (args) => ({ content: [{ type: "text" as const, text: await handleKeysList(client, args) }] })
  );
  server.tool(
    "or_key_get",
    "Get details of one OpenRouter inference key by hash.",
    { hash: z.string().min(1).describe("Key hash from or_keys_list") },
    async ({ hash }) => ({ content: [{ type: "text" as const, text: await handleKeyGet(client, hash) }] })
  );
}
