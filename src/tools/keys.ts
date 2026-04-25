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

interface CreateKeyResponse extends KeyEntry { key?: string; }

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
  const money = (n: number) => `$${n.toFixed(2)}`;
  return [
    `Name: ${k.name}`,
    `Label: ${k.label}`,
    `Hash: ${k.hash}`,
    `Disabled: ${k.disabled}`,
    `Limit: ${k.limit ?? "none"} (remaining: ${k.limit_remaining ?? "—"})`,
    `Usage: total=${money(k.usage)}, day=${money(k.usage_daily ?? 0)}, week=${money(k.usage_weekly ?? 0)}, month=${money(k.usage_monthly ?? 0)}`,
    `Created: ${k.created_at}`,
    `Updated: ${k.updated_at}`,
  ].join("\n");
}

const createSchema = z.object({
  name: z.string().min(1, "name is required"),
  limit: z.number().nonnegative().optional(),
  include_byok_in_limit: z.boolean().optional(),
});

export async function handleKeyCreate(
  client: OpenRouterClient,
  args: z.infer<typeof createSchema>
): Promise<string> {
  const body = createSchema.parse(args);
  const r = await client.request<CreateKeyResponse>("POST", "/keys", { body });
  const lines = [
    `Created key **${r.name}**`,
    `Hash: ${r.hash}`,
    `Label: ${r.label}`,
  ];
  if (r.limit != null) lines.push(`Limit: $${r.limit}`);
  if (r.key) {
    lines.push("");
    lines.push(`Secret: \`${r.key}\``);
    lines.push("⚠️ This secret cannot be retrieved later — store it now.");
  }
  return lines.join("\n");
}

const updateSchema = z.object({
  hash: z.string().min(1),
  name: z.string().min(1).optional(),
  disabled: z.boolean().optional(),
  limit: z.number().nonnegative().nullable().optional(),
  include_byok_in_limit: z.boolean().optional(),
});

export async function handleKeyUpdate(
  client: OpenRouterClient,
  args: z.infer<typeof updateSchema>
): Promise<string> {
  const { hash, ...rest } = updateSchema.parse(args);
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
  if (Object.keys(body).length === 0) {
    throw new Error("or_key_update: at least one field must be provided");
  }
  const r = await client.request<KeyEntry>(
    "PATCH",
    `/keys/${encodeURIComponent(hash)}`,
    { body }
  );
  return `Updated **${r.name}** (hash: ${r.hash}). Disabled: ${r.disabled}. Limit: ${r.limit ?? "none"}.`;
}

export async function handleKeyDelete(client: OpenRouterClient, hash: string): Promise<string> {
  await client.request("DELETE", `/keys/${encodeURIComponent(hash)}`);
  return `Deleted key with hash ${hash}.`;
}

export function registerKeysTools(server: McpServer, client: OpenRouterClient) {
  // read
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

  // write — destructive
  server.tool(
    "or_key_create",
    "Create a new OpenRouter inference API key. ⚠️ Destructive — confirm before running. The returned secret is shown ONCE and cannot be retrieved later.",
    {
      name: z.string().min(1).describe("Human-readable key name"),
      limit: z.number().nonnegative().optional().describe("Spending limit in USD"),
      include_byok_in_limit: z.boolean().optional().describe("Whether BYOK usage counts toward the limit"),
    },
    async (args) => ({ content: [{ type: "text" as const, text: await handleKeyCreate(client, args) }] })
  );
  server.tool(
    "or_key_update",
    "Update an OpenRouter inference key (rename, disable, change limit). ⚠️ Destructive — confirm before running.",
    {
      hash: z.string().min(1).describe("Key hash"),
      name: z.string().min(1).optional(),
      disabled: z.boolean().optional(),
      limit: z.number().nonnegative().nullable().optional().describe("USD limit; null to clear"),
      include_byok_in_limit: z.boolean().optional(),
    },
    async (args) => ({ content: [{ type: "text" as const, text: await handleKeyUpdate(client, args) }] })
  );
  server.tool(
    "or_key_delete",
    "Permanently delete an OpenRouter inference key. ⚠️ Destructive — confirm before running.",
    { hash: z.string().min(1).describe("Key hash to delete") },
    async ({ hash }) => ({ content: [{ type: "text" as const, text: await handleKeyDelete(client, hash) }] })
  );
}
