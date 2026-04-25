import { describe, it, expect } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import { mockFetch } from "./helpers.js";
import { handleKeysList, handleKeyGet } from "../src/tools/keys.js";

const KEY_FIXTURE = {
  hash: "abc123",
  name: "OpenClaw",
  label: "sk-or-v1-509...004",
  disabled: false,
  limit: 10,
  limit_remaining: 0,
  usage: 10.022741582,
  usage_daily: 0.5,
  usage_weekly: 6.4,
  usage_monthly: 10.0,
  created_at: "2026-04-01T13:42:33Z",
  updated_at: "2026-04-25T00:00:00Z",
};

describe("or_keys_list", () => {
  it("lists keys with usage and limits", async () => {
    mockFetch([{ status: 200, body: { data: [KEY_FIXTURE] } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeysList(client, { include_disabled: true });
    expect(out).toContain("OpenClaw");
    expect(out).toContain("10.02");
    expect(out).toContain("abc123");
  });

  it("filters disabled when include_disabled=false", async () => {
    const disabled = { ...KEY_FIXTURE, name: "Old", disabled: true, hash: "def" };
    mockFetch([{ status: 200, body: { data: [KEY_FIXTURE, disabled] } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeysList(client, { include_disabled: false });
    expect(out).toContain("OpenClaw");
    expect(out).not.toContain("Old");
  });
});

describe("or_key_get", () => {
  it("fetches by hash", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: KEY_FIXTURE } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeyGet(client, "abc123");
    expect(calls[0].url).toContain("/keys/abc123");
    expect(out).toContain("OpenClaw");
  });
});
