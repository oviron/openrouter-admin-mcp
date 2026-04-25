import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OpenRouterClient } from "../client.js";

interface GenerationData {
  id: string;
  total_cost: number;
  created_at?: string;
  model?: string;
  origin?: string;
  usage?: number;
  is_byok?: boolean;
  upstream_id?: string;
  cache_discount?: number | null;
  upstream_inference_cost?: number | null;
  app_id?: number | null;
  streamed?: boolean;
  cancelled?: boolean;
  provider_name?: string;
  latency?: number;
  moderation_latency?: number | null;
  generation_time?: number;
  finish_reason?: string;
  native_finish_reason?: string;
  tokens_prompt?: number;
  tokens_completion?: number;
  native_tokens_prompt?: number | null;
  native_tokens_completion?: number | null;
  native_tokens_reasoning?: number | null;
  native_tokens_cached?: number | null;
  num_media_prompt?: number | null;
  num_media_completion?: number | null;
  num_search_results?: number | null;
}

const money = (n: number | null | undefined): string =>
  n == null ? "—" : `$${Number(n).toFixed(6)}`;

const num = (n: number | null | undefined): string => (n == null ? "—" : String(n));

export async function handleGeneration(client: OpenRouterClient, id: string): Promise<string> {
  const g = await client.request<GenerationData>("GET", "/generation", {
    query: { id },
    noCache: true,
  });
  const lines: string[] = [];
  lines.push(`Generation \`${g.id}\``);
  if (g.model) lines.push(`Model: ${g.model}${g.provider_name ? ` (${g.provider_name})` : ""}`);
  if (g.created_at) lines.push(`Created: ${g.created_at}`);
  lines.push(`Cost: ${money(g.total_cost)}${g.is_byok ? " (BYOK)" : ""}`);
  if (g.upstream_inference_cost != null) {
    lines.push(`Upstream inference cost: ${money(g.upstream_inference_cost)}`);
  }
  if (g.cache_discount != null) lines.push(`Cache discount: ${money(g.cache_discount)}`);

  const tokens: string[] = [];
  if (g.tokens_prompt != null) tokens.push(`prompt=${num(g.tokens_prompt)}`);
  if (g.tokens_completion != null) tokens.push(`completion=${num(g.tokens_completion)}`);
  if (g.native_tokens_reasoning != null) {
    tokens.push(`reasoning=${num(g.native_tokens_reasoning)}`);
  }
  if (g.native_tokens_cached != null) tokens.push(`cached=${num(g.native_tokens_cached)}`);
  if (tokens.length > 0) lines.push(`Tokens: ${tokens.join(", ")}`);

  if (g.latency != null || g.generation_time != null) {
    const parts: string[] = [];
    if (g.latency != null) parts.push(`latency=${g.latency}ms`);
    if (g.generation_time != null) parts.push(`generation=${g.generation_time}ms`);
    if (g.moderation_latency != null) parts.push(`moderation=${g.moderation_latency}ms`);
    lines.push(`Timing: ${parts.join(", ")}`);
  }

  if (g.finish_reason) {
    const native = g.native_finish_reason ? ` (native: ${g.native_finish_reason})` : "";
    lines.push(`Finish: ${g.finish_reason}${native}`);
  }
  if (g.streamed) lines.push("Streamed: true");
  if (g.cancelled) lines.push("Cancelled: true");
  if (g.origin) lines.push(`Origin: ${g.origin}`);
  if (g.upstream_id) lines.push(`Upstream id: ${g.upstream_id}`);
  return lines.join("\n");
}

export function registerGenerationTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_generation",
    "Get details of a single inference call by its generation_id (returned by OpenRouter in completion responses, e.g. 'gen-abc123'). Returns cost, tokens, latency, finish reason, provider — useful when an agent needs to explain why a specific call cost what it did.",
    {
      id: z.string().min(1).describe("Generation ID returned by OpenRouter (e.g. 'gen-abc123')"),
    },
    async ({ id }) => ({
      content: [{ type: "text" as const, text: await handleGeneration(client, id) }],
    }),
  );
}
