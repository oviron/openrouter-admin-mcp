import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OpenRouterClient } from "../client.js";

interface Guardrail {
  id: string;
  name?: string;
  description?: string | null;
  limit_usd?: number | null;
  reset_interval?: "daily" | "weekly" | "monthly" | null;
  allowed_providers?: string[] | null;
  ignored_providers?: string[] | null;
  allowed_models?: string[] | null;
  ignored_models?: string[] | null;
  enforce_zdr?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface KeyAssignment {
  guardrail_id: string;
  api_key_hash: string;
  api_key_name?: string;
}

interface MemberAssignment {
  guardrail_id: string;
  user_id: string;
  member_email?: string;
}

const money = (n: number | null | undefined): string =>
  n == null ? "—" : `$${Number(n).toFixed(2)}`;

function fmtGuardrail(g: Guardrail): string {
  const parts: string[] = [`**${g.name ?? g.id}** (id: \`${g.id}\`)`];
  if (g.limit_usd != null) {
    const reset = g.reset_interval ?? "no reset";
    parts.push(`limit ${money(g.limit_usd)} (${reset})`);
  } else {
    parts.push("no spend limit");
  }
  if (g.enforce_zdr) parts.push("ZDR enforced");
  if (g.allowed_providers?.length) parts.push(`providers⊆[${g.allowed_providers.join(",")}]`);
  if (g.ignored_providers?.length) parts.push(`providers∌[${g.ignored_providers.join(",")}]`);
  if (g.allowed_models?.length) parts.push(`models⊆[${g.allowed_models.join(",")}]`);
  if (g.ignored_models?.length) parts.push(`models∌[${g.ignored_models.join(",")}]`);
  return `- ${parts.join(" | ")}`;
}

function fmtGuardrailDetailed(g: Guardrail): string {
  const lines: string[] = [`**${g.name ?? g.id}**`, `Id: \`${g.id}\``];
  if (g.description) lines.push(`Description: ${g.description}`);
  if (g.limit_usd != null) {
    lines.push(
      `Limit: ${money(g.limit_usd)}${g.reset_interval ? ` (resets ${g.reset_interval})` : ""}`,
    );
  } else {
    lines.push("Limit: none");
  }
  if (g.enforce_zdr) lines.push("ZDR: enforced");
  if (g.allowed_providers != null) {
    lines.push(
      `Allowed providers: ${g.allowed_providers.length ? g.allowed_providers.join(", ") : "(empty allowlist)"}`,
    );
  }
  if (g.ignored_providers?.length)
    lines.push(`Ignored providers: ${g.ignored_providers.join(", ")}`);
  if (g.allowed_models != null) {
    lines.push(
      `Allowed models: ${g.allowed_models.length ? g.allowed_models.join(", ") : "(empty allowlist)"}`,
    );
  }
  if (g.ignored_models?.length) lines.push(`Ignored models: ${g.ignored_models.join(", ")}`);
  if (g.created_at) lines.push(`Created: ${g.created_at}`);
  if (g.updated_at) lines.push(`Updated: ${g.updated_at}`);
  return lines.join("\n");
}

export async function handleGuardrailsList(client: OpenRouterClient): Promise<string> {
  const data = await client.request<Guardrail[]>("GET", "/guardrails");
  if (data.length === 0) return "No guardrails configured.";
  return `Guardrails (${data.length}):\n\n${data.map(fmtGuardrail).join("\n")}`;
}

export async function handleGuardrailGet(client: OpenRouterClient, id: string): Promise<string> {
  const g = await client.request<Guardrail>("GET", `/guardrails/${encodeURIComponent(id)}`);
  return fmtGuardrailDetailed(g);
}

const resetIntervalSchema = z.enum(["daily", "weekly", "monthly"]);

const createSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().optional(),
  limit_usd: z.number().nonnegative().optional(),
  reset_interval: resetIntervalSchema.optional(),
  allowed_providers: z.array(z.string()).optional(),
  ignored_providers: z.array(z.string()).optional(),
  allowed_models: z.array(z.string()).optional(),
  ignored_models: z.array(z.string()).optional(),
  enforce_zdr: z.boolean().optional(),
});

export async function handleGuardrailCreate(
  client: OpenRouterClient,
  args: z.infer<typeof createSchema>,
): Promise<string> {
  const body = createSchema.parse(args);
  const g = await client.request<Guardrail>("POST", "/guardrails", { body });
  return `Created guardrail \`${g.id}\` (${g.name ?? "unnamed"}).`;
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  limit_usd: z.number().nonnegative().nullable().optional(),
  reset_interval: resetIntervalSchema.nullable().optional(),
  allowed_providers: z.array(z.string()).nullable().optional(),
  ignored_providers: z.array(z.string()).nullable().optional(),
  allowed_models: z.array(z.string()).nullable().optional(),
  ignored_models: z.array(z.string()).nullable().optional(),
  enforce_zdr: z.boolean().optional(),
});

