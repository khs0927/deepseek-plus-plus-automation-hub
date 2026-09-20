# Safe Parallel MCP Scheduler — Phase 5

Phase 5 parallelizes same-turn MCP calls without bypassing the existing runtime authorization path.

## Execution model

```text
Model emits multiple ToolCalls
  -> deterministic descriptor resolution
  -> deterministic safety filter
       MCP only
       enabled
       low risk
       read-only annotation OR conservative read/list/get/search/fetch/status name policy
       destructive hint always denies
  -> optional JEV mcp_fanout gate
       one Noul question per deterministic-safe call
       active mode can only reduce the safe set
       JEV can never promote an unsafe call
  -> contiguous safe calls grouped
  -> bounded Promise.all batches
  -> serial write/mutation boundaries preserved
  -> each call still enters normal Runtime authorization independently
  -> results restored to original ToolCall order
```

## Safety invariants

- Mutation-capable, medium/high-risk, local, unresolved, or destructive calls remain serial.
- Parallel batches never cross a serial mutation boundary.
- Default max concurrency is 4; hard max is 8.
- Existing capability leases, allowlists, session binding, idempotency, and provider dispatch remain authoritative.
- Shadow mode traces JEV fan-out decisions without changing the deterministic safe baseline.
- In active mode, provider failure, low confidence, or fewer than two selected calls degrades to serial execution.
- JEV receives only deterministic-safe candidates and cannot expand that set.

## TypeSafe mapping

`mcp_fanout` uses one System One `noul` question per candidate in one request. Candidates above the configured threshold are returned as a multi-selection.

This is intentionally different from `mcp_rank`, which uses `choice`.
