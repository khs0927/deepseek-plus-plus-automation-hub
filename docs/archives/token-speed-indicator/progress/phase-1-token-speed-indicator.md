# Phase 1: Token Speed Indicator

**Goal**: Show live token output speed in the DeepSeek prompt input box while a response is streaming.

**Status**: Complete

## Tasks

- [x] **T1.1**: Extract shared token estimator and emit response speed progress from fetch/XHR streams.
  - Priority: P0
  - Effort: M
  - Acceptance: Hook emits throttled cumulative-average progress payloads without changing response stream filtering.
  - Notes: Implemented with throttled progress updates from stream text deltas.
- [x] **T1.2**: Forward progress through main-world and render prompt-box badge in content script.
  - Priority: P0
  - Effort: M
  - Acceptance: Badge shows cumulative average `tok/s`, follows light/dark theme, remains visible, and keeps the final value after completion.
  - Notes: Main-world forwards `RESPONSE_TOKEN_SPEED`; content script renders a light/dark themed badge.
- [x] **T1.3**: Validate and inspect diff.
  - Priority: P0
  - Effort: S
  - Acceptance: `npm run compile` and `npm run build` pass; diff has no unrelated regressions.
  - Notes: `npm run compile`, `npm run build`, and `git diff --check` passed.

## Phase Notes

- GitHub preflight found repo access, but this task uses local tracking only because it is a small, single-session feature.
- The speed number uses the same approximate token heuristic as prompt memory budgeting.

## Phase Completion Checklist

- [x] All tasks above are checked off
- [x] MASTER.md phase count updated
- [x] MASTER.md "Current Status" updated to complete
