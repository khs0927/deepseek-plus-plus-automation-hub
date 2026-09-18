# Token Speed Indicator — Progress Tracker

> **Task**: Show current token output speed in the upper-right corner of the DeepSeek prompt input box.
> **Started**: 2026-05-27
> **Last Updated**: 2026-05-27
> **Mode**: LOCAL_ONLY
> **Pre-flight**: GitHub access detected as GITHUB_STANDARD; local tracking used for this one-phase feature.

## References

- [Project Overview](../analysis/project-overview.md)
- [Module Inventory](../analysis/module-inventory.md)
- [Risk Assessment](../analysis/risk-assessment.md)
- [Task Breakdown](../plan/task-breakdown.md)
- [Dependency Graph](../plan/dependency-graph.md)
- [Milestones](../plan/milestones.md)

## Phase Summary

| Phase | Name | Tasks | Done | Progress |
|:--|:--|--:|--:|:--|
| 1 | Token Speed Indicator | 3 | 3 | 100% |

## Phase Checklist

- [x] Phase 1: Token Speed Indicator (3/3 tasks) — [details](./phase-1-token-speed-indicator.md)

## Current Status

**Active Phase**: Complete
**Active Task**: None
**Blockers**: None

## Adaptive Control State

```yaml
adaptive:
  drift_score: 0
  strategy: "single-phase localized feature"
  thresholds:
    annotate: 1
    replan: 2
    rescope: 2
  total_tasks: 3
  completed_tasks: 3
  last_updated: "2026-05-27"
```

## Task Telemetry Log

| Date | Task | Actual Effort | S.U.P.E.R Score | Unplanned Dependencies | Notes |
|:--|:--|:--|:--|--:|:--|
| 2026-05-27 | T1.1 | M | S-green U-green P-green E-green R-green | 0 | Extracted shared token estimator and emitted throttled fetch/XHR stream speed payloads. |
| 2026-05-27 | T1.2 | M | S-yellow U-green P-green E-yellow R-yellow | 0 | Added main-world forwarding and a content-script badge anchored from the DeepSeek textarea. |
| 2026-05-27 | T1.3 | S | S-green U-green P-green E-green R-green | 0 | `npm run compile`, `npm run build`, and `git diff --check` passed. |
| 2026-05-27 | Follow-up | S | S-green U-green P-green E-green R-green | 0 | Switched from cumulative average to short-window current speed and kept the badge visible at `0.0 tok/s` while idle. |
| 2026-05-27 | Follow-up 2 | S | S-green U-green P-green E-green R-green | 0 | Restored cumulative-average speed per user preference and kept the final average visible after completion. |
| 2026-05-27 | Follow-up 3 | S | S-green U-green P-green E-green R-green | 0 | Attached speed tracking to all chat completion responses so official regenerate requests without a new prompt are measured. |
| 2026-05-27 | Follow-up 4 | M | S-green U-green P-yellow E-yellow R-yellow | 0 | Removed the DOM-based speed fallback that could self-trigger page mutations, and expanded completion stream text parsing to include `/text` patch paths used by retry-like stream variants. |
| 2026-05-27 | Follow-up 5 | S | S-green U-green P-green E-yellow R-yellow | 0 | Added `/api/v0/chat/regenerate` to the same network stream interception path after verifying official retry uses a separate endpoint from completion. |
| 2026-05-27 | Follow-up 6 | S | S-green U-green P-green E-yellow R-green | 0 | Made the input-box badge remount itself after DeepSeek DOM replacement and switched textarea detection to `tagName` for page-context robustness. |
| 2026-05-27 | Follow-up 7 | S | S-green U-green P-green E-green R-green | 0 | Tightened prompt input frame selection so the badge anchors to the rounded textarea container instead of wider layout wrappers. |
| 2026-05-27 | Follow-up 8 | S | S-green U-green P-green E-green R-green | 0 | Reset cached token speed to idle when the DeepSeek route changes, preventing a previous conversation's final speed from carrying into a new chat. |

## Next Steps

1. Archive the completed spec-driven artifacts under `docs/archives/token-speed-indicator/`.

## Session Log

| Date | Session | Summary |
|:--|:--|:--|
| 2026-05-27 | Planning | Created lightweight spec-driven analysis, plan, and progress docs for the token speed indicator. |
| 2026-05-27 | Execution | Implemented the stream progress event, input-box speed badge, shared token estimator, and validation pass. |
| 2026-05-27 | Follow-up | Corrected behavior so the badge is persistent and current-speed based rather than cumulative-average based. |
| 2026-05-27 | Follow-up 2 | Corrected behavior to cumulative-average speed from response start and retained the final value after completion. |
| 2026-05-27 | Follow-up 3 | Fixed official regenerate path by intercepting completion responses even when the prompt body is not rewritten. |
| 2026-05-27 | Follow-up 4 | Removed the DOM fallback and fixed retry-like completion streams by parsing `/text` patch paths from the network stream. |
| 2026-05-27 | Follow-up 5 | Corrected the retry endpoint coverage by intercepting `/api/v0/chat/regenerate` alongside `/api/v0/chat/completion`. |
| 2026-05-27 | Follow-up 6 | Restored persistent badge mounting when DeepSeek rebuilds the prompt input DOM. |
| 2026-05-27 | Follow-up 7 | Corrected badge placement to stay attached to the actual prompt input box. |
| 2026-05-27 | Follow-up 8 | Reset speed state on conversation route changes. |
