# Task Breakdown

## Overview

- **Total Phases**: 1
- **Total Tasks**: 3
- **Estimated Total Effort**: M

## S.U.P.E.R Design Constraints

- **S**: Keep stream measurement, bridge forwarding, and DOM rendering separate.
- **U**: Progress data flows only from stream hook to page badge.
- **P**: Use a typed serializable payload for token speed updates.
- **E**: Keep DeepSeek DOM assumptions in content-script helpers.
- **R**: Token estimation lives in one shared module.

## Phase 1: Token Speed Indicator

**Goal**: Show live token output speed in the upper-right corner of the DeepSeek prompt input box while a response is streaming.

**Prerequisite**: Existing fetch/XHR stream interception remains active.

**S.U.P.E.R Focus**: S, U, P, R.

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:--|:--|:--|:--|:--|:--|:--|
| T1.1 | Extract shared token estimator and emit response speed progress from fetch/XHR streams | P0 | M | - | A | P, R | Hook emits throttled cumulative-average progress payloads without changing response stream filtering. |
| T1.2 | Forward progress through main-world and render prompt-box badge in content script | P0 | M | T1.1 | A | S, U, E | Badge shows cumulative average `tok/s`, follows light/dark theme, remains visible, and keeps the final value after completion. |
| T1.3 | Validate and inspect diff | P0 | S | T1.1, T1.2 | A | S, P | `npm run compile` and `npm run build` pass; diff has no unrelated regressions. |

### Parallel Lanes

| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:--|:--|:--|:--|:--|
| A | T1.1, T1.2, T1.3 | M | Medium | `core/interceptor/fetch-hook.ts`, `entrypoints/main-world.content.ts`, `entrypoints/content.ts` |
