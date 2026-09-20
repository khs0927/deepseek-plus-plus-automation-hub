# JEV Decision Plane — Phase 0/1

This branch introduces a non-authoritative decision layer above the existing MCP capability projection.

## Safety invariants

- Decision output never creates or authorizes a tool descriptor.
- Explicit pins remain deterministic and cannot be demoted by a provider.
- Eligibility, execution enablement, leases, session binding, allowlists, prompt budgets and runtime authorization stay in the released code path.
- Runtime mode defaults to `shadow`.
- Provider failures, invalid responses, abstention and confidence below 0.75 fall back to the existing lexical ranking.
- Candidate text is bounded and normalized before leaving the decision boundary.
- TypeSafe credentials are intentionally not accepted by extension-side decision code.

## Files

- `core/decision/contract.ts`: provider-neutral request/result contract.
- `core/decision/provider.ts`: runtime mode, provider injection, timeout and result validation.
- `core/decision/trace.ts`: bounded, non-payload decision audit buffer.
- `core/decision/typesafe-jev-provider.ts`: TypeSafe System One adapter using an injected transport.
- `core/mcp/capability-decision.ts`: lexical shortlist → decision provider → safe projection/fallback.
- `core/mcp/capability-projection.ts`: accepts optional semantic order while retaining deterministic pins and budgets.

## TypeSafe transport boundary

The adapter models the documented System One request:

- `POST https://api.typesafe.ai/v1/systemone`
- top-level `model`, `state`, `questions`
- one Choice question for MCP ranking
- Choice probabilities are converted into a full candidate order
- one `__none__` option is reserved for abstention

The HTTP request is not made directly by browser code. A later Native Host transport should own
`TYPESAFE_API_KEY` and expose only a narrow internal decision RPC.

## Open-source patterns intentionally adapted

The design follows patterns observed in JevRouter, jev-use, jev-mcp, SkillRanker and browser-use/jev-ultrafast:

- deterministic policy outside Jev,
- bounded candidate sets,
- explicit abstention,
- confidence-based fallback,
- provider/result tracing,
- semantic decision separated from authorization and execution.

No third-party source code is copied into this branch.

## Next phases

1. Bind the TypeSafe transport to an internal Native Host RPC.
2. Add a deterministic parallel scheduler for read/compute/idempotent MCP calls.
3. Add Result Judge and independent Outcome Verifier.
4. Reuse the same DecisionProvider for `mcp_discover`, skills, browser actions and subagents.
