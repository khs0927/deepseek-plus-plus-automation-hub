const http = require('http');
const crypto = require('crypto');
const { SubagentOrchestrator } = require('./orchestrator');
const { SessionKeeper } = require('./session-keeper');
const { WatchdogDaemon } = require('./watchdog-daemon');

const MAX_REQUEST_BODY_BYTES = 1 * 1024 * 1024;
const DEFAULT_EXTENSION_ORIGIN = 'chrome-extension://kdmpkkahkhdmdhfkdihkopikgcocbpbf';

const TOOLS = [
  { name: 'invoke_subagent', description: 'Run a bounded subagent task.', inputSchema: { type: 'object', required: ['role', 'task'], properties: { role: { type: 'string' }, task: { type: 'string' }, engine: { type: 'string', enum: ['auto', 'deepseek_web', 'gemini', 'groq'] }, background: { type: 'boolean' } } } },
  { name: 'check_subagent_status', description: 'Read one subagent task.', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' } } } },
  { name: 'list_subagents', description: 'List subagent tasks.', inputSchema: { type: 'object', properties: {} } },
  { name: 'kill_subagent', description: 'Cancel one running or queued subagent.', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' } } } },
  { name: 'set_subagent_config', description: 'Update non-secret subagent settings.', inputSchema: { type: 'object', properties: { geminiApiKey: { type: 'string' }, groqApiKey: { type: 'string' }, defaultEngine: { type: 'string' }, cdpUrl: { type: 'string' }, port: { type: 'number' } } } },
  { name: 'list_deepseek_sessions', description: 'Inspect open DeepSeek tabs.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_session_logs', description: 'Read current session and trace logs.', inputSchema: { type: 'object', properties: { session_id: { type: 'string' } } } },
  { name: 'wake_up_session', description: 'Explicitly resume one DeepSeek session.', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, custom_message: { type: 'string' }, force_prompt: { type: 'boolean' } } } },
  { name: 'configure_watchdog', description: 'Configure or inspect the watchdog.', inputSchema: { type: 'object', properties: { auto_wake: { type: 'boolean' }, interval_seconds: { type: 'number' }, start: { type: 'boolean' }, stop: { type: 'boolean' } } } },
];

function createSseClientRegistry() {
  const clients = new Map();
  return {
    add(clientId, response) { clients.set(clientId, response); },
    delete(clientId) { clients.delete(clientId); },
    has(clientId) { return clients.has(clientId); },
    send(clientId, message) {
      const response = clients.get(clientId);
      if (!response) return false;
      try {
        response.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
        return true;
      } catch {
        clients.delete(clientId);
        return false;
      }
    },
    size() { return clients.size; },
  };
}

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isAllowedOrigin(origin, configuredOrigins = []) {
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1');
  } catch {
    return false;
  }
}

