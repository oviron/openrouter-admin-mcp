import { describe, expect, it } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import {
  handleAssignKeys,
  handleAssignMembers,
  handleAssignmentsOverview,
  handleGuardrailCreate,
  handleGuardrailDelete,
  handleGuardrailGet,
  handleGuardrailsList,
  handleGuardrailUpdate,
  handleUnassignKeys,
  handleUnassignMembers,
} from "../src/tools/guardrails.js";
import { mockFetch } from "./helpers.js";

const KEY = "sk-or-v1-test";

const G_FIXTURE = {
  id: "gr_abc",
  name: "Production cap",
  description: "Daily $50",
  limit_usd: 50,
  reset_interval: "daily" as const,
  allowed_providers: ["anthropic", "openai"],
  ignored_models: ["openai/o1-pro"],
  enforce_zdr: true,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-25T00:00:00Z",
};

describe("or_guardrails_list", () => {
  it("renders guardrails with limit, reset cadence, allow/block lists", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: [G_FIXTURE] } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleGuardrailsList(c);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/guardrails");
    expect(out).toContain("Production cap");
    expect(out).toContain("limit $50.00 (daily)");
    expect(out).toContain("ZDR enforced");
    expect(out).toContain("providers⊆[anthropic,openai]");
    expect(out).toContain("models∌[openai/o1-pro]");
  });

  it("handles empty list", async () => {
    mockFetch([{ status: 200, body: { data: [] } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleGuardrailsList(c);
    expect(out).toBe("No guardrails configured.");
  });
});

describe("or_guardrail_get", () => {
  it("renders detailed view", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: G_FIXTURE } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleGuardrailGet(c, "gr_abc");
    expect(calls[0].url).toContain("/guardrails/gr_abc");
    expect(out).toContain("Production cap");
    expect(out).toContain("Limit: $50.00 (resets daily)");
    expect(out).toContain("ZDR: enforced");
    expect(out).toContain("Allowed providers: anthropic, openai");
    expect(out).toContain("Ignored models: openai/o1-pro");
  });

  it("renders 'Limit: none' when limit_usd is null", async () => {
    mockFetch([
      { status: 200, body: { data: { ...G_FIXTURE, limit_usd: null, reset_interval: null } } },
    ]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleGuardrailGet(c, "gr_abc");
    expect(out).toContain("Limit: none");
  });
});

describe("or_guardrail_create / update / delete", () => {
  it("creates with body and returns id", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: G_FIXTURE } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleGuardrailCreate(c, {
      name: "Production cap",
      limit_usd: 50,
      reset_interval: "daily",
    });
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({
      name: "Production cap",
      limit_usd: 50,
      reset_interval: "daily",
    });
    expect(out).toContain("Created guardrail `gr_abc`");
  });

  it("update rejects empty patch", async () => {
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    mockFetch([]);
    await expect(handleGuardrailUpdate(c, { id: "gr_abc" })).rejects.toThrow(/at least one field/);
  });

  it("update sends only provided fields", async () => {
    const { calls } = mockFetch([
      { status: 200, body: { data: { ...G_FIXTURE, limit_usd: 100 } } },
    ]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    await handleGuardrailUpdate(c, { id: "gr_abc", limit_usd: 100 });
    expect(calls[0].init.method).toBe("PATCH");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({ limit_usd: 100 });
  });

  it("update preserves explicit null (clear field)", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: G_FIXTURE } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    await handleGuardrailUpdate(c, { id: "gr_abc", reset_interval: null });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({ reset_interval: null });
  });

  it("delete returns confirmation", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { ok: true } } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleGuardrailDelete(c, "gr_abc");
    expect(calls[0].init.method).toBe("DELETE");
    expect(out).toContain("Deleted guardrail `gr_abc`");
  });
});

describe("guardrail bulk assignments", () => {
  it("assign_keys posts api_key_hashes array", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { ok: true } } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleAssignKeys(c, { id: "gr_abc", hashes: ["h1", "h2", "h3"] });
    expect(calls[0].url).toContain("/guardrails/gr_abc/keys/bulk-assign");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      api_key_hashes: ["h1", "h2", "h3"],
    });
    expect(out).toContain("3 key(s)");
  });

  it("unassign_keys uses bulk-unassign endpoint", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { ok: true } } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    await handleUnassignKeys(c, { id: "gr_abc", hashes: ["h1"] });
    expect(calls[0].url).toContain("/guardrails/gr_abc/keys/bulk-unassign");
  });

  it("assign_members posts user_ids array", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { ok: true } } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    await handleAssignMembers(c, { id: "gr_abc", user_ids: ["u1", "u2"] });
    expect(calls[0].url).toContain("/guardrails/gr_abc/members/bulk-assign");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ user_ids: ["u1", "u2"] });
  });

  it("unassign_members uses bulk-unassign endpoint", async () => {
    const { calls } = mockFetch([{ status: 200, body: { data: { ok: true } } }]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    await handleUnassignMembers(c, { id: "gr_abc", user_ids: ["u1"] });
    expect(calls[0].url).toContain("/guardrails/gr_abc/members/bulk-unassign");
  });
});

describe("or_guardrails_assignments composite", () => {
  it("merges key + member assignments grouped by guardrail", async () => {
    mockFetch([
      {
        status: 200,
        body: {
          data: [
            { guardrail_id: "gr_a", api_key_hash: "h1", api_key_name: "prod" },
            { guardrail_id: "gr_a", api_key_hash: "h2", api_key_name: "scratch" },
            { guardrail_id: "gr_b", api_key_hash: "h3" },
          ],
        },
      },
      {
        status: 200,
        body: {
          data: [{ guardrail_id: "gr_a", user_id: "u1", member_email: "alice@ex.com" }],
        },
      },
    ]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleAssignmentsOverview(c);
    expect(out).toContain("3 key(s), 1 member(s) across 2 guardrail(s)");
    expect(out).toContain("Guardrail `gr_a`");
    expect(out).toContain("keys (2): prod, scratch");
    expect(out).toContain("members (1): alice@ex.com");
    expect(out).toContain("Guardrail `gr_b`");
    expect(out).toContain("keys (1): h3");
  });

  it("returns empty marker when nothing is assigned", async () => {
    mockFetch([
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: [] } },
    ]);
    const c = new OpenRouterClient(KEY, { maxRetries: 0, cache: false });
    const out = await handleAssignmentsOverview(c);
    expect(out).toBe("No guardrail assignments.");
  });
});
