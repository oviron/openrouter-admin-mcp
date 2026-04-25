import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { OpenRouterClient } from "../src/client.js";
import { registerKeysTools } from "../src/tools/keys.js";

/**
 * Spy server: replace the SDK's internal tool registry with a Map we can inspect.
 * The McpServer.tool() method just delegates to register; we monkey-patch it.
 */
function makeSpy() {
  const registered = new Set<string>();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  // biome-ignore lint/suspicious/noExplicitAny: deliberate test seam
  (server as any).tool = (name: string) => {
    registered.add(name);
  };
  return { server, registered };
}

describe("registerKeysTools — destructive opt-in", () => {
  const client = new OpenRouterClient("sk-or-v1-test");

  it("registers only read tools by default", () => {
    const { server, registered } = makeSpy();
    registerKeysTools(server, client);
    expect(registered.has("or_keys_list")).toBe(true);
    expect(registered.has("or_key_get")).toBe(true);
    expect(registered.has("or_key_create")).toBe(false);
    expect(registered.has("or_key_update")).toBe(false);
    expect(registered.has("or_key_delete")).toBe(false);
  });

  it("registers only read tools when allowWrite=false", () => {
    const { server, registered } = makeSpy();
    registerKeysTools(server, client, { allowWrite: false });
    expect(registered.has("or_key_create")).toBe(false);
    expect(registered.has("or_key_update")).toBe(false);
    expect(registered.has("or_key_delete")).toBe(false);
  });

  it("registers all tools (read + write) when allowWrite=true", () => {
    const { server, registered } = makeSpy();
    registerKeysTools(server, client, { allowWrite: true });
    expect(registered.has("or_keys_list")).toBe(true);
    expect(registered.has("or_key_get")).toBe(true);
    expect(registered.has("or_key_create")).toBe(true);
    expect(registered.has("or_key_update")).toBe(true);
    expect(registered.has("or_key_delete")).toBe(true);
  });
});
