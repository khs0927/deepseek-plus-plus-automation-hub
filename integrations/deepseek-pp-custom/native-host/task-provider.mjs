import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir, platform } from 'node:os';
import { DEFAULT_SHELL } from './contracts.mjs';
import { createChildEnv, createShellInvocation } from './os-adapter.mjs';
import { terminateProcessTree } from './process-lifecycle.mjs';

const MAX_TASK_BUFFER_BYTES = 512 * 1024;
const MAX_TASK_RECORDS = 50;

export function createTaskProvider({ logLine }) {
  const tasks = new Map();

  async function spawnTask(args) {
    const command = args?.command;
    if (typeof command !== 'string' || command.trim().length === 0) {
      return { isError: true, content: [{ type: 'text', text: 'command is required and must be a non-empty string.' }] };
    }
    const cwd = typeof args?.cwd === 'string' && args.cwd.trim() ? args.cwd.trim() : homedir();
    const env = createChildEnv(args?.env);
    const { shellBin, shellArgs } = createShellInvocation(command);

    let child;
    try {
      const spawnOptions = {
        cwd,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      };
      if (platform() !== 'win32') spawnOptions.detached = true;
      child = spawn(shellBin, shellArgs, spawnOptions);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to spawn background task: ${err.message}` }],
      };
    }

    const taskId = randomUUID();
    const task = {
      id: taskId,
      pid: child.pid,
      command,
      shell: shellBin,
      cwd,
      startedAt: Date.now(),
      endedAt: null,
      status: 'running',
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      child,
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (task.stdout.length + text.length > MAX_TASK_BUFFER_BYTES) {
        task.stdout = task.stdout.slice(task.stdout.length + text.length - MAX_TASK_BUFFER_BYTES) + text;
      } else {
        task.stdout += text;
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (task.stderr.length + text.length > MAX_TASK_BUFFER_BYTES) {
        task.stderr = task.stderr.slice(task.stderr.length + text.length - MAX_TASK_BUFFER_BYTES) + text;
      } else {
        task.stderr += text;
      }
    });

    child.on('exit', (code, signal) => {
      if (task.status === 'running') {
        task.status = 'exited';
        task.exitCode = typeof code === 'number' ? code : (signal ? -1 : 0);
        task.signal = signal || null;
      }
      if (task.status === 'terminating') task.status = 'killed';
      task.endedAt = Date.now();
      logLine(`Task ${taskId} finished with code ${task.exitCode} (status: ${task.status}).`);
    });

    child.on('error', (err) => {
      task.status = 'error';
      task.endedAt = Date.now();
      task.stderr += `\n[Process Error]: ${err.message}`;
      logLine(`Task ${taskId} error: ${err.message}`);
    });

    // Prune old tasks if exceeding capacity
    if (tasks.size >= MAX_TASK_RECORDS) {
      const oldestFinishedKey = [...tasks.entries()]
        .filter(([, t]) => t.status !== 'running')
        .sort(([, a], [, b]) => (a.endedAt || 0) - (b.endedAt || 0))[0]?.[0];
      if (oldestFinishedKey) tasks.delete(oldestFinishedKey);
    }

    tasks.set(taskId, task);
    logLine(`Spawned background task ${taskId} (PID ${child.pid}): ${command}`);

    return {
      content: [{ type: 'text', text: `Background task started with ID: ${taskId} (PID ${child.pid})\nCommand: ${command}\nUse task_status(task_id: "${taskId}") to check progress.` }],
      structuredContent: {
        ok: true,
        data: {
          task_id: taskId,
          pid: child.pid,
          command,
          cwd,
          status: 'running',
          startedAt: task.startedAt,
        },
      },
    };
  }

  async function getTaskStatus(args) {
    const taskId = args?.task_id;
    if (typeof taskId !== 'string' || taskId.trim().length === 0) {
      return { isError: true, content: [{ type: 'text', text: 'task_id is required.' }] };
    }

    const task = tasks.get(taskId.trim());
    if (!task) {
      return { isError: true, content: [{ type: 'text', text: `Task not found: ${taskId}` }] };
    }

    const offset = typeof args?.offset === 'number' && args.offset >= 0 ? args.offset : 0;
    const stdoutSlice = task.stdout.slice(offset);
    const nextOffset = task.stdout.length;

    const runtimeMs = (task.endedAt ?? Date.now()) - task.startedAt;
    const summary = [
      `Task ID: ${task.id} (PID: ${task.pid})`,
      `Status: ${task.status}`,
      `Command: ${task.command}`,
      `Runtime: ${(runtimeMs / 1000).toFixed(1)}s`,
      task.exitCode !== null ? `Exit Code: ${task.exitCode}` : null,
      task.signal ? `Signal: ${task.signal}` : null,
      stdoutSlice ? `\n--- Output (from offset ${offset}) ---\n${stdoutSlice}` : '\n--- No new output ---',
      task.stderr ? `\n--- Errors ---\n${task.stderr}` : null,
    ].filter(Boolean).join('\n');

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        ok: true,
        data: {
          task_id: task.id,
          pid: task.pid,
          status: task.status,
          exitCode: task.exitCode,
          signal: task.signal,
          stdout: stdoutSlice,
          stderr: task.stderr,
          offset,
          next_offset: nextOffset,
          duration_ms: runtimeMs,
        },
      },
    };
  }

  async function killTask(args) {
    const taskId = args?.task_id;
    if (typeof taskId !== 'string' || taskId.trim().length === 0) {
      return { isError: true, content: [{ type: 'text', text: 'task_id is required.' }] };
    }

    const task = tasks.get(taskId.trim());
    if (!task) {
      return { isError: true, content: [{ type: 'text', text: `Task not found: ${taskId}` }] };
    }

    if (task.status === 'running') {
      task.status = 'terminating';
      task.endedAt = Date.now();
      const termination = await terminateProcessTree(task.child, { logLine, reason: 'task_kill' });
      task.status = 'killed';
      logLine(`Terminated task ${taskId} (PID ${task.pid}).`);
      return {
        content: [{ type: 'text', text: `Terminated background task ${taskId} (PID ${task.pid}).` }],
        structuredContent: { ok: true, data: { task_id: taskId, killed: true, termination } },
      };
    }

    return {
      content: [{ type: 'text', text: `Task ${taskId} was already inactive (${task.status}).` }],
      structuredContent: { ok: true, data: { task_id: taskId, killed: false, status: task.status } },
    };
  }

  async function listTasks() {
    const list = [...tasks.values()].map((t) => ({
      task_id: t.id,
      pid: t.pid,
      command: t.command,
      cwd: t.cwd,
      status: t.status,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      exitCode: t.exitCode,
      duration_ms: (t.endedAt ?? Date.now()) - t.startedAt,
    }));

    const text = list.length === 0
      ? 'No background tasks.'
      : list.map((t) => `[${t.status.toUpperCase()}] ${t.task_id} (PID ${t.pid}): ${t.command} (${(t.duration_ms / 1000).toFixed(1)}s)`).join('\n');

    return {
      content: [{ type: 'text', text }],
      structuredContent: { ok: true, data: { tasks: list } },
    };
  }

  async function shutdown() {
    await Promise.all([...tasks.values()].filter(task => task.status === 'running').map(async task => {
      task.status = 'terminating';
      await terminateProcessTree(task.child, { logLine, reason: 'host_shutdown' });
      task.status = 'killed';
    }));
    tasks.clear();
  }

  return {
    handlers: [
      { name: 'task_spawn', handle: spawnTask },
      { name: 'task_status', handle: getTaskStatus },
      { name: 'task_kill', handle: killTask },
      { name: 'task_list', handle: listTasks },
    ],
    shutdown,
  };
}
