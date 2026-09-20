# Capability Metadata + Resource Locks — Phase 9

Phase 9 adds explicit capability metadata for safer, more expressive MCP scheduling.

## Supported metadata

Tool descriptors may publish optional annotations:

- `dpp.effect`: `read | compute | write | external_side_effect`
- `dpp.idempotent`: boolean
- `dpp.parallelSafe`: boolean
- `dpp.requiresApproval`: boolean
- `dpp.resources`: JSON array or comma/newline list
- `dpp.resourceLocks`: JSON array or comma/newline list
- `dpp.dependencies`: JSON array or comma/newline list
- `dpp.dataSensitivity`: `public | internal | sensitive`

Standard-style hints such as `readOnlyHint`, `destructiveHint`, and `idempotentHint` remain supported.

## Scheduling policy

The existing conservative policy remains the baseline.

A tool can additionally qualify for parallel execution when:

- provider is MCP
- tool is enabled
- risk is low
- effect is `read` or `compute`
- `parallelSafe=true`
- `idempotent=true`
- no approval is required
- no unresolved dependency is declared
- no destructive hint is present

`write` and `external_side_effect` never become parallel through metadata.

## Resource locks

Parallel-safe calls are greedily batched in model order.

If two otherwise-safe calls share a `dpp.resourceLocks` key, they are placed into different awaited batches. This prevents overlapping use of exclusive local resources such as:

- `gpu:0`
- `workspace:project-a`
- `cad:drawing-123`
- `browser:tab-42`

Calls without resource locks preserve the Phase 5 batching behavior.

## Dependencies

Declared dependencies currently force serial execution. Phase 9 intentionally does not infer or execute a DAG from model-supplied data. A future deterministic DAG planner can resolve these dependencies with explicit runtime-owned identities.
