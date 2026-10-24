import { spawn } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { createChildEnv } from './os-adapter.mjs';
import { attachProcessToJobObject, terminateProcessTree } from './process-lifecycle.mjs';

const MAX_STREAM_BYTES = 64 * 1024;
const MAX_ARGS = 64;
const MAX_ARG_CHARS = 4096;

// Intended to be used only by the existing high-risk native MCP tool gateway.
// Direct argv execution avoids a per-command shell and shell interpolation.
export function createDirectProcessHandler({ spawnProcess = spawn, terminate = terminateProcessTree } = {}) {
  return async function executeDirect(args, { signal } = {}) {
    const file = args?.file;
    const argv = args?.args ?? [];
    if (typeof file !== 'string' || !file.trim() || /[\0\r\n]/.test(file) ||
        (platform() === 'win32' && /\.(?:cmd|bat)$/i.test(file)) ||
        !Array.isArray(argv) || argv.length > MAX_ARGS ||
        argv.some(value => typeof value !== 'string' || value.length > MAX_ARG_CHARS || value.includes('\0'))) {
      return errorResult('file must be an executable (not .cmd/.bat on Windows) and args must be up to 64 valid strings.');
    }
    if (signal?.aborted) return errorResult('Direct command was cancelled before start.', { cancelled: true });
    const timeoutMs = Number.isInteger(args?.timeout_ms) ? Math.min(Math.max(1000, args.timeout_ms), 600000) : 120000;
    const cwd = typeof args?.cwd === 'string' && args.cwd.trim() ? args.cwd : homedir();
    let child;
    try {
      child = spawnProcess(file, argv, {
        cwd,
        env: createChildEnv(args?.env),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(platform() === 'win32' ? {} : { detached: true }),
      });
    } catch (error) {
      return errorResult('Direct process start failed: ' + (error instanceof Error ? error.message : String(error)));
    }
    return new Promise(resolve => {
      const stdout = []; const stderr = [];
      let stdoutBytes = 0; let stderrBytes = 0;
      let stdoutRetained = 0; let stderrRetained = 0;
      let completed = false; let timedOut = false; let cancelled = false;
      let terminationTimer; let stopping = false;
      const collect = (chunks, stream) => chunk => {
        const isStdout = stream === 'stdout';
        if (isStdout) stdoutBytes += chunk.length;
        else stderrBytes += chunk.length;
        const retained = isStdout ? stdoutRetained : stderrRetained;
        if (retained >= MAX_STREAM_BYTES) return;
        const slice = chunk.subarray(0, MAX_STREAM_BYTES - retained);
        chunks.push(slice);
        if (isStdout) stdoutRetained += slice.length;
        else stderrRetained += slice.length;
      };
      const finish = (exitCode, processSignal, startupError) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutTimer);
        clearTimeout(terminationTimer);
        signal?.removeEventListener('abort', abort);
        const result = {
          file, args: argv, cwd, exitCode: typeof exitCode === 'number' ? exitCode : -1,
          signal: processSignal ?? null,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: startupError ?? Buffer.concat(stderr).toString('utf8'),
          stdoutBytes, stderrBytes,
          truncated: stdoutBytes > MAX_STREAM_BYTES || stderrBytes > MAX_STREAM_BYTES,
          timedOut, cancelled,
        };
        resolve({
          isError: result.exitCode !== 0 || timedOut || cancelled || Boolean(startupError),
          structuredContent: { ok: result.exitCode === 0 && !timedOut && !cancelled && !startupError, data: result },
          content: [{ type: 'text', text: 'Direct execution ' + (result.exitCode === 0 ? 'finished' : 'failed') + ' (exit ' + result.exitCode + ').' }],
        });
      };
      const stop = reason => {
        if (completed || stopping) return;
        stopping = true;
        if (reason === 'timeout') timedOut = true;
        else cancelled = true;
        void terminate(child, { reason: 'direct_process_' + reason });
        terminationTimer = setTimeout(() => finish(-1, 'SIGKILL', 'Process termination not confirmed.'), 5000);
      };
      const abort = () => stop('cancel');
      const timeoutTimer = setTimeout(() => stop('timeout'), timeoutMs);
      child.stdout?.on('data', collect(stdout, 'stdout'));
      child.stderr?.on('data', collect(stderr, 'stderr'));
      child.once('error', error => finish(-1, null, error.message));
      child.once('close', (code, codeSignal) => finish(code, codeSignal));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      if (platform() === 'win32') {
        const helper = setTimeout(() => {
          if (!completed && child.exitCode === null) void attachProcessToJobObject(child);
        }, 25);
        helper.unref?.();
      }
    });
  };
}

function errorResult(message, extra = {}) {
  return { isError: true, content: [{ type: 'text', text: message }],
    structuredContent: { ok: false, data: { exitCode: -1, stdout: '', stderr: message, ...extra } } };
}
