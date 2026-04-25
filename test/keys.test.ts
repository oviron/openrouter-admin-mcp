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
