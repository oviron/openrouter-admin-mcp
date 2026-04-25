# Security Policy

## Reporting a vulnerability

If you discover a security issue (token leak, injection, auth bypass, exfiltration via MCP responses, etc.) please **do not open a public issue**.

Instead, use GitHub's [private vulnerability reporting](https://github.com/oviron/openrouter-admin-mcp/security/advisories/new) on this repository. I'll acknowledge within a few days and coordinate a fix + disclosure.

## Scope

This server forwards your OpenRouter Provisioning key to `https://openrouter.ai/api/v1/*` and nothing else. It does not log, cache, or persist any data. The key is read once at startup from `OPENROUTER_PROVISIONING_KEY` and held in memory until exit.

If you find any path where:

- The key is written to disk, stdout, an error message, or a tool response
- Outbound traffic goes anywhere other than `openrouter.ai`
- A tool can be coerced (via crafted input) into mutating account state when `OPENROUTER_ADMIN_ALLOW_WRITE` is unset

— that's a security bug. Please report it.

## Supported versions

Only the latest minor on the latest major receives security fixes. If you're pinned to an older version, please upgrade or open a discussion.