export async function handleGuardrailUpdate(
  client: OpenRouterClient,
  args: z.infer<typeof updateSchema>,
): Promise<string> {
  const { id, ...rest } = updateSchema.parse(args);
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
  if (Object.keys(body).length === 0) {
    throw new Error("or_guardrail_update: at least one field must be provided");
  }
  const g = await client.request<Guardrail>("PATCH", `/guardrails/${encodeURIComponent(id)}`, {
    body,
  });
  return `Updated guardrail \`${g.id}\` (${g.name ?? "unnamed"}).`;
}

export async function handleGuardrailDelete(client: OpenRouterClient, id: string): Promise<string> {
  await client.request("DELETE", `/guardrails/${encodeURIComponent(id)}`);
  return `Deleted guardrail \`${id}\`.`;
}

const bulkAssignSchema = z.object({
  id: z.string().min(1),
  hashes: z.array(z.string().min(1)).min(1, "at least one key hash required"),
});

const bulkAssignMembersSchema = z.object({
  id: z.string().min(1),
  user_ids: z.array(z.string().min(1)).min(1, "at least one user_id required"),
});

export async function handleAssignKeys(
  client: OpenRouterClient,
  args: z.infer<typeof bulkAssignSchema>,
): Promise<string> {
  const { id, hashes } = bulkAssignSchema.parse(args);
  await client.request("POST", `/guardrails/${encodeURIComponent(id)}/keys/bulk-assign`, {
    body: { api_key_hashes: hashes },
  });
  return `Assigned guardrail \`${id}\` to ${hashes.length} key(s).`;
}

export async function handleUnassignKeys(
  client: OpenRouterClient,
  args: z.infer<typeof bulkAssignSchema>,
): Promise<string> {
  const { id, hashes } = bulkAssignSchema.parse(args);
  await client.request("POST", `/guardrails/${encodeURIComponent(id)}/keys/bulk-unassign`, {
    body: { api_key_hashes: hashes },
  });
  return `Unassigned guardrail \`${id}\` from ${hashes.length} key(s).`;
}

export async function handleAssignMembers(
  client: OpenRouterClient,
  args: z.infer<typeof bulkAssignMembersSchema>,
): Promise<string> {
  const { id, user_ids } = bulkAssignMembersSchema.parse(args);
  await client.request("POST", `/guardrails/${encodeURIComponent(id)}/members/bulk-assign`, {
    body: { user_ids },
  });
  return `Assigned guardrail \`${id}\` to ${user_ids.length} member(s).`;
}

export async function handleUnassignMembers(
  client: OpenRouterClient,
  args: z.infer<typeof bulkAssignMembersSchema>,
): Promise<string> {
  const { id, user_ids } = bulkAssignMembersSchema.parse(args);
  await client.request("POST", `/guardrails/${encodeURIComponent(id)}/members/bulk-unassign`, {
    body: { user_ids },
  });
  return `Unassigned guardrail \`${id}\` from ${user_ids.length} member(s).`;
}

export async function handleAssignmentsOverview(client: OpenRouterClient): Promise<string> {
  const [keyAssigns, memberAssigns] = await Promise.all([
    client.request<KeyAssignment[]>("GET", "/guardrails/key-assignments"),
    client.request<MemberAssignment[]>("GET", "/guardrails/member-assignments"),
  ]);

  const keysByGuardrail = new Map<string, KeyAssignment[]>();
  for (const a of keyAssigns) {
    const arr = keysByGuardrail.get(a.guardrail_id) ?? [];
    arr.push(a);
    keysByGuardrail.set(a.guardrail_id, arr);
  }
  const membersByGuardrail = new Map<string, MemberAssignment[]>();
  for (const a of memberAssigns) {
    const arr = membersByGuardrail.get(a.guardrail_id) ?? [];
    arr.push(a);
    membersByGuardrail.set(a.guardrail_id, arr);
  }

  const allIds = new Set<string>([...keysByGuardrail.keys(), ...membersByGuardrail.keys()]);
  if (allIds.size === 0) return "No guardrail assignments.";

  const lines: string[] = [
    `Guardrail assignments: ${keyAssigns.length} key(s), ${memberAssigns.length} member(s) across ${allIds.size} guardrail(s)`,
    "",
  ];
  for (const id of Array.from(allIds).sort()) {
    const keys = keysByGuardrail.get(id) ?? [];
    const members = membersByGuardrail.get(id) ?? [];
    lines.push(`Guardrail \`${id}\`:`);
    if (keys.length > 0) {
      lines.push(
        `  keys (${keys.length}): ${keys.map((k) => k.api_key_name ?? k.api_key_hash).join(", ")}`,
      );
    }
    if (members.length > 0) {
      lines.push(
        `  members (${members.length}): ${members.map((m) => m.member_email ?? m.user_id).join(", ")}`,
      );
    }
  }
  return lines.join("\n");
}

