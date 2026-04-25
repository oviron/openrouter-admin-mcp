# openrouter-admin-mcp

MCP server for OpenRouter management endpoints (balance, activity, inference-key CRUD). Uses the **Provisioning** API key — different from inference keys.

## Install

```bash
git clone <this repo>
cd openrouter-admin-mcp
npm install
npm run build
```

## Auth

1. Create a Provisioning Key at https://openrouter.ai/settings/provisioning .
2. Pass it via `OPENROUTER_PROVISIONING_KEY` env var.

The Provisioning key cannot make inference calls — it's strictly for management.

## Register with Claude Code

Add to `~/.claude.json` under `mcpServers`:

```json
"openrouter-admin": {
  "command": "node",
  "args": ["/Users/oviron/dev/openrouter-admin-mcp/build/index.js"],
  "env": {
    "OPENROUTER_PROVISIONING_KEY": "sk-or-v1-..."
  }
}
```

Restart Claude Code.

## Tools

| Tool | Purpose |
|---|---|
| `or_credits` | Balance: total purchased, total used, remaining. |
| `or_current_key` | Metadata of the Provisioning key in use. |
| `or_keys_list` | All inference keys with usage and limits. |
| `or_key_get` | One key by hash. |
| `or_activity` | Usage grouped by endpoint, last 30 UTC days. Filters: `date`, `api_key_hash`, `user_id`. |
| `or_key_create` | Create a new inference key. Returns one-time secret. Destructive. |
| `or_key_update` | Rename / disable / re-limit. Destructive. |
| `or_key_delete` | Permanent delete. Destructive. |

## Test

```bash
npm test
```
