#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OpenRouterClient } from "./client.js";
import { registerActivityTools } from "./tools/activity.js";
import { registerCreditsTools } from "./tools/credits.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerGuardrailsTools } from "./tools/guardrails.js";
import { registerKeysTools } from "./tools/keys.js";
import { registerModelsTools } from "./tools/models.js";
import { registerOrganizationTools } from "./tools/organization.js";
import { registerOverviewTools } from "./tools/overview.js";

const key = process.env.OPENROUTER_PROVISIONING_KEY;
if (!key) {
  console.error(
    "OPENROUTER_PROVISIONING_KEY environment variable is required.\n" +
      "Create one at https://openrouter.ai/settings/provisioning",
  );
  process.exit(1);
}

const allowWrite = ["1", "true", "yes"].includes(
  String(process.env.OPENROUTER_ADMIN_ALLOW_WRITE ?? "").toLowerCase(),
);

const client = new OpenRouterClient(key);

const server = new McpServer({
  name: "openrouter-admin-mcp",
  version: "0.7.1",
});

registerCreditsTools(server, client);
registerKeysTools(server, client, { allowWrite });
registerActivityTools(server, client);
registerOverviewTools(server, client);
registerGenerationTools(server, client);
registerModelsTools(server, client);
registerGuardrailsTools(server, client, { allowWrite });
registerOrganizationTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `openrouter-admin-mcp running on stdio (write tools: ${allowWrite ? "ENABLED" : "disabled"})`,
  );
  if (!allowWrite) {
    console.error(
      "  set OPENROUTER_ADMIN_ALLOW_WRITE=1 to enable or_key_create / _update / _delete",
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
