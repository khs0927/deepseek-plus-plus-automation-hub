const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runDeepSeekWebWorker } = require('./engine-deepseek-web');
const { runGeminiWorker } = require('./engine-gemini');
const { runGroqWorker } = require('./engine-groq');

const MAX_CONCURRENT_SUBAGENTS = 5;
const MAX_TEXT_BYTES = 128 * 1024;
const ALLOWED_ENGINES = new Set(['auto', 'deepseek_web', 'gemini', 'groq']);

function getConfigPath() {
  return process.env.SUBAGENT_CONFIG_PATH || path.join(__dirname, 'config.json');
}

function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error('Failed to read subagent config; using defaults:', error.message);
  }
  return {
    port: 8932,
    defaultEngine: 'auto',
    geminiApiKey: '',
    groqApiKey: '',
    cdpUrl: 'http://127.0.0.1:9223',
    maxConcurrentSubagents: MAX_CONCURRENT_SUBAGENTS,
    watchdogAutoStart: false,
    allowedOrigins: [],
  };
}

function makeAbortError(message = 'Subagent cancelled.') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'subagent_cancelled';
  return error;
}

function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) {
    throw new Error(`${label} exceeds ${MAX_TEXT_BYTES} bytes.`);
  }
  return value;
}

class SubagentOrchestrator {
  constructor(options = {}) {
    this.config = loadConfig();
    this.tasks = new Map();
    this.queue = [];
    this.activeCount = 0;
    this.runners = options.runners || {
      deepseek_web: runDeepSeekWebWorker,
      gemini: runGeminiWorker,
      groq: runGroqWorker,
    };
  }

  saveConfig(newConfig = {}) {
    const allowed = ['geminiApiKey', 'groqApiKey', 'defaultEngine', 'cdpUrl', 'port'];
    const next = { ...this.config };
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(newConfig, key)) next[key] = newConfig[key];
    }
    if (next.defaultEngine && !ALLOWED_ENGINES.has(next.defaultEngine)) {
      throw new Error('Unsupported default subagent engine.');
    }
    this.config = next;
    fs.writeFileSync(getConfigPath(), JSON.stringify(this.config, null, 2), 'utf8');
    return this.getPublicConfig();
  }

  getPublicConfig() {
    return {
      port: this.config.port,
      defaultEngine: this.config.defaultEngine,
      cdpUrl: this.config.cdpUrl,
      maxConcurrentSubagents: MAX_CONCURRENT_SUBAGENTS,
      hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY || this.config.geminiApiKey),
      hasGroqApiKey: Boolean(process.env.GROQ_API_KEY || this.config.groqApiKey),
    };
  }

  resolveEngine(requestedEngine) {
    const engine = requestedEngine || this.config.defaultEngine || 'auto';
    if (!ALLOWED_ENGINES.has(engine)) throw new Error(`Unsupported subagent engine: ${engine}`);
    if (engine !== 'auto') return engine;
    if (process.env.GEMINI_API_KEY || this.config.geminiApiKey) return 'gemini';
    if (process.env.GROQ_API_KEY || this.config.groqApiKey) return 'groq';
    return 'deepseek_web';
  }

  async invokeSubagent({ role, task, engine = 'auto', background = false } = {}) {
    const safeRole = assertText(role || 'General Assistant', 'role');
    const safeTask = assertText(task, 'task');
    const resolvedEngine = this.resolveEngine(engine);
    const taskId = `subagent-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const record = {
      id: taskId,
      role: safeRole,
      task: safeTask,
      engine: resolvedEngine,
      status: 'QUEUED',
      startTime: null,
      endTime: null,
      result: null,
      error: null,
      resolvedEngine: null,
      abortController: new AbortController(),
      resolve: null,
    };
    record.completion = new Promise(resolve => { record.resolve = resolve; });
    this.tasks.set(taskId, record);
    this.queue.push(record);
    this.pump();

    if (background) {
      return {
        taskId,
        role: record.role,
        status: record.status,
        engine: resolvedEngine,
        message: `Subagent [${record.role}] queued. Check status using check_subagent_status with task_id: '${taskId}'.`,
      };
    }

    const completed = await record.completion;
    if (completed.status === 'CANCELLED') throw makeAbortError(completed.error);
    return this.publicRecord(completed);
  }

  pump() {
    while (this.activeCount < MAX_CONCURRENT_SUBAGENTS && this.queue.length > 0) {
      const record = this.queue.shift();
      if (!record || record.status !== 'QUEUED') continue;
      this.activeCount += 1;
      record.status = 'RUNNING';
      record.startTime = new Date().toISOString();
      void this.runRecord(record);
    }
  }

  async runRecord(record) {
    try {
      const result = await this.runWorker(record);
      if (record.status === 'RUNNING') {
        record.status = 'COMPLETED';
        record.endTime = new Date().toISOString();
        record.result = result.output;
        record.resolvedEngine = result.engine;
      }
    } catch (error) {
      if (record.status === 'RUNNING') {
        record.status = record.abortController.signal.aborted ? 'CANCELLED' : 'FAILED';
        record.endTime = new Date().toISOString();
        record.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      this.activeCount -= 1;
      record.resolve(record);
      this.pump();
    }
  }

  async runWorker(record) {
    const common = {
      role: record.role,
      task: record.task,
      signal: record.abortController.signal,
    };
    if (record.engine === 'gemini') {
      return this.runners.gemini({
        ...common,
        apiKey: process.env.GEMINI_API_KEY || this.config.geminiApiKey,
      });
    }
    if (record.engine === 'groq') {
      return this.runners.groq({
        ...common,
        apiKey: process.env.GROQ_API_KEY || this.config.groqApiKey,
      });
    }
    return this.runners.deepseek_web({
      ...common,
      cdpUrl: this.config.cdpUrl || 'http://127.0.0.1:9223',
    });
  }

  checkStatus(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) return { error: `Subagent task '${taskId}' not found.` };
    return this.publicRecord(record);
  }

  listSubagents() {
    return Array.from(this.tasks.values()).map(record => this.publicRecord(record, true));
  }

  killSubagent(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) return { error: `Subagent task '${taskId}' not found.` };
    if (record.status !== 'QUEUED' && record.status !== 'RUNNING') {
      return { ok: true, message: `Subagent '${taskId}' is already ${record.status}.` };
    }

    record.status = 'CANCELLED';
    record.endTime = new Date().toISOString();
    record.error = 'Cancelled by user/agent request';
    record.abortController.abort(makeAbortError(record.error));
    if (this.queue.includes(record)) {
      this.queue = this.queue.filter(item => item !== record);
      record.resolve(record);
      this.pump();
    }
    return { ok: true, message: `Subagent '${taskId}' cancelled.` };
  }

  publicRecord(record, summaryOnly = false) {
    const result = {
      id: record.id,
      role: record.role,
      engine: record.engine,
      status: record.status,
      startTime: record.startTime,
      endTime: record.endTime,
      resolvedEngine: record.resolvedEngine,
      result: summaryOnly ? undefined : record.result,
      error: record.error,
    };
    if (summaryOnly) {
      result.summary = record.result
        ? `${record.result.slice(0, 150)}${record.result.length > 150 ? '...' : ''}`
        : (record.error || null);
      delete result.result;
    }
    return result;
  }
}

module.exports = {
  MAX_CONCURRENT_SUBAGENTS,
  SubagentOrchestrator,
};
