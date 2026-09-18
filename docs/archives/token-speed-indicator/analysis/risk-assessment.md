# Risk Assessment

## S.U.P.E.R Architecture Health Summary

| Principle | Status | Key Findings | Transformation Priority |
|:--|:--|:--|:--|
| S Single Purpose | Yellow | `content.ts` and `fetch-hook.ts` are large. Keep this feature in focused helpers. | Medium |
| U Unidirectional Flow | Green | Stream progress can flow hook -> main-world -> content -> DOM. | Medium |
| P Ports over Implementation | Yellow | Add a typed progress payload and normalize at the content boundary. | Medium |
| E Environment-Agnostic | Yellow | The visual anchor depends on DeepSeek DOM shape. Use textarea-based fallback. | Medium |
| R Replaceable Parts | Yellow | Extract token estimation so the counting heuristic can change in one place. | Medium |

**Overall Health**: 2/5 principles healthy enough for a localized feature. The safe path is a narrow progress event and a small DOM renderer.

## S.U.P.E.R Violation Hotspots

| Hotspot | Severity | Why It Matters |
|:--|:--|:--|
| `entrypoints/content.ts` | High | Adding UI code inline can make the already-large page integration harder to maintain. |
| `core/interceptor/fetch-hook.ts` | Medium | Stream parsing is complex; measurement should not alter filtering behavior. |
| Token estimator in `core/memory/selector.ts` | Medium | Reusing it by import would couple stream telemetry to memory selection. |

## Risk Matrix

| Risk | Impact | Likelihood | Severity | Mitigation |
|:--|:--|:--|:--|:--|
| Speed badge anchors to the wrong DOM ancestor | UI appears misplaced | Medium | Medium | Anchor from the active textarea and use conservative sizing/positioning. |
| Progress events affect stream filtering | Replies render incorrectly | Low | High | Only observe extracted text deltas; do not modify parsed stream data. |
| Token speed uses an approximate estimator | Number differs from provider tokenizer | High | Low | Label as `tok/s` and reuse the project heuristic consistently. |
| Too many progress events hurt rendering | UI jank during long streams | Low | Medium | Throttle hook emissions to 250 ms. |

## High-Severity Risks

The main high-severity risk is accidentally changing stream output behavior. The implementation avoids this by measuring text after parsing and before existing tool-call notification, while leaving filter emission untouched.

## Technical Debt

- Message names between main-world and content scripts remain string literals.
- `content.ts` is still a mixed DOM integration layer.
- There is no browser DOM smoke test harness for `chat.deepseek.com`.

## Compatibility Concerns

- Existing tool-call parsing, tool cards, automation continuation, and history cleanup should remain unchanged.
- The indicator should remain visible after completion and keep the final cumulative average speed for the last response.
