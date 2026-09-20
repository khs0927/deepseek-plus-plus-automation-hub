# JEV Decision Metrics — Phase 8

Phase 8 adds aggregate operational metrics to the existing developer diagnostic export.

## Metrics

For all retained DecisionTrace entries and for each decision purpose:

- total decisions
- applied decisions
- fallback decisions
- applied/fallback rate
- average confidence
- average latency
- p95 latency
- average candidate count
- average selection count
- fallback reason counts

## Privacy boundary

The metrics layer does not store or export raw prompts, tool payloads, credentials, cookies, or API keys.

The existing bounded DecisionTrace stores only routing metadata such as candidate IDs, selected IDs, confidence, timing, and fallback reason. The diagnostic export includes:

- decision runtime mode
- provider ID
- timeout
- aggregate metrics
- trace count

It intentionally does not export the TypeSafe API key or raw decision state.
