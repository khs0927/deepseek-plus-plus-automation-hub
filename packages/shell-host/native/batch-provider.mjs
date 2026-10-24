// One authorized MCP invocation can execute multiple shell commands.
// No new transport or authority: delegates to the existing shell_exec handler.
export function createBatchToolHandlers({ shellHandler, maxConcurrency = 4 }) {
  if (typeof shellHandler !== 'function') throw new TypeError('shellHandler is required');
  async function shellBatch(args, { signal } = {}) {
    const jobs = args?.jobs;
    if (!Array.isArray(jobs) || jobs.length < 1 || jobs.length > 12 ||
        jobs.some(job => !job || typeof job.command !== 'string' || !job.command.trim())) {
      return failure('jobs must contain 1–12 nonempty shell commands.');
    }
    const parallel = args?.parallel === true;
    const concurrency = parallel
      ? Math.max(1, Math.min(4, maxConcurrency, Number.isInteger(args?.concurrency) ? args.concurrency : maxConcurrency))
      : 1;
    const stopOnError = args?.stop_on_error === true;
    if (parallel && stopOnError) return failure('stop_on_error requires sequential mode (parallel=false).');
    const results = Array(jobs.length).fill(null);
    let next = 0;
    let stopped = false;
    const startedAt = Date.now();
    async function worker() {
      while (next < jobs.length && !stopped && !signal?.aborted) {
        const index = next++;
        const job = jobs[index];
        const begin = Date.now();
        try {
          const response = await shellHandler({
            command: job.command,
            ...(job.cwd === undefined ? {} : { cwd: job.cwd }),
            ...(job.env === undefined ? {} : { env: job.env }),
            ...(job.timeout_ms === undefined ? {} : { timeout_ms: job.timeout_ms }),
          }, { signal });
          const data = response?.structuredContent?.data ?? {};
          const ok = response?.structuredContent?.ok === true && response?.isError !== true;
          results[index] = {
            index, ok, exitCode: data.exitCode ?? null, stdout: data.stdout ?? '',
            stderr: data.stderr ?? (ok ? '' : response?.content?.[0]?.text ?? 'Command failed'),
            timedOut: data.timedOut === true, cancelled: data.cancelled === true,
            durationMs: Date.now() - begin,
          };
          if (!ok && stopOnError) stopped = true;
        } catch (error) {
          results[index] = { index, ok: false, exitCode: null, stdout: '',
            stderr: error instanceof Error ? error.message : String(error),
            timedOut: false, cancelled: signal?.aborted === true, durationMs: Date.now() - begin };
          if (stopOnError) stopped = true;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
    const entries = results.map((result, index) => result ?? {
      index, ok: false, skipped: true, exitCode: null, stdout: '', stderr: 'Not executed.',
      timedOut: false, cancelled: signal?.aborted === true, durationMs: 0,
    });
    const complete = entries.every(result => result.ok);
    const data = { jobs: entries, total: jobs.length,
      succeeded: entries.filter(result => result.ok).length,
      failed: entries.filter(result => !result.ok && !result.skipped).length,
      skipped: entries.filter(result => result.skipped).length,
      mode: parallel ? 'parallel' : 'sequential', concurrency,
      durationMs: Date.now() - startedAt };
    return { isError: !complete, structuredContent: { ok: complete, data },
      content: [{ type: 'text', text: JSON.stringify(data) }] };
  }
  return [{ name: 'shell_batch', handle: shellBatch }];
}
function failure(message) {
  return { isError: true, structuredContent: { ok: false, error: message },
    content: [{ type: 'text', text: message }] };
}
