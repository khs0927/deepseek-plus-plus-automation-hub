# Native Jev Transport — Phase 3

Phase 3 connects the provider-neutral Decision Plane to TypeSafe Jev through the existing Shell Native Host.

## Security boundary

The browser extension never receives or stores the TypeSafe API key.

```text
DeepSeek++ background
  -> private Native Messaging JSON-RPC
  -> Shell Native Host
  -> Authorization: Bearer <TYPESAFE_API_KEY>
  -> https://api.typesafe.ai/v1/systemone
```

The Native Host exposes two private methods:

- `decision/status`
- `decision/evaluate`

They are internal JSON-RPC methods and are not included in MCP `tools/list`, so the model cannot invoke them as tools.

## Environment

Set these in the environment inherited by the browser / Native Host process:

- `TYPESAFE_API_KEY` — required for live Jev calls.
- `TYPESAFE_JEV_MODEL` — optional, defaults to `jev-latest`.
- `DEEPSEEK_PP_JEV_MODE` — `shadow` (default), `active`, or `disabled`.

Recommended rollout:

1. Start with `DEEPSEEK_PP_JEV_MODE=shadow`.
2. For shadow comparison, explicitly place the MCP servers you want to evaluate in `adaptive` mode; shadow itself never changes exposure settings.
3. Compare DecisionTrace against lexical routing.
4. Switch to `active` only after the shadow metrics are acceptable. In active mode, the known local Subagent Manager can be auto-initialized to `adaptive` when no user setting exists.

After changing environment variables, restart the browser so the Native Host inherits the new environment.

Do not paste API keys into prompts, extension settings, MCP arguments, repository files, or chat messages.

## Runtime behavior

At background startup DeepSeek++ probes `decision/status`.

- no Native Host / no key -> provider remains disconnected and lexical ranking continues.
- key + shadow -> Jev decisions are made and traced, but lexical projection remains authoritative.
- key + active -> high-confidence Jev ranking can reorder eligible adaptive MCP candidates. If the known local Subagent Manager has no explicit exposure setting, DeepSeek++ initializes that server to `adaptive`; existing user settings are preserved.
- provider errors / invalid answers / low confidence -> lexical fallback.

Jev still cannot:

- authorize tools,
- grant capability leases,
- enable disabled MCP servers,
- bypass allowlists or session binding,
- execute Subagent workers directly.

## Subagent path

With Phase 2 underneath this branch:

```text
Strong LLM Planner
  -> adaptive capability candidates
  -> Jev mcp_rank
  -> invoke_subagent_batch selected when relevant
  -> existing MCP authorization
  -> Subagent Manager queue
  -> maxConcurrentSubagents bounded fan-out
  -> worker results
```

The local Subagent Manager is still started by the packaged service launcher and verified at `http://127.0.0.1:8932/health`.
