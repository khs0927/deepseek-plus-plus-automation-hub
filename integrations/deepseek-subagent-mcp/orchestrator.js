const fs = require('fs');
const path = require('path');
const { randomUUID } = require('node:crypto');
const { runDeepSeekWebWorker } = require('./engine-deepseek-web');
const { runGeminiWorker } = require('./engine-gemini');
const { runGroqWorker } = require('./engine-groq');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;
const DEFAULT_CONCURRENCY = 5;
const MAX_BATCH_TASKS = 32;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
    }
  } catch (e) {
    console.error('Failed to read config.json, using defaults:', e.message);
  }
  return normalizeConfig({});
}

function normalizeConfig(value) {
  const config = value && typeof value === 'object' ? value : {};
  const maxConcurrentSubagents = clampInteger(
    config.maxConcurrentSubagents,
    MIN_CONCURRENCY,
    MAX_CONCURRENCY,
    DEFAULT_CONCURRENCY
  );
  return {
    port: Number.isInteger(config.port) ? config.port : 8932,
    defaultEngine: typeof config.defaultEngine === 'string' ? config.defaultEngine : 'auto',
    geminiApiKey: typeof config.geminiApiKey === 'string' ? config.geminiApiKey : '',
    groqApiKey: typeof config.groqApiKey === 'string' ? config.groqApiKey : '',
    cdpUrl: typeof config.cdpUrl === 'string' && config.cdpUrl.trim()
      ? config.cdpUrl.trim()
      : 'http://127.0.0.1:9223',
    maxConcurrentSubagents
  };
}