function readRequestBody(req, maxBytes = MAX_REQUEST_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error(`Request body exceeds ${maxBytes} bytes.`), { code: 'request_body_too_large' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleJsonRpc(request, { orchestrator, sessionKeeper, watchdog }) {
  const { id, method, params = {} } = request || {};
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: params.protocolVersion || '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'DeepSeek++ Subagent Manager', version: '1.3.0' } } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method !== 'tools/call') return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method '${method}' not found` } };

  try {
    let text;
    switch (params.name) {
      case 'invoke_subagent': {
        const result = await orchestrator.invokeSubagent(params.arguments || {});
        text = result.result
          ? `### Subagent completed\n- Task ID: ${result.id}\n- Status: ${result.status}\n\n${result.result}`
          : `Subagent ${result.taskId} accepted with status ${result.status}.`;
        break;
      }
      case 'check_subagent_status': {
        const result = orchestrator.checkStatus(params.arguments?.task_id);
        text = result.error || JSON.stringify(result);
        break;
      }
      case 'list_subagents': text = JSON.stringify(orchestrator.listSubagents()); break;
      case 'kill_subagent': {
        const result = orchestrator.killSubagent(params.arguments?.task_id);
        text = result.message || JSON.stringify(result);
        break;
      }
      case 'set_subagent_config': text = JSON.stringify(orchestrator.saveConfig(params.arguments || {})); break;
      case 'list_deepseek_sessions': text = JSON.stringify(await sessionKeeper.scanSessions()); break;
      case 'get_session_logs': text = JSON.stringify(await sessionKeeper.getDetailedSessionLogs(params.arguments?.session_id)); break;
      case 'wake_up_session': text = JSON.stringify(await sessionKeeper.wakeUpSession({ sessionId: params.arguments?.session_id, customMessage: params.arguments?.custom_message, forcePrompt: params.arguments?.force_prompt })); break;
      case 'configure_watchdog': {
        const args = params.arguments || {};
        if (args.start) watchdog.start();
        if (args.stop) watchdog.stop();
        text = JSON.stringify(watchdog.configure({ autoWake: args.auto_wake, intervalMs: args.interval_seconds ? args.interval_seconds * 1000 : undefined }));
        break;
      }
      default: throw new Error(`Unknown tool: ${params.name}`);
    }
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
  } catch (error) {
    return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `Tool execution failed: ${error.message}` }] } };
  }
}

function createSubagentServer(options = {}) {
  const orchestrator = options.orchestrator || new SubagentOrchestrator();
  const sessionKeeper = options.sessionKeeper || new SessionKeeper({ cdpUrl: orchestrator.config.cdpUrl || 'http://127.0.0.1:9223' });
  const watchdog = options.watchdog || new WatchdogDaemon({ cdpUrl: orchestrator.config.cdpUrl || 'http://127.0.0.1:9223' });
  const registry = options.registry || createSseClientRegistry();
  const configuredOrigins = [
    DEFAULT_EXTENSION_ORIGIN,
    ...(Array.isArray(orchestrator.config.allowedOrigins) ? orchestrator.config.allowedOrigins : []),
    ...(process.env.SUBAGENT_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
  ];
  const port = options.port ?? orchestrator.config.port ?? 8932;

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!isLoopbackAddress(req.socket.remoteAddress) || !isAllowedOrigin(origin, configuredOrigins)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Loopback access and an allowed origin are required.' }));
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Subagent-Client-Id');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/sse')) {
      const clientId = crypto.randomUUID();
      const endpoint = `http://127.0.0.1:${port}/message?client_id=${encodeURIComponent(clientId)}`;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: endpoint\ndata: ${endpoint}\n\n`);
      registry.add(clientId, res);
      req.on('close', () => registry.delete(clientId));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/message') {
      try {
        const raw = await readRequestBody(req);
        const request = JSON.parse(raw);
        const clientId = url.searchParams.get('client_id') || req.headers['x-subagent-client-id'];
        const response = await handleJsonRpc(request, { orchestrator, sessionKeeper, watchdog });
        if (!response) {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (!clientId || !registry.has(clientId)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'A live SSE client_id is required for JSON-RPC responses.' }));
          return;
        }
        registry.send(clientId, response);
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        const status = error.code === 'request_body_too_large' ? 413 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return { server, orchestrator, sessionKeeper, watchdog, registry, port };
}

function startServer(options = {}) {
  const service = createSubagentServer(options);
  const host = options.host || process.env.SUBAGENT_HOST || '127.0.0.1';
  service.server.listen(service.port, host, () => {
    console.log(`Subagent MCP listening on http://${host}:${service.port}`);
  });
  if (process.env.SUBAGENT_WATCHDOG_AUTOSTART === '1') service.watchdog.start();
  return service;
}

if (require.main === module) startServer();

module.exports = {
  MAX_REQUEST_BODY_BYTES,
  TOOLS,
  createSseClientRegistry,
  isAllowedOrigin,
  isLoopbackAddress,
  readRequestBody,
  handleJsonRpc,
  createSubagentServer,
  startServer,
};
