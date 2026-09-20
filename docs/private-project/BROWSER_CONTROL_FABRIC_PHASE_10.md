# Browser Control Fabric — JEV Fast Step (Phase 10)

## Objective

Make DeepSeek++ browser control substantially faster without creating a second authorization or execution path.

The browser runtime keeps one rule: the existing Tool Runtime authorizes one browser tool call, and that call may perform at most one browser mutation. JEV decides the operation and observed target inside that authorized boundary.

## Fast path

```text
DeepSeek goal
   |
   v
browser_fast_step(goal, optional text)
   |
   v
Accessibility.getFullAXTree
   |
   v
observed-node action space
   |
   v
TypeSafe JEV (mandatory, active mode)
   |
   +--> click:<uid>
   +--> fill:<uid>
   +--> scroll up/down
   +--> wait
   +--> done candidate
   +--> blocked
   |
   v
existing BrowserControlService executor
```

The model never returns CSS selectors, coordinates, JavaScript, shell commands, or arbitrary Playwright code for this path. Element actions are bound to `backendDOMNodeId` values already observed in the accessibility snapshot.

## Safety invariants

- JEV is a decision plane, not an authorization plane.
- `browser_fast_step` fails closed unless the JEV decision runtime is configured in `active` mode.
- One invocation performs at most one mutation.
- A `fill` choice without explicit text returns a text-required error instead of inventing text.
- A JEV `done` choice is only a candidate. It never proves task completion.
- Provider errors, abstention, and low-confidence results do not fall back to guessed browser actions.
- Existing BrowserControlService tab restrictions, tool authorization, storage, and CDP attachment remain authoritative.

## Reused work

### DeepSeek++ JEV stack

Phase 10 builds on the existing typed decision plane, TypeSafe JEV provider, decision trace buffer, MCP fan-out, result judge, Skill rerank, subagent routing, and resource-aware scheduler from the stacked JEV branches.

### ASIDE-GPT

Reuse concepts, not a second browser engine:

- stable request/idempotency keys;
- no blind resubmit after ambiguous delivery;
- approval binding to a canonical action digest;
- secure sign-in outside chat;
- completion only from matching provider evidence.

Aside remains an optional official external provider. No private endpoint, token format, or undocumented transport is invented.

### Browser Bridge

The existing `/shared/browser-bridge` remains the remote Windows transport:

```text
DeepSeek++ / operator
  -> loopback operator API
  -> outbound WSS relay
  -> Windows agent
  -> Microsoft Playwright MCP --extension
  -> user-selected existing Chrome/Edge tab
```

It deliberately avoids public CDP/9222 and inbound Windows ports.

## External reference implementations

Patterns evaluated for this phase:

- `browser-use/jev-ultrafast`: dynamic indexed action space, one JEV operation+target decision, strict observed-node execution, independent final verification.
- `citrolabs/ego-lite`: task spaces, text snapshots, direct browser helpers, JS/CDP escape hatches.
- `microsoft/playwright-mcp`: extension mode for existing Chrome/Edge sessions, cookies, extensions, SSO/2FA.
- `remorses/playwriter`: chrome.debugger relay, accessibility refs, stateful Playwright/CDP control of an existing browser.
- `garrytan/gstack`: Aside-first capability probing and explicit fallback/evidence discipline.
- `browser-use/browser-harness`: long-lived CDP harness and self-healing helper layer.
- `ChromeDevTools/chrome-devtools-mcp`: diagnostics, network/performance tracing, and optional JavaScript-evaluation restrictions.

No third-party source is vendored in Phase 10.

## Backend roles

| Backend | Role | Default |
| --- | --- | --- |
| DeepSeek++ extension CDP | low-latency direct action on selected desktop tab | primary |
| Playwright Extension Browser Bridge | remote Windows existing-session control | primary remote |
| Aside | research / official remote agent when authorized | optional, fail closed |
| Ego-lite | isolated task spaces and regression/agent harness where installed | optional |
| Chrome DevTools MCP | network/performance/debug diagnostics | diagnostic |
| Browser Harness / Playwriter | reference and optional adapter candidates | optional |

## Follow-up

Phase 11 should add a normalized backend capability descriptor and JEV backend router only after at least two external backends are live-connected. Until then, the existing MCP capability plane should expose external browser providers and JEV can rank them without duplicating the central router.
