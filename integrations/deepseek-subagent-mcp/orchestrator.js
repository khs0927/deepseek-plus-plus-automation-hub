const fs = require('fs');
const path = require('path');
const { runDeepSeekWebWorker } = require('./engine-deepseek-web');
const { runGeminiWorker } = require('./engine-gemini');
const { runGroqWorker } = require('./engine-groq');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read config.json, using defaults:', e.message);
  }
  return {
    port: 8932,
    defaultEngine: 'auto',
    geminiApiKey: '',
    groqApiKey: '',
    cdpUrl: 'http://127.0.0.1:9223',
    maxConcurrentSubagents: 5
  };
}

class SubagentOrchestrator {
  constructor() {
    this.config = loadConfig();
    this.tasks = new Map();
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
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

  async invokeSubagent({ role, task, engine = 'auto', background = false }) {
    const taskId = `subagent-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const resolvedEngine = this.resolveEngine(engine);

    const taskRecord = {
      id: taskId,
      role: role || 'General Assistant',
      task,
      engine: resolvedEngine,
      status: 'RUNNING',
      startTime: new Date().toISOString(),
      endTime: null,
      result: null,
      error: null
    };

    this.tasks.set(taskId, taskRecord);

    const runPromise = (async () => {
      try {
        let executionResult;
        if (resolvedEngine === 'gemini') {
          const key = process.env.GEMINI_API_KEY || this.config.geminiApiKey;
          executionResult = await runGeminiWorker({ role, task, apiKey: key });
        } else if (resolvedEngine === 'groq') {
          const key = process.env.GROQ_API_KEY || this.config.groqApiKey;
          executionResult = await runGroqWorker({ role, task, apiKey: key });
        } else {
          executionResult = await runDeepSeekWebWorker({
            role,
            task,
            cdpUrl: this.config.cdpUrl || 'http://127.0.0.1:9223'
          });
        }

        taskRecord.status = 'COMPLETED';
        taskRecord.endTime = new Date().toISOString();
        taskRecord.result = executionResult.output;
        taskRecord.resolvedEngine = executionResult.engine;
        return taskRecord;
      } catch (err) {
        taskRecord.status = 'FAILED';
        taskRecord.endTime = new Date().toISOString();
        taskRecord.error = err.message;
        throw err;
      }
    })();

    if (background) {
      return {
        taskId,
        role: taskRecord.role,
        status: 'RUNNING',
        engine: resolvedEngine,
        message: `Subagent [${taskRecord.role}] spawned in background. Check status using check_subagent_status with task_id: '${taskId}'.`
      };
    }

    // Await completion if synchronous
    await runPromise;
    return taskRecord;
  }

  checkStatus(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) {
      return { error: `Subagent task '${taskId}' not found.` };
    }
    return record;
  }

  listSubagents() {
    return Array.from(this.tasks.values()).map(t => ({
      id: t.id,
      role: t.role,
      engine: t.engine,
      status: t.status,
      startTime: t.startTime,
      endTime: t.endTime,
      summary: t.result ? t.result.slice(0, 150) + '...' : (t.error || null)
    }));
  }

  killSubagent(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) {
      return { error: `Subagent task '${taskId}' not found.` };
    }
    if (record.status === 'RUNNING') {
      record.status = 'CANCELLED';
      record.endTime = new Date().toISOString();
      record.error = 'Cancelled by user/agent request';
      return { ok: true, message: `Subagent '${taskId}' cancelled.` };
    }
    return { ok: true, message: `Subagent '${taskId}' is already ${record.status}.` };
  }
}

module.exports = { SubagentOrchestrator };
