# DeepSeek++ local capability inventory

Captured on 2026-09-19 from the locally running DeepSeek++ extension (v1.14.0).
The machine-readable snapshot is [deepseek-plus-plus-capability-snapshot.json](../../integrations/mcp/deepseek-plus-plus-capability-snapshot.json).

## Included in this repository

- The bundled skill sources are under `core/skill/`.
- MCP runtime, transports, capability policy, storage, and handlers are under `core/mcp/`, `entrypoints/background/mcp-handlers.ts`, and `entrypoints/sidepanel/`.
- Native host and shell/MCP integration sources are under `integrations/native-host/` and `packages/shell-host/`.
- Sanitized MCP registry examples are in `integrations/mcp/mcp-servers.example.json`.
- Environment variable names and safe placeholders are in `.env.example`.

## Live bundled skills

The extension reported 15 enabled bundled skills:

`deep-discuss`, `morph-ppt`, `morph-ppt-3d`, `officecli`, `officecli-academic-paper`, `officecli-data-dashboard`, `officecli-docx`, `officecli-financial-model`, `officecli-pitch-deck`, `officecli-pptx`, `officecli-styles`, `officecli-word-form`, `officecli-xlsx`, `review-spd`, and `spec-driven-develop`.

## Live MCP servers

The extension reported six enabled and ready MCP servers with 262 discovered tools in total:

| Server | Tools |
| --- | ---: |
| Subagent Manager | 9 |
| Playwright | 25 |
| Smithery (khs0927) | 200 |
| Zapier | 17 |
| Multimodal Vision | 3 |
| Shell Local | 8 |

The tool catalog is runtime-discovered. This repository records the sanitized server inventory and keeps the implementation/configuration contracts in source control; it does not copy remote server credentials or volatile tool payloads.

## Automatic activation

The live extension had `everyMessage`, `firstMessage`, `session-watchdog`, and `subagent-orchestrator` enabled.

## Related conversation review

- The cross-chat session binding fix is on the `fix/cross-chat-tool-session-binding` branch.
- The tool-error conversation diagnosed MCP invocation-name mismatches and browser-storage watchdog state; it produced no separate Git source tree.
- The stopped-state conversation performed UI diagnostics only and produced no Git source tree.
- The Edge/CDP conversation verified the six-server/15-skill runtime state; its workspace contains only temporary CDP helpers.
- The Smithery conversation configured the browser-side MCP state; it produced no separate Git source tree.

## Secret handling

Real environment values, API keys, OAuth tokens, cookies, private keys, native-host command lines, and local MCP credentials are deliberately excluded. `.env` and equivalent local secret files must remain untracked. The repository contains names, placeholders, contracts, and sanitized inventories so another machine can be configured without publishing credentials.
