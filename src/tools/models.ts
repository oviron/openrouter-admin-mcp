import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OpenRouterClient } from "../client.js";

interface Pricing {
  prompt?: string;
  completion?: string;
  request?: string;
  image?: string;
  web_search?: string;
  internal_reasoning?: string;
  input_cache_read?: string;
  input_cache_write?: string;
}

interface ModelEntry {
  id: string;
  canonical_slug?: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
  };
  pricing?: Pricing;
  top_provider?: {
    context_length?: number | null;
    max_completion_tokens?: number | null;
    is_moderated?: boolean;
  };
  supported_parameters?: string[];
}

const fmtPricing = (p: Pricing | undefined): string => {
  if (!p) return "—";
  const parts: string[] = [];
  // OpenRouter prices are USD per token (string). Multiply by 1e6 to get USD/1M.
  const perMil = (s: string | undefined) => {
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const v = n * 1_000_000;
    return v < 0.01 ? v.toFixed(4) : v.toFixed(2);
  };
  const prompt = perMil(p.prompt);
  const completion = perMil(p.completion);
  if (prompt != null) parts.push(`in $${prompt}/M`);
  if (completion != null) parts.push(`out $${completion}/M`);
  if (p.request) parts.push(`per-request $${p.request}`);
  if (p.image) parts.push(`image $${p.image}`);
  if (p.web_search) parts.push(`search $${p.web_search}`);
  return parts.join(" · ") || "—";
};

export async function handleModels(
  client: OpenRouterClient,
  args: { search?: string; supported_parameters?: string; output_modalities?: string },
): Promise<string> {
  const data = await client.request<ModelEntry[]>("GET", "/models", { query: args });
  if (data.length === 0) return "No models match.";
  const lines: string[] = [`Models (${data.length}):`, ""];
  for (const m of data) {
    const ctx = m.context_length ? ` | ${(m.context_length / 1000).toFixed(0)}k ctx` : "";
    const mods = m.architecture?.output_modalities?.join("/") ?? "text";
    lines.push(`- **${m.id}** | ${fmtPricing(m.pricing)}${ctx} | ${mods}`);
  }
  return lines.join("\n");
}

export async function handleModel(client: OpenRouterClient, id: string): Promise<string> {
  // /models returns the catalog; we fetch all and filter by id locally.
  const all = await client.request<ModelEntry[]>("GET", "/models");
  const m = all.find((x) => x.id === id || x.canonical_slug === id);
  if (!m) return `Model not found: ${id}`;

  const lines: string[] = [];
  lines.push(`**${m.id}**${m.name && m.name !== m.id ? ` (${m.name})` : ""}`);
  if (m.description) lines.push("", m.description);
  lines.push("");
  if (m.context_length) lines.push(`Context: ${m.context_length.toLocaleString()} tokens`);
  if (m.top_provider?.max_completion_tokens) {
    lines.push(`Max completion: ${m.top_provider.max_completion_tokens.toLocaleString()} tokens`);
  }
  if (m.architecture) {
    const a = m.architecture;
    if (a.input_modalities) lines.push(`Input: ${a.input_modalities.join(", ")}`);
    if (a.output_modalities) lines.push(`Output: ${a.output_modalities.join(", ")}`);
    if (a.tokenizer) lines.push(`Tokenizer: ${a.tokenizer}`);
  }
  if (m.pricing) lines.push(`Pricing: ${fmtPricing(m.pricing)}`);
  if (m.supported_parameters && m.supported_parameters.length > 0) {
    lines.push(`Supported params: ${m.supported_parameters.join(", ")}`);
  }
  return lines.join("\n");
}

export function registerModelsTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_models",
    "List OpenRouter model catalog with pricing per 1M tokens, context length, and modalities. Use this to compare models or look up current prices. Filter via search/supported_parameters/output_modalities.",
    {
      search: z.string().optional().describe("Substring search over model id/name"),
      supported_parameters: z
        .string()
        .optional()
        .describe(
          "Comma-separated list of required parameters (e.g. 'tools,reasoning'). OR-side filter.",
        ),
      output_modalities: z
        .string()
        .optional()
        .describe("Comma-separated modalities (e.g. 'text,image'). OR-side filter."),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleModels(client, args) }],
    }),
  );
  server.tool(
    "or_model_get",
    "Get full details of a single model by id (e.g. 'anthropic/claude-opus-4.7'): description, context, modalities, pricing, supported parameters.",
    { id: z.string().min(1).describe("Model id (e.g. 'anthropic/claude-opus-4.7')") },
    async ({ id }) => ({
      content: [{ type: "text" as const, text: await handleModel(client, id) }],
    }),
  );
}
