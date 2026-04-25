import { describe, it, expect } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import { mockFetch } from "./helpers.js";
import { handleActivity } from "../src/tools/activity.js";

describe("or_activity", () => {
  it("rejects malformed date", async () => {
    const client = new OpenRouterClient("sk-or-v1-test");
    await expect(handleActivity(client, { date: "April 25" })).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("passes filters as query params", async () => {
    const { calls } = mockFetch([{
      status: 200,
      body: { data: [{ endpoint: "anthropic/claude-haiku-4.5", usage: 1.23, requests: 10 }] },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleActivity(client, { date: "2026-04-25", api_key_hash: "abc" });
    expect(calls[0].url).toContain("date=2026-04-25");
    expect(calls[0].url).toContain("api_key_hash=abc");
    expect(out).toContain("anthropic/claude-haiku-4.5");
    expect(out).toContain("1.23");
  });

  it("surfaces token counts and provider when present", async () => {
    mockFetch([{
      status: 200,
      body: {
        data: [{
          date: "2026-04-25 00:00:00",
          model: "z-ai/glm-4.6",
          provider_name: "venice/fp4",
          usage: 0.0230,
          requests: 3,
          prompt_tokens: 4919,
          completion_tokens: 7135,
          reasoning_tokens: 8577,
        }],
      },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleActivity(client, {});
    expect(out).toContain("z-ai/glm-4.6");
    expect(out).toContain("4,919");
    expect(out).toContain("7,135");
    expect(out).toContain("8,577");
    expect(out).toContain("venice/fp4");
    expect(out).toContain("2026-04-25");
  });

  it("aggregates by model when requested", async () => {
    mockFetch([{
      status: 200,
      body: {
        data: [
          { date: "2026-04-24", model: "haiku", usage: 0.5, requests: 3 },
          { date: "2026-04-25", model: "haiku", usage: 0.3, requests: 2 },
          { date: "2026-04-25", model: "mimo",  usage: 0.1, requests: 5 },
        ],
      },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleActivity(client, { aggregate: "by_model" });
    expect(out).toContain("By model");
    // haiku totals: $0.8 / 5 req / 2 rows
    const haikuLine = out.split("\n").find((l) => l.includes("haiku"))!;
    expect(haikuLine).toContain("$0.8000");
    expect(haikuLine).toContain("5 req");
    expect(haikuLine).toContain("2 rows");
  });

  it("aggregates by day when requested", async () => {
    mockFetch([{
      status: 200,
      body: {
        data: [
          { date: "2026-04-24", model: "a", usage: 1, requests: 1 },
          { date: "2026-04-24", model: "b", usage: 2, requests: 1 },
          { date: "2026-04-25", model: "c", usage: 4, requests: 1 },
        ],
      },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleActivity(client, { aggregate: "by_day" });
    expect(out).toContain("2026-04-24 $3.0000");
    expect(out).toContain("2026-04-25 $4.0000");
  });

  it("respects limit param", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      date: "2026-04-25",
      model: `m${i}`,
      usage: 60 - i,
      requests: 1,
    }));
    mockFetch([{ status: 200, body: { data: rows } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleActivity(client, { limit: 5 });
    // 60 rows, limit 5, expect "55 more rows"
    expect(out).toContain("55 more rows");
  });

  it("aggregates by api_key_hash when requested", async () => {
    mockFetch([{
      status: 200,
      body: {
        data: [
          { date: "2026-04-25", model: "haiku", api_key_hash: "k_alpha", usage: 0.5, requests: 3 },
          { date: "2026-04-25", model: "haiku", api_key_hash: "k_alpha", usage: 0.3, requests: 2 },
          { date: "2026-04-25", model: "grok",  api_key_hash: "k_beta",  usage: 0.1, requests: 5 },
        ],
      },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleActivity(client, { aggregate: "by_key" });
    expect(out).toContain("By api_key_hash");
    const alpha = out.split("\n").find((l) => l.includes("k_alpha"))!;
    expect(alpha).toContain("$0.8000");
    expect(alpha).toContain("5 req");
    expect(alpha).toContain("2 rows");
  });
});
