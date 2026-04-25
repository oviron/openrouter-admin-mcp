import { describe, it, expect } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import { mockFetch } from "./helpers.js";
import { handleOverview } from "../src/tools/overview.js";

describe("or_overview", () => {
  it("combines credits + keys + today's activity into one response", async () => {
    mockFetch([
      // /credits
      { status: 200, body: { data: { total_credits: 15, total_usage: 13.62 } } },
      // /keys
      {
        status: 200,
        body: {
          data: [
            {
              hash: "h1",
              name: "OpenClaw 2",
              label: "sk-or-v1-5ae...",
              disabled: false,
              limit: 0.3,
              limit_remaining: 0.29,
              limit_reset: "daily",
              usage: 0.01,
              usage_daily: 0.01,
              expires_at: null,
            },
            {
              hash: "h2",
              name: "Claude",
              label: "sk-or-v1-721...",
              disabled: false,
              limit: 1,
              limit_remaining: 0.22,
              usage: 0.78,
              usage_daily: 0,
            },
          ],
        },
      },
      // /activity
      {
        status: 200,
        body: {
          data: [
            { date: "2026-04-25", model: "x-ai/grok-4.1-fast", usage: 0.05, requests: 12 },
            { date: "2026-04-25", model: "anthropic/claude-haiku-4.5", usage: 0.02, requests: 3 },
          ],
        },
      },
    ]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleOverview(client);

    // Account section
    expect(out).toContain("$1.38");          // 15 - 13.62
    expect(out).toContain("$15.00");
    expect(out).toContain("$13.62");

    // Keys section: 2 active, daily reset shown, OpenClaw 2 visible
    expect(out).toContain("Keys (2 active)");
    expect(out).toContain("OpenClaw 2");
    expect(out).toContain("daily");
    expect(out).toContain("Claude");

    // Today section
    expect(out).toContain("Today (UTC");
    expect(out).toContain("x-ai/grok-4.1-fast");
    expect(out).toContain("anthropic/claude-haiku-4.5");
    expect(out).toContain("12 req");
  });

  it("handles empty activity gracefully", async () => {
    mockFetch([
      { status: 200, body: { data: { total_credits: 5, total_usage: 0 } } },
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: [] } },
    ]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleOverview(client);
    expect(out).toContain("no activity yet");
  });

  it("flags near-limit key in overview", async () => {
    mockFetch([
      { status: 200, body: { data: { total_credits: 10, total_usage: 0 } } },
      {
        status: 200,
        body: {
          data: [{
            hash: "h1",
            name: "Burnt",
            label: "sk-...",
            disabled: false,
            limit: 1.0,
            limit_remaining: 0.05,
            usage: 0.95,
            usage_daily: 0.95,
          }],
        },
      },
      { status: 200, body: { data: [] } },
    ]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleOverview(client);
    expect(out).toContain("⚠️");
  });

  it("does not crash when /activity returns an error", async () => {
    mockFetch([
      { status: 200, body: { data: { total_credits: 5, total_usage: 1 } } },
      { status: 200, body: { data: [{ hash: "x", name: "k", label: "l", disabled: false, limit: null, limit_remaining: null, usage: 1 }] } },
      { status: 500, body: { error: "boom" } },
    ]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleOverview(client);
    expect(out).toContain("$5.00");
    expect(out).toContain("Today");
    expect(out).toContain("no activity yet");
  });
});
