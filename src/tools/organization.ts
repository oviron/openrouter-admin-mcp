import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OpenRouterClient } from "../client.js";

interface Member {
  user_id: string;
  email?: string;
  name?: string;
  role?: string;
  joined_at?: string;
}

export async function handleOrgMembers(
  client: OpenRouterClient,
  args: { offset?: number; limit?: number },
): Promise<string> {
  const data = await client.request<Member[]>("GET", "/organization/members", {
    query: { offset: args.offset, limit: args.limit },
  });
  if (data.length === 0) return "No organization members.";
  const lines: string[] = [`Organization members (${data.length}):`, ""];
  for (const m of data) {
    const parts: string[] = [m.email ?? m.name ?? m.user_id];
    parts.push(`user_id: \`${m.user_id}\``);
    if (m.role) parts.push(`role: ${m.role}`);
    if (m.joined_at) parts.push(`joined ${m.joined_at.slice(0, 10)}`);
    lines.push(`- ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

export function registerOrganizationTools(server: McpServer, client: OpenRouterClient) {
  server.tool(
    "or_org_members",
    "List members of the OpenRouter organization (when running under a Management key for an org account). Useful as input for guardrail member-assignments.",
    {
      offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Max members per page (OR caps at 100)"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleOrgMembers(client, args) }],
    }),
  );
}
