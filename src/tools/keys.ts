import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OpenRouterClient } from "../client.js";

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
  usage_weekly?: number;
  usage_monthly?: number;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateKeyResponse extends KeyEntry {
  key?: string;
}

const money = (n: number | null | undefined): string => (n == null ? "—" : `$${n.toFixed(2)}`);

function fmtKey(k: KeyEntry): string {
  const status = k.disabled ? " (disabled)" : "";
  let lim: string;
  if (k.limit !== null) {
    const reset = k.limit_reset ? ` ${k.limit_reset}` : "";
    lim = `limit ${money(k.limit)}${reset}, remaining ${money(k.limit_remaining)}`;
    // ⚠️ near-limit warning when remaining <10% of limit
    if (k.limit > 0 && k.limit_remaining !== null && k.limit_remaining < k.limit * 0.1) {
      lim += " ⚠️";
    }
  } else {
    lim = "no limit";
  }
  const exp = k.expires_at ? ` | expires ${k.expires_at.slice(0, 10)}` : "";
  return `- **${k.name}**${status} | usage ${money(k.usage)} | ${lim}${exp} | hash: \`${k.hash}\` | label: ${k.label}`;
}

export async function handleKeysList(
  client: OpenRouterClient,
  args: { include_disabled?: boolean; offset?: number },
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
  const limitLine =
    k.limit !== null
      ? `Limit: ${money(k.limit)}${k.limit_reset ? ` (resets ${k.limit_reset})` : ""} (remaining: ${money(k.limit_remaining)})`
      : "Limit: none";
  const lines = [
    `Name: ${k.name}`,
    `Label: ${k.label}`,
    `Hash: ${k.hash}`,
    `Disabled: ${k.disabled}`,
    limitLine,
    `Usage: total=${money(k.usage)}, day=${money(k.usage_daily)}, week=${money(k.usage_weekly)}, month=${money(k.usage_monthly)}`,
  ];
  if (k.expires_at) lines.push(`Expires: ${k.expires_at}`);
  // Near-limit warning in detailed view
  if (
    k.limit !== null &&
    k.limit > 0 &&
    k.limit_remaining !== null &&
    k.limit_remaining < k.limit * 0.1
  ) {
    lines.push(
      `⚠️  near limit: only ${money(k.limit_remaining)} remaining (${((100 * k.limit_remaining) / k.limit).toFixed(1)}%)`,
    );
  }
  lines.push(`Created: ${k.created_at}`);
  lines.push(`Updated: ${k.updated_at}`);
  return lines.join("\n");
}

const limitResetSchema = z.enum(["daily", "weekly", "monthly"]);

const createSchema = z.object({
  name: z.string().min(1, "name is required"),
  limit: z.number().nonnegative().optional(),
  limit_reset: limitResetSchema.optional(),
  expires_at: z.string().optional(),
  include_byok_in_limit: z.boolean().optional(),
});

export async function handleKeyCreate(
  client: OpenRouterClient,
  args: z.infer<typeof createSchema>,
): Promise<string> {
  const body = createSchema.parse(args);
  const r = await client.request<CreateKeyResponse>("POST", "/keys", { body });
  const lines = [`Created key **${r.name}**`, `Hash: ${r.hash}`, `Label: ${r.label}`];
  if (r.limit != null) {
    const reset = r.limit_reset ? ` (resets ${r.limit_reset})` : "";
    lines.push(`Limit: $${r.limit}${reset}`);
  }
  if (r.expires_at) lines.push(`Expires: ${r.expires_at}`);
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
  limit_reset: limitResetSchema.nullable().optional(),
  expires_at: z.string().nullable().optional(),
  include_byok_in_limit: z.boolean().optional(),
});

