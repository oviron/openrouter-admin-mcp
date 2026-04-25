import { describe, expect, it } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import { handleOrgMembers } from "../src/tools/organization.js";
import { mockFetch } from "./helpers.js";

const KEY = "sk-or-v1-test";

describe("or_org_members", () => {
  it("renders members with user_id and role, forwards pagination", async () => {
    const { calls } = mockFetch([
      {
        status: 200,
        body: {
          data: [
            {
              user_id: "u1",
              email: "alice@ex.com",
              role: "owner",
              joined_at: "2026-01-15T00:00:00Z",
            },
            { user_id: "u2", name: "Bob", role: "member" },
          ],
        },
      },
    ]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleOrgMembers(c, { offset: 10, limit: 50 });
    expect(calls[0].url).toContain("offset=10");
    expect(calls[0].url).toContain("limit=50");
    expect(out).toContain("alice@ex.com");
    expect(out).toContain("user_id: `u1`");
    expect(out).toContain("role: owner");
    expect(out).toContain("joined 2026-01-15");
    expect(out).toContain("Bob");
  });

  it("handles empty org", async () => {
    mockFetch([{ status: 200, body: { data: [] } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleOrgMembers(c, {});
    expect(out).toBe("No organization members.");
  });
});
