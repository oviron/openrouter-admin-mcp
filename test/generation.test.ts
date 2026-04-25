import { describe, expect, it } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import { handleGeneration } from "../src/tools/generation.js";
import { mockFetch } from "./helpers.js";

const KEY = "sk-or-v1-test";

describe("or_generation", () => {
  it("fetches by id with query string and bypasses cache", async () => {
    const { calls } = mockFetch([
      {
        status: 200,
        body: {
          data: {
            id: "gen-abc123",
            total_cost: 0.0123,
            model: "anthropic/claude-opus-4.7",
            provider_name: "Anthropic",
            tokens_prompt: 1200,
            tokens_completion: 350,
            native_tokens_reasoning: 100,
            latency: 4500,
            generation_time: 6200,
            finish_reason: "stop",
          },
        },
      },
      {
        status: 200,
        body: { data: { id: "gen-abc123", total_cost: 0.99 } },
      },
    ]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    const out = await handleGeneration(client, "gen-abc123");
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/generation?id=gen-abc123");
    expect(out).toContain("gen-abc123");
    expect(out).toContain("anthropic/claude-opus-4.7");
    expect(out).toContain("Anthropic");
    expect(out).toContain("$0.012300");
    expect(out).toContain("prompt=1200");
    expect(out).toContain("completion=350");
    expect(out).toContain("reasoning=100");
    expect(out).toContain("latency=4500ms");
    expect(out).toContain("Finish: stop");
    // Second call must hit upstream because /generation is never cached.
    const out2 = await handleGeneration(client, "gen-abc123");
    expect(out2).toContain("$0.990000");
    expect(calls.length).toBe(2);
  });

  it("renders BYOK marker when is_byok=true", async () => {
    mockFetch([
      {
        status: 200,
        body: {
          data: { id: "gen-1", total_cost: 0, model: "x/y", is_byok: true },
        },
      },
    ]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    const out = await handleGeneration(client, "gen-1");
    expect(out).toContain("(BYOK)");
  });

  it("omits absent optional fields", async () => {
    mockFetch([
      {
        status: 200,
        body: { data: { id: "gen-2", total_cost: 0.001 } },
      },
    ]);
    const client = new OpenRouterClient(KEY, { maxRetries: 0 });
    const out = await handleGeneration(client, "gen-2");
    expect(out).not.toContain("Model:");
    expect(out).not.toContain("Tokens:");
    expect(out).not.toContain("Finish:");
  });
});
