import { beforeEach, describe, expect, it } from "vitest";
import { OpenRouterClient, OpenRouterError } from "../src/client.js";
import { expectAuthHeader, mockFetch } from "./helpers.js";

const KEY = "sk-or-v1-test";

describe("OpenRouterClient", () => {
  let client: OpenRouterClient;
  beforeEach(() => {
    // Disable retries and cache for behavior tests; retry/cache have dedicated tests.
    client = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
  });

  it("GETs with bearer header and parses {data: ...} envelope", async () => {
    const { calls } = mockFetch([
      { status: 200, body: { data: { total_credits: 15, total_usage: 13 } } },
    ]);
    const res = await client.request<{ total_credits: number; total_usage: number }>(
      "GET",
      "/credits",
    );
    expect(res).toEqual({ total_credits: 15, total_usage: 13 });
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/credits");
    expectAuthHeader(calls[0].init, KEY);
  });

  it("appends query params", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: [] } }]);
    await client.request("GET", "/activity", { query: { date: "2026-04-25" } });
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/activity?date=2026-04-25");
  });

  it("sends JSON body for POST", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { hash: "h" } } }]);
    await client.request("POST", "/keys", { body: { name: "test", limit: 5 } });
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "test",
      limit: 5,
    });
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("maps 401 to 'Invalid or expired Provisioning key'", async () => {
    mockFetch([
      { status: 401, body: { error: { message: "no" } } },
      { status: 401, body: { error: { message: "no" } } },
    ]);
    await expect(client.request("GET", "/credits")).rejects.toThrow(OpenRouterError);
    await expect(client.request("GET", "/credits")).rejects.toThrow(
      /Invalid or expired Provisioning key/,
    );
  });

  it("maps 403 to scope error", async () => {
    mockFetch([{ status: 403, body: {} }]);
    await expect(client.request("GET", "/credits")).rejects.toThrow(
      /Provisioning key lacks required scope/,
    );
  });

  it("maps 429 to rate-limit error", async () => {
    mockFetch([{ status: 429, body: {} }]);
    await expect(client.request("GET", "/credits")).rejects.toThrow(/Rate limited by OpenRouter/);
  });

  it("includes status and truncated body for other failures", async () => {
    mockFetch([
      { status: 500, body: { error: "internal boom" } },
      { status: 500, body: { error: "internal boom" } },
    ]);
    await expect(client.request("GET", "/credits")).rejects.toThrow(/500/);
    await expect(client.request("GET", "/credits")).rejects.toThrow(/internal boom/);
  });

  it("never includes the api key in any error message", async () => {
    mockFetch([
      { status: 401, body: {} },
      { status: 403, body: {} },
      { status: 500, body: { msg: "x" } },
    ]);
    for (const _ of [1, 2, 3]) {
      try {
        await client.request("GET", "/credits");
      } catch (e) {
        expect((e as Error).message).not.toContain(KEY);
      }
    }
  });
});

describe("OpenRouterClient retry", () => {
  it("retries 429 then succeeds, honoring Retry-After seconds", async () => {
    const sleeps: number[] = [];
    const c = new OpenRouterClient(KEY, {
      maxRetries: 3,
      cache: false,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const { calls } = mockFetch([
      { status: 429, body: {}, headers: { "retry-after": "2" } },
      { status: 200, body: { data: { ok: true } } },
    ]);
    const r = await c.request<{ ok: boolean }>("GET", "/credits");
    expect(r).toEqual({ ok: true });
    expect(calls.length).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it("retries 5xx with exponential backoff when no Retry-After", async () => {
    const sleeps: number[] = [];
    const c = new OpenRouterClient(KEY, {
      maxRetries: 3,
      cache: false,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    mockFetch([
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 200, body: { data: 1 } },
    ]);
    await c.request("GET", "/credits");
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const c = new OpenRouterClient(KEY, {
      maxRetries: 2,
      cache: false,
      sleep: async () => {},
    });
    mockFetch([
      { status: 500, body: { error: "boom" } },
      { status: 500, body: { error: "boom" } },
      { status: 500, body: { error: "boom" } },
    ]);
    await expect(c.request("GET", "/credits")).rejects.toThrow(/500/);
  });

  it("does not retry 4xx other than 429", async () => {
    const c = new OpenRouterClient(KEY, { maxRetries: 3, cache: false, sleep: async () => {} });
    const { calls } = mockFetch([{ status: 401, body: {} }]);
    await expect(c.request("GET", "/credits")).rejects.toThrow(/401/);
    expect(calls.length).toBe(1);
  });
});

describe("OpenRouterClient cache", () => {
  it("caches GET /credits within TTL", async () => {
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: true, cacheTtlMs: 60_000 });
    const { calls } = mockFetch([
      { status: 200, body: { data: { total_credits: 10, total_usage: 1 } } },
      { status: 200, body: { data: { total_credits: 99, total_usage: 99 } } },
    ]);
    const a = await c.request("GET", "/credits");
    const b = await c.request("GET", "/credits");
    expect(a).toEqual(b);
    expect(calls.length).toBe(1);
  });

  it("does not cache /activity", async () => {
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: true });
    const { calls } = mockFetch([
      { status: 200, body: { data: [{ usage: 1 }] } },
      { status: 200, body: { data: [{ usage: 2 }] } },
    ]);
    await c.request("GET", "/activity");
    await c.request("GET", "/activity");
    expect(calls.length).toBe(2);
  });

  it("noCache flag bypasses cache", async () => {
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: true });
    const { calls } = mockFetch([
      { status: 200, body: { data: { v: 1 } } },
      { status: 200, body: { data: { v: 2 } } },
    ]);
    await c.request("GET", "/credits");
    await c.request("GET", "/credits", { noCache: true });
    expect(calls.length).toBe(2);
  });

  it("PATCH /keys/{hash} invalidates cached /keys list", async () => {
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: true });
    const { calls } = mockFetch([
      { status: 200, body: { data: [{ hash: "h", name: "old" }] } },
      { status: 200, body: { data: { hash: "h", name: "new" } } },
      { status: 200, body: { data: [{ hash: "h", name: "new" }] } },
    ]);
    await c.request("GET", "/keys");
    await c.request("PATCH", "/keys/h", { body: { name: "new" } });
    await c.request("GET", "/keys");
    expect(calls.length).toBe(3);
  });

  it("cache disabled by default-off setting", async () => {
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const { calls } = mockFetch([
      { status: 200, body: { data: 1 } },
      { status: 200, body: { data: 2 } },
    ]);
    await c.request("GET", "/credits");
    await c.request("GET", "/credits");
    expect(calls.length).toBe(2);
  });
});
