# DeepSeek++ Custom — Fast Local Execution (prototype)

This isolated development branch adds two *high-risk, explicitly authorized*
batch tools to the existing native Shell MCP host. It does not introduce an
unauthenticated network endpoint, an API-key bypass, new browser permissions,
or a separate authority or persistence system.

## Fast paths

| Tool | Execution | Use case |
| --- | --- | --- |
| \`local_dir_list\` / \`local_file_search\` | Existing direct local APIs | Prefer for file discovery |
| \`shell_session_begin\` / \`shell_session_exec\` | Existing persistent shell | Commands sharing environment/state |
| \`shell_batch\` | Existing \`shell_exec\` process handler | Arbitrary shell syntax and sequential pipelines |
| \`process_batch\` | New shell-free \`spawn(file, argv, {shell:false})\` | Direct executable calls, Git/Python/Node/ripgrep, many independent tasks |

Both batches accept 1–12 tasks per MCP round trip, preserve result order,
default to sequential, and support explicit concurrency 1–4 for tasks that
do not share mutable state. Sequential \`stop_on_error\` avoids running
dependent commands after failure. Cancellation is forwarded to active tasks.

Each returned stdout and stderr is truncated to at most 2,048 JavaScript
characters. \`stdoutTruncated\` / \`stderrTruncated\` indicate lost output.
The response keeps a compact text summary, avoiding duplication of large
JSON and staying under the native messaging message size cap.

**Caution**: only use \`parallel: true\` for independent commands.
Do not run concurrent Git writes in the same worktree, installer operations,
CAD COM calls, or writes to the same output file. Direct execution does not
make an unsafe binary safe: \`cmd.exe\`, script interpreters, and mutable
commands retain their risks and require high-risk authorization.

### Direct executable example (Windows)

\`\`\`json
{
  "jobs": [
    { "file": "git.exe", "args": ["status", "--short"], "cwd": "C:\\CODE\\deepseek-pp" },
    { "file": "node.exe", "args": ["--version"] },
    { "file": "python.exe", "args": ["--version"] }
  ],
  "parallel": true,
  "concurrency": 3
}
\`\`\`

For Windows \`.bat\` / \`.cmd\` files, use the existing \`shell_batch\`
tool rather than the direct path. The direct runner needs a real executable.

## Open-source engineering references

- [Node.js child_process](https://nodejs.org/api/child_process.html): direct
  \`spawn\` / \`execFile\` can avoid the extra shell; prefer argument arrays.
- [Execa termination](https://github.com/sindresorhus/execa/blob/main/docs/termination.md):
  illustrates descendant termination and cancellation tradeoffs.
- [p-limit](https://github.com/sindresorhus/p-limit): bounded concurrency;
  implemented here with an existing dependency-free worker loop.
- [ripgrep](https://github.com/BurntSushi/ripgrep) / [fd](https://github.com/sharkdp/fd):
  optional external binaries for fast search. No automatic installation.

Adding new runtime dependencies would increase the Native Host installation
footprint. This change uses the Node.js built-in child_process API and retains
existing host lifecycle cleanup.

## Validation commands

\`\`\`bash
npm ci
npx vitest run tests/shell-host-batch.test.ts tests/shell-host-direct-process.test.ts tests/shell-host-external-contract.test.ts tests/shell-policy.test.ts
npm run compile
npm run smoke:shell
node scripts/fast-execution-bench.mjs 12
\`\`\`

The benchmark prints p50/p95 and batch latencies; run it on the actual
Windows machine. No Windows speedup or full CI green claim is made based on
the isolated Linux tests.

### Evidence and status

- Isolated Node.js v22.16.0 Linux harness: 8/8 functional checks passed
  (sequential, parallel limit, fail-fast, bounded message size, literal argv,
  missing executable, abort, timeout). The harness used local stubs for the
  host's environment and process-tree adapters.
- GitHub branch source, native registry, tool descriptor contract, fixture,
  installer manifest, policy, Vitest and smoke tests updated.
- Full repository dependency installation, TypeScript compilation, production
  Native Messaging E2E, and Windows process termination remain **unverified**.
- No publishing, production deployment, merging, or spending authorized.

Follow-up benchmarks should separate tool round-trip time, PowerShell
startup, Node process startup, CPU/memory contention and application work.
Use the existing persistent shell for jobs benefiting from state reuse.
