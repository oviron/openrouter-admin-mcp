import { beforeEach, describe, expect, it } from "vitest";
import { OpenRouterClient, OpenRouterError } from "../src/client.js";
import { expectAuthHeader, mockFetch } from "./helpers.js";

const KEY = "sk-or-v1-test";

describe("OpenRouterClient", () => {
  let client: OpenRouterClient;
  beforeEach(() => {
    client = new OpenRouterClient(KEY);
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
