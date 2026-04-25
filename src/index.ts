#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OpenRouterClient } from "./client.js";
import { registerCreditsTools } from "./tools/credits.js";
import { registerKeysTools } from "./tools/keys.js";
import { registerActivityTools } from "./tools/activity.js";

const key = process.env.OPENROUTER_PROVISIONING_KEY;
if (!key) {
  console.error(
    "OPENROUTER_PROVISIONING_KEY environment variable is required.\n" +
      "Create one at https://openrouter.ai/settings/provisioning"
  );
  process.exit(1);
}

const client = new OpenRouterClient(key);

const server = new McpServer({
  name: "openrouter-admin-mcp",
  version: "0.1.0",
});

registerCreditsTools(server, client);
registerKeysTools(server, client);
registerActivityTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("openrouter-admin-mcp running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
