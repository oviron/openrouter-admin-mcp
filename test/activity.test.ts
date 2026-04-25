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
});
