# JEV Subagent Engine Routing — Phase 7

Phase 7 lets JEV select a worker engine only when the Subagent Manager request uses `engine: auto`.

## Flow

```text
authorized tool intent
  -> pre-authorization payload transformer
  -> resolve authoritative Subagent descriptor
  -> explicit engine? keep exactly as requested
  -> engine:auto
  -> read non-secret local engine availability
  -> available engines >= 2?
  -> JEV agent_route Choice
  -> active + high confidence -> replace payload.engine only
  -> shadow/disabled/error/low confidence -> keep auto
  -> normal authorization fingerprints the final payload
  -> existing provider execution
```

## Invariants

- Only the payload may be transformed.
- Descriptor ID, provider, tool name, invocation name, source identity, and call ID are preserved by Runtime.
- Explicit `deepseek_web`, `gemini`, or `groq` is never overridden.
- Availability exposes only booleans, never API keys or tokens.
- The transformer runs before authorization, so the existing authorization fingerprint binds the final payload.
- Provider failure is fail-open: the original request continues with `engine:auto`.
- Batch routing is capped and changes only tasks that individually request `auto`.