function clampInteger(value, min, max, fallback) {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

class SubagentOrchestrator {
  constructor(options = {}) {
    this.config = loadConfig();
    this.tasks = new Map();
    this.pendingQueue = [];
    this.completions = new Map();
    this.runningJobs = new Map();
    this.activeCount = 0;
    this.workerRunners = options.workerRunners || {
      deepseek_web: async ({ role, task }) => runDeepSeekWebWorker({
        role,
        task,
        cdpUrl: this.config.cdpUrl || 'http://127.0.0.1:9223'
      }),
      gemini: async ({ role, task }) => {
        const key = process.env.GEMINI_API_KEY || this.config.geminiApiKey;
        return runGeminiWorker({ role, task, apiKey: key });
      },
      groq: async ({ role, task }) => {
        const key = process.env.GROQ_API_KEY || this.config.groqApiKey;
        return runGroqWorker({ role, task, apiKey: key });
      }
    };
  }

  saveConfig(newConfig) {
    this.config = normalizeConfig({ ...this.config, ...newConfig });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
    this.drainQueue();
    return this.config;
  }

  resolveEngine(requestedEngine) {
    const engine = requestedEngine || this.config.defaultEngine || 'auto';
    if (engine !== 'auto') return engine;

    const geminiKey = process.env.GEMINI_API_KEY || this.config.geminiApiKey;
    if (geminiKey) return 'gemini';

    const groqKey = process.env.GROQ_API_KEY || this.config.groqApiKey;
    if (groqKey) return 'groq';

    return 'deepseek_web';
  }

  getEngineAvailability() {
    return {
      deepseek_web: true,
      gemini: Boolean(process.env.GEMINI_API_KEY || this.config.geminiApiKey),
      groq: Boolean(process.env.GROQ_API_KEY || this.config.groqApiKey)
    };
  }

  getStats() {
    const counts = {
      QUEUED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      CANCELLED: 0
    };
    for (const task of this.tasks.values()) {
      if (Object.hasOwn(counts, task.status)) counts[task.status] += 1;
    }
    return {
      active: this.activeCount,
      queued: this.pendingQueue.length,
      maxConcurrent: this.config.maxConcurrentSubagents,
      total: this.tasks.size,
      counts
    };
  }

  async invokeSubagent({ role, task, engine = 'auto', background = false }) {
    const normalizedRole = typeof role === 'string' && role.trim()
      ? role.trim()
      : 'General Assistant';
    if (typeof task !== 'string' || !task.trim()) {
      throw new Error('Subagent task must be a non-empty string.');
    }

    const taskId = createTaskId();
    const resolvedEngine = this.resolveEngine(engine);
    if (!this.workerRunners[resolvedEngine]) {
      throw new Error(`Unsupported subagent engine: ${resolvedEngine}`);
    }

    const taskRecord = {
      id: taskId,
      role: normalizedRole,
      task: task.trim(),
      engine: resolvedEngine,
      requestedEngine: engine,
      status: 'QUEUED',
      queuedAt: new Date().toISOString(),
      startTime: null,
      endTime: null,
      result: null,
      error: null,
      cancelRequested: false
    };

    let resolveCompletion;
    let rejectCompletion;
    const completion = new Promise((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    void completion.catch(() => {});

    const job = {
      taskRecord,
      resolve: resolveCompletion,
      reject: rejectCompletion,
      settled: false
    };

    this.tasks.set(taskId, taskRecord);
    this.completions.set(taskId, completion);
    this.pendingQueue.push(job);
    this.drainQueue();

    if (background) {
      return this.createSpawnReceipt(taskRecord);
    }

    return completion;
  }

  async invokeSubagentBatch({ tasks, background = false }) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Subagent batch requires at least one task.');
    }
    if (tasks.length > MAX_BATCH_TASKS) {
      throw new Error(`Subagent batch accepts at most ${MAX_BATCH_TASKS} tasks.`);
    }

    const receipts = await Promise.all(tasks.map((entry) => this.invokeSubagent({
      role: entry?.role,
      task: entry?.task,
      engine: entry?.engine || 'auto',
      background: true
    })));

    if (background) {
      return {
        background: true,
        taskIds: receipts.map((receipt) => receipt.taskId),
        tasks: receipts,
        stats: this.getStats()
      };
    }

    const results = await Promise.all(receipts.map(async (receipt) => {
      try {
        return await this.waitForSubagent(receipt.taskId);
      } catch {
        return this.checkStatus(receipt.taskId);
      }
    }));

    return {
      background: false,
      taskIds: receipts.map((receipt) => receipt.taskId),
      tasks: results,
      stats: this.getStats()
    };
  }

  async waitForSubagent(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) throw new Error(`Subagent task '${taskId}' not found.`);
    if (isTerminal(record.status)) return record;
    const completion = this.completions.get(taskId);
    if (!completion) return record;
    return completion;
  }

  createSpawnReceipt(taskRecord) {
    return {
      taskId: taskRecord.id,
      role: taskRecord.role,
      status: taskRecord.status,
      engine: taskRecord.engine,
      queuePosition: taskRecord.status === 'QUEUED'
        ? this.pendingQueue.findIndex((job) => job.taskRecord.id === taskRecord.id) + 1
        : 0,
      message: `Subagent [${taskRecord.role}] accepted as ${taskRecord.status}. Check status using check_subagent_status with task_id: '${taskRecord.id}'.`
    };
  }

  drainQueue() {
    const limit = this.config.maxConcurrentSubagents;
    while (this.activeCount < limit && this.pendingQueue.length > 0) {
      const job = this.pendingQueue.shift();
      if (!job || job.taskRecord.status === 'CANCELLED') continue;
      this.activeCount += 1;
      this.runningJobs.set(job.taskRecord.id, job);
      void this.runJob(job);
    }
  }

  async runJob(job) {
    const record = job.taskRecord;
    record.status = 'RUNNING';
    record.startTime = new Date().toISOString();

    try {
      const runner = this.workerRunners[record.engine];
      const executionResult = await runner({
        role: record.role,
        task: record.task,
        taskId: record.id
      });

      if (record.status !== 'CANCELLED') {
        record.status = 'COMPLETED';
        record.endTime = new Date().toISOString();
        record.result = executionResult?.output ?? '';
        record.resolvedEngine = executionResult?.engine || record.engine;
        this.resolveJob(job, record);
      }
    } catch (err) {
      if (record.status === 'CANCELLED') {
        this.resolveJob(job, record);
      } else {
        record.status = 'FAILED';
        record.endTime = new Date().toISOString();
        record.error = err instanceof Error ? err.message : String(err);
        this.rejectJob(job, err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.runningJobs.delete(record.id);
      this.completions.delete(record.id);
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.drainQueue();
    }
  }

  resolveJob(job, value) {
    if (job.settled) return;
    job.settled = true;
    job.resolve(value);
  }

  rejectJob(job, error) {
    if (job.settled) return;
    job.settled = true;
    job.reject(error);
  }

  checkStatus(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) {
      return { error: `Subagent task '${taskId}' not found.` };
    }
    return {
      ...record,
      queuePosition: record.status === 'QUEUED'
        ? this.pendingQueue.findIndex((job) => job.taskRecord.id === taskId) + 1
        : 0
    };
  }

  listSubagents() {
    return Array.from(this.tasks.values()).map((task) => ({
      id: task.id,
      role: task.role,
      engine: task.engine,
      status: task.status,
      queuedAt: task.queuedAt,
      startTime: task.startTime,
      endTime: task.endTime,
      queuePosition: task.status === 'QUEUED'
        ? this.pendingQueue.findIndex((job) => job.taskRecord.id === task.id) + 1
        : 0,
      summary: task.result
        ? task.result.slice(0, 150) + (task.result.length > 150 ? '...' : '')
        : (task.error || null)
    }));
  }

  killSubagent(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) {
      return { error: `Subagent task '${taskId}' not found.` };
    }
    if (isTerminal(record.status)) {
      return { ok: true, message: `Subagent '${taskId}' is already ${record.status}.` };
    }

    record.status = 'CANCELLED';
    record.cancelRequested = true;
    record.endTime = new Date().toISOString();
    record.error = 'Cancelled by user/agent request';

    const queuedIndex = this.pendingQueue.findIndex((job) => job.taskRecord.id === taskId);
    if (queuedIndex >= 0) {
      const [job] = this.pendingQueue.splice(queuedIndex, 1);
      this.resolveJob(job, record);
      this.completions.delete(taskId);
      this.drainQueue();
      return { ok: true, message: `Queued subagent '${taskId}' cancelled.` };
    }

    const runningJob = this.runningJobs.get(taskId);
    if (runningJob) {
      // Existing engines do not yet expose AbortSignal. Mark the task cancelled,
      // release any waiter immediately, and discard the eventual worker result.
      this.resolveJob(runningJob, record);
      return {
        ok: true,
        message: `Running subagent '${taskId}' marked cancelled. The underlying worker may finish cleanup in the background.`
      };
    }

    return { ok: true, message: `Subagent '${taskId}' cancelled.` };
  }
}

function createTaskId() {
  if (typeof randomUUID === 'function') {
    return `subagent-${randomUUID()}`;
  }
  return `subagent-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function isTerminal(status) {
  return status === 'COMPLETED' ||
    status === 'FAILED' ||
    status === 'CANCELLED';
}

module.exports = {
  MAX_BATCH_TASKS,
  SubagentOrchestrator
};
