# JEV Result Judge — Phase 4

Phase 4 adds an advisory post-execution outcome judge without changing tool authorization or provider results.

## Flow

```text
Authorized Tool Call
  -> Provider execution
  -> Authorization completion
  -> Tool history
  -> Result Judge (advisory)
       accept | retry | escalate
  -> DecisionTrace
  -> original ToolResult returned unchanged
```

## Guarantees

- Result Judge never grants permission.
- Result Judge never executes or retries a tool.
- Observer failure never replaces the provider result.
- Low confidence, provider failure, or abstention maps to advisory `escalate`.
- The judge evaluates only the supplied execution evidence and is instructed not to claim external truth.
- Common credential patterns are redacted before the external decision provider sees evidence.
- Tool history remains the authoritative record of what actually executed.

## Current use

The verdict is trace/advisory data for later orchestration phases. Phase 5 may consume the verdict when building a safe execution DAG, but it must still pass deterministic retry and mutation policy before any retry can occur.
