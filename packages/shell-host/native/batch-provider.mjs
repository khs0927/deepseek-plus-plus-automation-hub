// Two bounded native batch tools share one scheduler and the existing MCP authority.
// shell_batch executes ordinary commands; process_batch uses direct argv execution.
const MAX_JOBS = 12;
const MAX_CONCURRENCY = 4;
const MAX_FIELD_CHARS = 2048; // Prevent 1 MB Chrome Native Messaging response failures.

export function createBatchToolHandlers({ shellHandler, directHandler, maxConcurrency = MAX_CONCURRENCY }) {
  if (typeof shellHandler !== 'function') throw new TypeError('shellHandler is required');
  const handlers = [{ name: 'shell_batch', handle: createBatch(shellHandler, 'shell') }];
  if (directHandler) {
    if (typeof directHandler !== 'function') throw new TypeError('directHandler must be a function');
    handlers.push({ name: 'process_batch', handle: createBatch(directHandler, 'process') });
  }
  return handlers;

  function createBatch(execute, kind) {
    return async (args, { signal } = {}) => {
      const jobs = args?.jobs;
      if (!Array.isArray(jobs) || jobs.length < 1 || jobs.length > MAX_JOBS ||
          jobs.some(job => !validJob(job, kind))) {
        return failure(kind === 'shell'
          ? 'jobs must contain 1-12 nonempty shell commands.'
          : 'jobs must contain 1-12 direct executable files and string argv arrays.');
      }
      if (args?.parallel !== undefined && typeof args.parallel !== 'boolean') return failure('parallel must be a boolean.');
      if (args?.stop_on_error !== undefined && typeof args.stop_on_error !== 'boolean') return failure('stop_on_error must be a boolean.');
      if (args?.concurrency !== undefined && (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > MAX_CONCURRENCY)) {
        return failure('concurrency must be an integer between 1 and 4.');
      }
      const parallel = args?.parallel === true;
      if (parallel && args?.stop_on_error === true) return failure('stop_on_error requires sequential mode.');
      const concurrency = parallel ? Math.max(1, Math.min(MAX_CONCURRENCY, maxConcurrency, args?.concurrency ?? maxConcurrency)) : 1;
      const stopOnError = args?.stop_on_error === true;
      const results = Array(jobs.length).fill(null);
      let next = 0;
      let stopped = false;
      const startedAt = Date.now();
      async function worker() {
        while (next < jobs.length && !stopped && !signal?.aborted) {
          const index = next++;
          const start = Date.now();
          try {
            const response = await execute(jobs[index], { signal });
            const data = response?.structuredContent?.data ?? {};
            const ok = response?.structuredContent?.ok === true && response.isError !== true;
            const stdout = boundText(data.stdout);
            const stderr = boundText(data.stderr ?? (ok ? '' : response?.content?.[0]?.text ?? 'Command failed'));
            results[index] = {
              index, ok, exitCode: data.exitCode ?? null, stdout: stdout.text, stderr: stderr.text,
              stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated,
              timedOut: data.timedOut === true, cancelled: data.cancelled === true,
              durationMs: Date.now() - start,
            };
          } catch (error) {
            results[index] = {
              index, ok: false, exitCode: null, stdout: '',
              stderr: boundText(error instanceof Error ? error.message : String(error)).text,
              timedOut: false, cancelled: signal?.aborted === true, durationMs: Date.now() - start,
            };
          }
          if (!results[index].ok && stopOnError) stopped = true;
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
      const entries = results.map((result, index) => result ?? {
        index, ok: false, skipped: true, exitCode: null, stdout: '', stderr: 'Not executed.',
        timedOut: false, cancelled: signal?.aborted === true, durationMs: 0,
      });
      const complete = entries.every(result => result.ok);
      const data = {
        jobs: entries, total: jobs.length,
        succeeded: entries.filter(result => result.ok).length,
        failed: entries.filter(result => !result.ok && !result.skipped).length,
        skipped: entries.filter(result => result.skipped).length,
        mode: parallel ? 'parallel' : 'sequential', concurrency,
        durationMs: Date.now() - startedAt,
      };
      return { isError: !complete, structuredContent: { ok: complete, data },
        content: [{ type: 'text', text: 'Batch: ' + data.succeeded + '/' + data.total + ' succeeded, ' + data.failed + ' failed, ' + data.skipped + ' skipped (' + data.durationMs + 'ms).' }] };
    };
  }
}

function validJob(job, kind) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return false;
  if (kind === 'shell') return typeof job.command === 'string' && Boolean(job.command.trim());
  return typeof job.file === 'string' && Boolean(job.file.trim()) &&
    (job.args === undefined || (Array.isArray(job.args) && job.args.length <= 64 && job.args.every(a => typeof a === 'string' && a.length <= 4096)));
}

function boundText(value) {
  const text = typeof value === 'string' ? value : '';
  return { text: text.slice(0, MAX_FIELD_CHARS), truncated: text.length > MAX_FIELD_CHARS };
}
function failure(message) {
  return { isError: true, structuredContent: { ok: false, error: message },
    content: [{ type: 'text', text: message }] };
}
