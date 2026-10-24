# DeepSeek++ Custom — Fast Local Execution (prototype)

This change adds `shell_batch` to the existing Shell Native Host without
creating a new network listener, browser permission, or authentication surface.
It delegates each command to the already-authorized `shell_exec` implementation.

## Behavior

- One MCP call accepts 1–12 commands (`jobs`).
- Sequential is the default, preserves dependencies, and supports `stop_on_error`.
- Independent commands can run concurrently using `parallel: true` and
  `concurrency: 1..4`, with stable result ordering.
- Failed, timed-out, cancelled, or skipped commands are explicitly represented.
- The original stdout/stderr, exit code, and per-command elapsed time are returned.
- The runtime retains the existing Shell Host authorization and process cleanup.
- An external Fast RPC gateway is **not** added: Native Messaging is already persistent.

### Example

```json
{
  "jobs": [
    { "command": "git status --short", "cwd": "C:\\CODE\\deepseek-pp" },
    { "command": "node --version" },
    { "command": "python --version" }
  ],
  "parallel": true,
  "concurrency": 3
}
```

Commands operating on the same files, Git worktree, database, CAD application,
or other shared state should use the default sequential mode. The caller
remains responsible for reviewing high-risk commands.

## Validation

The Vitest suite in `tests/shell-host-batch.test.ts` tests order, concurrency
limits, failure stopping, validation, and exception isolation. Run:

```bash
npm ci
npx vitest run tests/shell-host-batch.test.ts tests/shell-host-runtime-modules.test.ts
npm run compile
npm run smoke:shell
```

**No throughput improvement is claimed without a machine-level benchmark.**
This patch reduces tool round trips; individual commands still start a shell.
Longer-term optimization would benchmark direct APIs and resident subprocesses.
Do not use web-session concurrency tricks to bypass provider limits.

Status: source patch; live Windows Native Messaging smoke test pending.
