import { describe, expect, it } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import {
  handleModel,
  handleModelEndpoints,
  handleModels,
  handleModelsUser,
  handleZdrEndpoints,
} from "../src/tools/models.js";
import { mockFetch } from "./helpers.js";

const KEY = "sk-or-v1-test";

const SAMPLE = [
  {
    id: "anthropic/claude-opus-4.7",
    canonical_slug: "anthropic/claude-opus-4.7",
    name: "Claude Opus 4.7",
    description: "Frontier model.",
    context_length: 200_000,
    architecture: {
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
      tokenizer: "Claude",
    },
    pricing: { prompt: "0.000015", completion: "0.000075" },
    top_provider: { context_length: 200_000, max_completion_tokens: 64_000, is_moderated: false },
    supported_parameters: ["tools", "reasoning"],
  },
  {
    id: "x-ai/grok-4.1-fast",
    name: "Grok 4.1 Fast",
    context_length: 1_000_000,
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    pricing: { prompt: "0.0000002", completion: "0.0000005" },
  },
];

describe("or_models", () => {
  it("lists models with per-1M pricing and context", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: SAMPLE } }]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    const out = await handleModels(client, {});
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/models");
    expect(out).toContain("anthropic/claude-opus-4.7");
    expect(out).toContain("in $15.00/M");
    expect(out).toContain("out $75.00/M");
    expect(out).toContain("200k ctx");
    expect(out).toContain("x-ai/grok-4.1-fast");
    expect(out).toContain("in $0.20/M");
  });

  it("forwards search and supported_parameters as query params", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: SAMPLE } }]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    await handleModels(client, { search: "opus", supported_parameters: "tools,reasoning" });
    expect(calls[0].url).toContain("search=opus");
    expect(calls[0].url).toContain("supported_parameters=tools%2Creasoning");
  });

  it("returns empty marker when no models match", async () => {
    mockFetch([{ status: 200, body: { data: [] } }]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    const out = await handleModels(client, { search: "nope" });
    expect(out).toBe("No models match.");
  });
});

describe("or_model_get", () => {
  it("returns full details for a known model", async () => {
    mockFetch([{ status: 200, body: { data: SAMPLE } }]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    const out = await handleModel(client, "anthropic/claude-opus-4.7");
    expect(out).toContain("Claude Opus 4.7");
    expect(out).toContain("Frontier model.");
    expect(out).toContain("Context: 200,000 tokens");
    expect(out).toContain("Max completion: 64,000 tokens");
    expect(out).toContain("Input: text, image");
    expect(out).toContain("Tokenizer: Claude");
    expect(out).toContain("Supported params: tools, reasoning");
  });

  it("returns 'not found' for unknown id", async () => {
    mockFetch([{ status: 200, body: { data: SAMPLE } }]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    const out = await handleModel(client, "no/such-model");
    expect(out).toContain("not found");
  });
});

describe("or_model_endpoints", () => {
  it("lists provider endpoints with uptime + pricing", async () => {
    const { calls } = mockFetch([
      {
        status: 200,
        body: {
          data: {
            id: "anthropic/claude-opus-4.7",
            endpoints: [
              {
                provider_name: "Anthropic",
                tag: "official",
                context_length: 200_000,
                pricing: { prompt: "0.000015", completion: "0.000075" },
                uptime_last_30m: 0.997,
                status: 200,
              },
              {
                provider_name: "AWS Bedrock",
                quantization: null,
                context_length: 200_000,
                pricing: { prompt: "0.000018", completion: "0.0001" },
                uptime_last_30m: 0.985,
              },
            ],
          },
        },
      },
    ]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleModelEndpoints(c, "anthropic", "claude-opus-4.7");
    expect(calls[0].url).toBe(
      "https://openrouter.ai/api/v1/models/anthropic/claude-opus-4.7/endpoints",
    );
    expect(out).toContain("Anthropic");
    expect(out).toContain("tag: official");
    expect(out).toContain("uptime 99.7%");
    expect(out).toContain("AWS Bedrock");
    expect(out).toContain("uptime 98.5%");
  });

  it("returns 'No endpoints' when array is empty", async () => {
    mockFetch([{ status: 200, body: { data: { id: "x/y", endpoints: [] } } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleModelEndpoints(c, "x", "y");
    expect(out).toContain("No endpoints for x/y");
  });
});

describe("or_models_user", () => {
  it("lists models filtered by account settings", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: SAMPLE } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleModelsUser(c);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/models/user");
    expect(out).toContain("Models available to this account (2)");
    expect(out).toContain("anthropic/claude-opus-4.7");
  });

  it("handles empty result", async () => {
    mockFetch([{ status: 200, body: { data: [] } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleModelsUser(c);
    expect(out).toContain("No models available");
  });
});

describe("or_zdr_endpoints", () => {
  it("lists ZDR-compliant models with endpoint counts", async () => {
    const { calls } = mockFetch([
      {
        status: 200,
        body: {
          data: [
            { id: "anthropic/claude-opus-4.7", endpoints: [{ provider_name: "Anthropic" }] },
            {
              id: "openai/gpt-5.1",
              endpoints: [{ provider_name: "OpenAI" }, { provider_name: "Azure" }],
            },
          ],
        },
      },
    ]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleZdrEndpoints(c);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/endpoints/zdr");
    expect(out).toContain("ZDR endpoints (2 models)");
    expect(out).toContain("anthropic/claude-opus-4.7** — 1 endpoint(s)");
    expect(out).toContain("openai/gpt-5.1** — 2 endpoint(s)");
  });

  it("handles empty list", async () => {
    mockFetch([{ status: 200, body: { data: [] } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleZdrEndpoints(c);
    expect(out).toBe("No ZDR-compliant endpoints.");
  });
});
