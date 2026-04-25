import { describe, it, expect } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import { mockFetch } from "./helpers.js";
import { handleCredits, handleCurrentKey } from "../src/tools/credits.js";

describe("or_credits", () => {
  it("returns balance with computed remaining", async () => {
    mockFetch([{ status: 200, body: { data: { total_credits: 15, total_usage: 13.5 } } }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleCredits(client);
    expect(out).toContain("15");
    expect(out).toContain("13.5");
    expect(out).toContain("1.5"); // remaining
  });
});

describe("or_current_key", () => {
  it("renders key metadata flags", async () => {
    mockFetch([{
      status: 200,
      body: { data: { label: "sk-or-v1-541...18a", is_management_key: true, is_provisioning_key: true, limit: null, usage: 0 } },
    }]);
    const client = new OpenRouterClient("sk-or-v1-test");
    const out = await handleCurrentKey(client);
    expect(out).toMatch(/management/i);
    expect(out).toMatch(/provisioning/i);
    expect(out).toContain("sk-or-v1-541...18a");
  });
});
