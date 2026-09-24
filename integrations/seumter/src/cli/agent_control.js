#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { DEFAULT_CDP_URL, normalizeCdpUrl } = require('../control/agent_control');

const MCP_HOST = '127.0.0.1';
const MCP_PORT = Number(process.env.SEUMTER_MCP_PORT || 3300);
const MCP_BASE = `http://${MCP_HOST}:${MCP_PORT}`;

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'status';
  const args = {};
  for (let index = command === argv[0] ? 1 : 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return { command, args };
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return {
    name: 'seumter-agent-control',
    transport: `${MCP_BASE}/mcp`,
    commands: {
      status: 'Check CDP and EAIS login/page state without changing the page.',
      tabs: 'List open tabs in the dedicated CDP Edge profile.',
      inspect: 'Return page state, visible text, and interactive elements.',
      click: 'Click one target. Requires --confirm and exactly one of --selector or --text.',
      fill: 'Fill one selector. Requires --confirm, --selector, and --value.',
      screenshot: 'Capture a PNG in integrations/seumter/scratch. Requires --confirm.',
      launch: 'Explicitly start the dedicated visible Edge CDP profile.'
    },
    globalOptions: ['--cdp-url <url>']
  };
}

async function fetchJson(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error || body.message || 'request failed'}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function daemonHealth() {
  try { return await fetchJson(`${MCP_BASE}/health`, {}, 800); }
  catch { return null; }
}

async function ensureDaemon(endpoint) {
  const existing = await daemonHealth();
  if (existing) return existing;
  const script = path.resolve(__dirname, '../../start_control_daemon.ps1');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, CDP_URL: endpoint, SEUMTER_MCP_PORT: String(MCP_PORT) },
    timeout: 15000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Control daemon launcher exited with code ${result.status}`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await daemonHealth();
    if (health) return health;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Seumter control daemon did not become ready');
}

async function callTool(name, args, timeoutMs = 30000) {
  const payload = await fetchJson(`${MCP_BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args || {} } })
  }, timeoutMs);
  if (payload.error) throw new Error(payload.error.message || 'MCP call failed');
  const result = payload.result || {};
  const text = Array.isArray(result.content) ? result.content.find(item => item.type === 'text')?.text || '' : '';
  if (result.isError) throw new Error(text || `MCP tool failed: ${name}`);
  try { return JSON.parse(text); }
  catch { return { status: 'completed', detail: text }; }
}

async function run() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (command === 'help' || args.help) { print(usage()); return; }
  const endpoint = normalizeCdpUrl(args['cdp-url'] || DEFAULT_CDP_URL);
  await ensureDaemon(endpoint);

  switch (command) {
    case 'status':
      print(await callTool('seumter_status'));
      return;
    case 'tabs':
      print(await callTool('seumter_list_tabs'));
      return;
    case 'inspect':
      print(await callTool('seumter_inspect', { maxElements: numberArg(args['max-elements'], 120), maxLength: numberArg(args['max-text'], 6000) }));
      return;
    case 'click': {
      if (args.confirm !== true && args.confirm !== 'true') throw new Error('Write action requires --confirm');
      const selector = typeof args.selector === 'string' ? args.selector : undefined;
      const text = typeof args.text === 'string' ? args.text : undefined;
      if ((selector ? 1 : 0) === (text ? 1 : 0)) throw new Error('Provide exactly one of --selector or --text');
      print(await callTool('seumter_click_element', { selector, text }));
      return;
    }
    case 'fill': {
      if (args.confirm !== true && args.confirm !== 'true') throw new Error('Write action requires --confirm');
      if (typeof args.selector !== 'string' || typeof args.value !== 'string') throw new Error('fill requires --selector and --value');
      print(await callTool('seumter_fill_input', { selector: args.selector, value: args.value }));
      return;
    }
    case 'screenshot':
      if (args.confirm !== true && args.confirm !== 'true') throw new Error('Screenshot capture requires --confirm');
      print(await callTool('seumter_take_screenshot', { filename: typeof args.filename === 'string' ? args.filename : undefined }));
      return;
    case 'launch': {
      if (args.confirm !== true && args.confirm !== 'true') throw new Error('launch requires --confirm');
      print(await callTool('seumter_launch_edge', {}, 30000));
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

run().catch(error => {
  print({ status: 'error', error: error.message });
  process.exitCode = 1;
});
