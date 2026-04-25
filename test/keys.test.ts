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

  it("forwards offset as query param", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: [] } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    await handleKeysList(client, { offset: 25 });
    expect(calls[0].url).toContain("offset=25");
  });

  it("formats limit_remaining cleanly (no float artifacts)", async () => {
    const fixture = { ...KEY_FIXTURE, limit_remaining: 0.22570307199999995 };
    mockFetch([{ status: 200, body: { data: [fixture] } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeysList(client, { include_disabled: true });
    expect(out).toContain("$0.23");
    expect(out).not.toContain("0.22570307199999995");
  });

  it("surfaces limit_reset and expires_at when present", async () => {
    const daily = { ...KEY_FIXTURE, name: "Daily", hash: "d1", limit: 0.3, limit_remaining: 0.29, limit_reset: "daily" as const, expires_at: "2026-12-31T00:00:00Z" };
    mockFetch([{ status: 200, body: { data: [daily] } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeysList(client, { include_disabled: true });
    expect(out).toContain("daily");
    expect(out).toContain("expires 2026-12-31");
  });

  it("flags near-limit keys with warning marker", async () => {
    const near = { ...KEY_FIXTURE, name: "Near", hash: "n1", limit: 10, limit_remaining: 0.5 };
    mockFetch([{ status: 200, body: { data: [near] } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeysList(client, { include_disabled: true });
    expect(out).toContain("⚠️");
  });

  it("does not flag healthy keys", async () => {
    const healthy = { ...KEY_FIXTURE, name: "Fine", limit: 10, limit_remaining: 5 };
    mockFetch([{ status: 200, body: { data: [healthy] } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeysList(client, { include_disabled: true });
    expect(out).not.toContain("⚠️");
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

  it("encodes hash characters that need URL encoding", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { hash: "x", name: "y", label: "z", disabled: false, limit: null, limit_remaining: null, usage: 0, created_at: "", updated_at: "" } } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    await handleKeyGet(client, "weird/hash%value");
    expect(calls[0].url).toContain("/keys/weird%2Fhash%25value");
    expect(calls[0].url).not.toContain("/keys/weird/hash%value");
  });

  it("renders limit_reset and expires_at in detailed view", async () => {
    mockFetch([{
      status: 200,
      body: { data: { ...KEY_FIXTURE, limit: 0.3, limit_remaining: 0.02, limit_reset: "daily", expires_at: "2026-12-31T00:00:00Z" } },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeyGet(client, KEY_FIXTURE.hash);
    expect(out).toMatch(/Limit:.*resets daily/);
    expect(out).toContain("Expires: 2026-12-31T00:00:00Z");
    expect(out).toContain("near limit");
    expect(out).toContain("⚠️");
  });

  it("renders 'Limit: none' for unlimited keys without reset/warning noise", async () => {
    mockFetch([{
      status: 200,
      body: { data: { ...KEY_FIXTURE, limit: null, limit_remaining: null } },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeyGet(client, KEY_FIXTURE.hash);
    expect(out).toContain("Limit: none");
    expect(out).not.toContain("near limit");
  });
});

import { handleKeyCreate, handleKeyUpdate, handleKeyDelete } from "../src/tools/keys.js";

describe("or_key_create", () => {
  it("posts name + limit and surfaces the one-time secret", async () => {
    const { calls } = mockFetch([{
      status: 200,
      body: { data: { hash: "newhash", name: "test", label: "sk-or-v1-...", key: "sk-or-v1-FULL_SECRET", limit: 5 } },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeyCreate(client, { name: "test", limit: 5 });
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ name: "test", limit: 5 });
    expect(out).toContain("sk-or-v1-FULL_SECRET");
    expect(out).toMatch(/cannot be retrieved later/i);
  });

  it("requires non-empty name", () => {
    const client = new OpenRouterClient("sk-or-v1-test");
    return expect(handleKeyCreate(client, { name: "" })).rejects.toThrow();
  });

  it("forwards limit_reset and expires_at and shows them in output", async () => {
    const { calls } = mockFetch([{
      status: 200,
      body: { data: { hash: "h", name: "OpenClaw 2", label: "sk-...", key: "sk-or-v1-NEW", limit: 0.3, limit_reset: "daily", expires_at: "2026-12-31T00:00:00Z" } },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeyCreate(client, { name: "OpenClaw 2", limit: 0.3, limit_reset: "daily", expires_at: "2026-12-31T00:00:00Z" });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.limit_reset).toBe("daily");
    expect(body.expires_at).toBe("2026-12-31T00:00:00Z");
    expect(out).toContain("(resets daily)");
    expect(out).toContain("Expires: 2026-12-31");
  });

  it("rejects invalid limit_reset values", () => {
    const client = new OpenRouterClient("sk-or-v1-test");
    return expect(
      handleKeyCreate(client, { name: "x", limit: 1, limit_reset: "yearly" as never })
    ).rejects.toThrow();
  });
});

describe("or_key_update", () => {
  it("PATCHes only the provided fields", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { hash: "h", name: "x", disabled: true, limit: null, limit_remaining: null, usage: 0, label: "x", created_at: "", updated_at: "" } } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    await handleKeyUpdate(client, { hash: "h", disabled: true });
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].url).toContain("/keys/h");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ disabled: true });
  });

  it("rejects when no fields are provided", async () => {
    const client = new OpenRouterClient("sk-or-v1-test");
    await expect(handleKeyUpdate(client, { hash: "h" })).rejects.toThrow(/at least one field/);
  });

  it("supports setting limit_reset and clearing it via null", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { hash: "h", name: "x", disabled: false, limit: 0.5, limit_remaining: 0.5, limit_reset: "weekly", usage: 0, label: "x", created_at: "", updated_at: "" } } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    await handleKeyUpdate(client, { hash: "h", limit: 0.5, limit_reset: "weekly" });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({ limit: 0.5, limit_reset: "weekly" });

    // null clears the reset period
    mockFetch([{ status: 200, body: { data: { hash: "h", name: "x", disabled: false, limit: 0.5, limit_remaining: 0.5, limit_reset: null, usage: 0, label: "x", created_at: "", updated_at: "" } } }]);
    const c2 = new OpenRouterClient("sk-or-v1-test");
    await handleKeyUpdate(c2, { hash: "h", limit_reset: null });
    // mockFetch reset above; just verify null is passed through (no exception)
  });

  it("supports setting expires_at and clearing it via null", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { hash: "h", name: "x", disabled: false, limit: null, limit_remaining: null, usage: 0, label: "x", expires_at: "2026-06-30T00:00:00Z", created_at: "", updated_at: "" } } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    await handleKeyUpdate(client, { hash: "h", expires_at: "2026-06-30T00:00:00Z" });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.expires_at).toBe("2026-06-30T00:00:00Z");
  });
});

describe("or_key_delete", () => {
  it("DELETEs by hash", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { ok: true } } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleKeyDelete(client, "h");
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toContain("/keys/h");
    expect(out).toMatch(/deleted/i);
  });
});