export async function handleKeyUpdate(
  client: OpenRouterClient,
  args: z.infer<typeof updateSchema>,
): Promise<string> {
  const { hash, ...rest } = updateSchema.parse(args);
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
  if (Object.keys(body).length === 0) {
    throw new Error("or_key_update: at least one field must be provided");
  }
  const r = await client.request<KeyEntry>("PATCH", `/keys/${encodeURIComponent(hash)}`, { body });
  const limStr =
    r.limit == null ? "none" : `${r.limit}${r.limit_reset ? ` (${r.limit_reset})` : ""}`;
  return `Updated **${r.name}** (hash: ${r.hash}). Disabled: ${r.disabled}. Limit: ${limStr}.`;
}

export async function handleKeyDelete(client: OpenRouterClient, hash: string): Promise<string> {
  await client.request("DELETE", `/keys/${encodeURIComponent(hash)}`);
  return `Deleted key with hash ${hash}.`;
}

export interface RegisterKeysOptions {
  /**
   * If false (default), destructive write tools (or_key_create, _update, _delete) are not
   * registered. Set OPENROUTER_ADMIN_ALLOW_WRITE=1 to opt in. This avoids accidental key
   * mutation through prompt-injected tool calls when only read access is intended.
   */
  allowWrite?: boolean;
}

export function registerKeysTools(
  server: McpServer,
  client: OpenRouterClient,
  options: RegisterKeysOptions = {},
) {
  // read — always available
  server.tool(
    "or_keys_list",
    "List all OpenRouter inference API keys with usage and limits.",
    {
      include_disabled: z.boolean().optional().default(true).describe("Include disabled keys"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleKeysList(client, args) }],
    }),
  );
  server.tool(
    "or_key_get",
    "Get details of one OpenRouter inference key by hash.",
    { hash: z.string().min(1).describe("Key hash from or_keys_list") },
    async ({ hash }) => ({
      content: [{ type: "text" as const, text: await handleKeyGet(client, hash) }],
    }),
  );

  // write — destructive — opt-in via OPENROUTER_ADMIN_ALLOW_WRITE
  if (!options.allowWrite) return;

  server.tool(
    "or_key_create",
    "Create a new OpenRouter inference API key. ⚠️ Destructive — confirm before running. The returned secret is shown ONCE and cannot be retrieved later.",
    {
      name: z.string().min(1).describe("Human-readable key name"),
      limit: z.number().nonnegative().optional().describe("Spending limit in USD"),
      limit_reset: limitResetSchema
        .optional()
        .describe(
          "Reset period for the limit: daily, weekly, monthly. Omit for cumulative-only limit.",
        ),
      expires_at: z
        .string()
        .optional()
        .describe(
          "ISO 8601 timestamp when the key expires (e.g., '2026-12-31T00:00:00Z'). Omit for no expiration.",
        ),
      include_byok_in_limit: z
        .boolean()
        .optional()
        .describe("Whether BYOK usage counts toward the limit"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleKeyCreate(client, args) }],
    }),
  );
  server.tool(
    "or_key_update",
    "Update an OpenRouter inference key (rename, disable, change limit/reset/expiration). ⚠️ Destructive — confirm before running.",
    {
      hash: z.string().min(1).describe("Key hash"),
      name: z.string().min(1).optional(),
      disabled: z.boolean().optional(),
      limit: z.number().nonnegative().nullable().optional().describe("USD limit; null to clear"),
      limit_reset: limitResetSchema
        .nullable()
        .optional()
        .describe("Reset period: daily/weekly/monthly; null to make limit cumulative again"),
      expires_at: z
        .string()
        .nullable()
        .optional()
        .describe("ISO 8601 expiration timestamp; null to remove expiration"),
      include_byok_in_limit: z.boolean().optional(),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleKeyUpdate(client, args) }],
    }),
  );
  server.tool(
    "or_key_delete",
    "Permanently delete an OpenRouter inference key. ⚠️ Destructive — confirm before running.",
    { hash: z.string().min(1).describe("Key hash to delete") },
    async ({ hash }) => ({
      content: [{ type: "text" as const, text: await handleKeyDelete(client, hash) }],
    }),
  );
}