export interface RegisterGuardrailsOptions {
  /** Mirror of the keys-tools opt-in. Default false: only read tools registered. */
  allowWrite?: boolean;
}

export function registerGuardrailsTools(
  server: McpServer,
  client: OpenRouterClient,
  options: RegisterGuardrailsOptions = {},
) {
  // read — always available
  server.tool(
    "or_guardrails_list",
    "List all OpenRouter guardrails (account-wide spending limits and provider/model allowlists).",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await handleGuardrailsList(client) }],
    }),
  );
  server.tool(
    "or_guardrail_get",
    "Get details of one guardrail by id: limit_usd, reset_interval, allowed/ignored providers/models, enforce_zdr.",
    { id: z.string().min(1).describe("Guardrail id from or_guardrails_list") },
    async ({ id }) => ({
      content: [{ type: "text" as const, text: await handleGuardrailGet(client, id) }],
    }),
  );
  server.tool(
    "or_guardrails_assignments",
    "One-shot view of all guardrail assignments: which keys and which org members are bound to which guardrail. Combines /guardrails/key-assignments and /guardrails/member-assignments.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await handleAssignmentsOverview(client) }],
    }),
  );

  // write — destructive — opt-in
  if (!options.allowWrite) return;

  server.tool(
    "or_guardrail_create",
    "Create a new guardrail. Combine spend limit (limit_usd + reset_interval) with provider/model allowlists. Destructive — confirm before running.",
    {
      name: z.string().min(1).describe("Human-readable guardrail name"),
      description: z.string().optional(),
      limit_usd: z
        .number()
        .nonnegative()
        .optional()
        .describe("USD spending limit. Omit for no limit."),
      reset_interval: resetIntervalSchema
        .optional()
        .describe("Reset cadence for the limit: daily/weekly/monthly. Omit for cumulative limit."),
      allowed_providers: z
        .array(z.string())
        .optional()
        .describe("Allowlist of provider names; empty array means no provider is allowed."),
      ignored_providers: z.array(z.string()).optional().describe("Blocklist of provider names."),
      allowed_models: z.array(z.string()).optional().describe("Allowlist of model ids."),
      ignored_models: z.array(z.string()).optional().describe("Blocklist of model ids."),
      enforce_zdr: z
        .boolean()
        .optional()
        .describe("If true, only ZDR endpoints are allowed under this guardrail."),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleGuardrailCreate(client, args) }],
    }),
  );
  server.tool(
    "or_guardrail_update",
    "Update an existing guardrail. Pass null to clear nullable fields. Destructive — confirm before running.",
    {
      id: z.string().min(1).describe("Guardrail id"),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      limit_usd: z.number().nonnegative().nullable().optional(),
      reset_interval: resetIntervalSchema.nullable().optional(),
      allowed_providers: z.array(z.string()).nullable().optional(),
      ignored_providers: z.array(z.string()).nullable().optional(),
      allowed_models: z.array(z.string()).nullable().optional(),
      ignored_models: z.array(z.string()).nullable().optional(),
      enforce_zdr: z.boolean().optional(),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleGuardrailUpdate(client, args) }],
    }),
  );
  server.tool(
    "or_guardrail_delete",
    "Permanently delete a guardrail. Existing assignments will detach. Destructive — confirm before running.",
    { id: z.string().min(1).describe("Guardrail id to delete") },
    async ({ id }) => ({
      content: [{ type: "text" as const, text: await handleGuardrailDelete(client, id) }],
    }),
  );
  server.tool(
    "or_guardrail_assign_keys",
    "Bulk-assign a guardrail to a set of inference keys (by hash). Destructive — confirm.",
    {
      id: z.string().min(1).describe("Guardrail id"),
      hashes: z.array(z.string().min(1)).min(1).describe("Inference key hashes to bind"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleAssignKeys(client, args) }],
    }),
  );
  server.tool(
    "or_guardrail_unassign_keys",
    "Bulk-unassign a guardrail from a set of inference keys (by hash). Destructive — confirm.",
    {
      id: z.string().min(1).describe("Guardrail id"),
      hashes: z.array(z.string().min(1)).min(1).describe("Inference key hashes to unbind"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleUnassignKeys(client, args) }],
    }),
  );
  server.tool(
    "or_guardrail_assign_members",
    "Bulk-assign a guardrail to a set of organization members (by user_id). Destructive — confirm.",
    {
      id: z.string().min(1).describe("Guardrail id"),
      user_ids: z.array(z.string().min(1)).min(1).describe("Org member user_ids"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleAssignMembers(client, args) }],
    }),
  );
  server.tool(
    "or_guardrail_unassign_members",
    "Bulk-unassign a guardrail from organization members (by user_id). Destructive — confirm.",
    {
      id: z.string().min(1).describe("Guardrail id"),
      user_ids: z.array(z.string().min(1)).min(1).describe("Org member user_ids"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleUnassignMembers(client, args) }],
    }),
  );
}
