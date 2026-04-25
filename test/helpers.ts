import { expect, vi } from "vitest";

export type MockResponse = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

export function mockFetch(responses: MockResponse[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const r = responses[i++];
    if (!r) throw new Error(`mockFetch: unexpected call #${i} to ${url}`);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  });
  globalThis.fetch = fn as typeof fetch;
  return { calls, fn };
}

export function expectAuthHeader(init: RequestInit, key: string) {
  const headers = init.headers as Record<string, string>;
  expect(headers.Authorization).toBe(`Bearer ${key}`);
}
