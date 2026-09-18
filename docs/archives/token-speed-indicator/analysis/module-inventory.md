# Module Inventory

| Module | Responsibility | Dependencies | Files | Lines | Complexity | S.U.P.E.R Score |
|:--|:--|:--|--:|--:|:--|:--|
| Stream interceptor | Request augmentation, SSE parsing, tool-call filtering, completion lifecycle | prompt, skill, tool parser, SSE parser | 3 | 1063+ | High | S-yellow U-yellow P-yellow E-yellow R-yellow |
| Main-world bridge | Installs hook and forwards serializable events to content script | fetch hook, automation runner | 1 | 169 | Medium | S-green U-green P-yellow E-yellow R-yellow |
| Content script DOM layer | Tool block rendering, page theme/background integration, automation bridge | runtime messages, DOM, DeepSeek selectors | 1 | 1528 | Critical | S-red U-yellow P-yellow E-yellow R-red |
| Token estimation | Shared approximate token counting | none | 1 | new | Low | S-green U-green P-green E-green R-green |

## Module Details

### Stream Interceptor

- **Path**: `core/interceptor/`
- **Responsibility**: modifies completion requests, reads streaming response text, detects tool calls, filters XML tool blocks, and emits completion metadata.
- **Public API**: `installFetchHook`, `updateHookState`, `ResponseCompletePayload`.
- **Internal Dependencies**: prompt augmentation, skill parser, tool parser, SSE parser.
- **External Dependencies**: DeepSeek completion stream formats and browser fetch/XHR APIs.
- **Complexity Rating**: High.
- **Transformation Notes**: Token speed measurement belongs here because this module already sees raw response deltas before DOM rendering.
- **S.U.P.E.R Assessment**:
  - **S**: Partial. The file already has several responsibilities; keep new logic small and isolated.
  - **U**: Partial. Data should flow from stream parser to bridge callbacks only.
  - **P**: Partial. Add an explicit serializable progress payload instead of ad hoc DOM calls.
  - **E**: Partial. It remains DeepSeek-stream specific.
  - **R**: Partial. A progress tracker helper keeps the feature replaceable.

### Main-World Bridge

- **Path**: `entrypoints/main-world.content.ts`
- **Responsibility**: connects the page-world hook to the extension content script through `window.postMessage`.
- **Public API**: message protocol with `SYNC_STATE`, `RESPONSE_COMPLETE`, and related events.
- **Internal Dependencies**: fetch hook and automation runner.
- **External Dependencies**: browser `window` APIs.
- **Complexity Rating**: Medium.
- **Transformation Notes**: It should forward token speed events without computing UI state.
- **S.U.P.E.R Assessment**:
  - **S**: Compliant. Bridge-only change.
  - **U**: Compliant. The progress event flows one way from hook to content script.
  - **P**: Partial. Message type strings are still not centralized.
  - **E**: Partial. Main-world execution is browser/page-specific.
  - **R**: Partial. The message can be swapped if a central protocol is introduced later.

### Content Script DOM Layer

- **Path**: `entrypoints/content.ts`
- **Responsibility**: owns page DOM integration, theme sync, tool cards, background image behavior, and automation bridge.
- **Public API**: receives main-world messages and mutates the DeepSeek page DOM.
- **Internal Dependencies**: shared types, runtime messages, tool invocation catalog.
- **External Dependencies**: DeepSeek DOM selectors.
- **Complexity Rating**: Critical.
- **Transformation Notes**: The badge should be a focused DOM helper, reusing the existing textarea/input-box discovery pattern instead of embedding stream logic.
- **S.U.P.E.R Assessment**:
  - **S**: Violation. The file is broad, so the new feature should stay in named helpers.
  - **U**: Partial. It should only consume progress payloads.
  - **P**: Partial. Normalize payloads at the boundary.
  - **E**: Partial. DOM heuristics are coupled to DeepSeek markup.
  - **R**: Violation. Page decoration responsibilities remain bundled.

### Token Estimation

- **Path**: `core/token/`
- **Responsibility**: provides the approximate token-counting heuristic.
- **Public API**: `estimateTokenUnits`, `estimateTokens`.
- **Internal Dependencies**: none.
- **External Dependencies**: none.
- **Complexity Rating**: Low.
- **Transformation Notes**: Extracting this avoids duplicated token-counting logic between prompt budgeting and output speed.
- **S.U.P.E.R Assessment**:
  - **S**: Compliant.
  - **U**: Compliant.
  - **P**: Compliant.
  - **E**: Compliant.
  - **R**: Compliant.
