import { spawn, exec, execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const MCP_CONFIG_PATH = join(homedir(), '.gemini/config/mcp_config.json');
const MCP_DIR = join(homedir(), '.gemini/antigravity/mcp');

let cachedGhToken = null;
function getGhToken() {
  if (cachedGhToken) return cachedGhToken;
  try {
    const token = execSync('gh auth token', { encoding: 'utf8', windowsHide: true }).trim();
    if (token && token.startsWith('gh')) {
      cachedGhToken = token;
      return token;
    }
  } catch {}
  return null;
}

export function createMcpGatewayHandlers() {
  return [
    { name: 'github_control', handle: handleGithubControl },
    { name: 'mcp_list_servers', handle: handleMcpListServers },
    { name: 'mcp_list_tools', handle: handleMcpListTools },
    { name: 'mcp_call', handle: handleMcpCall },
  ];
}

function readMcpConfig() {
  if (!existsSync(MCP_CONFIG_PATH)) {
    throw new Error(`MCP config file not found: ${MCP_CONFIG_PATH}`);
  }
  const raw = readFileSync(MCP_CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

// 1. GitHub Control Handler
async function handleGithubControl(args) {
  const action = args?.action || 'exec_gh';
  const command = args?.command || '';
  const repo = args?.repo || '';
  const cwd = args?.cwd || 'C:\\code';
  const timeout = typeof args?.timeout_ms === 'number' ? args.timeout_ms : 60000;

  try {
    let cmdToRun = '';
    switch (action) {
      case 'repo_list':
        cmdToRun = 'gh repo list --limit 30 --json name,description,url,isPrivate,updatedAt';
        break;
      case 'repo_view':
        if (!repo) throw new Error('repo is required for repo_view (e.g. owner/repo)');
        cmdToRun = `gh repo view ${repo} --json name,description,url,defaultBranchRef,stargazerCount`;
        break;
      case 'pr_list':
        cmdToRun = repo ? `gh pr list --repo ${repo} --limit 20 --json number,title,state,author,url` : 'gh pr list --limit 20 --json number,title,state,author,url';
        break;
      case 'pr_create':
        if (!args.title || !args.body) throw new Error('title and body are required for pr_create');
        cmdToRun = `gh pr create --title "${args.title.replace(/"/g, '\\"')}" --body "${args.body.replace(/"/g, '\\"')}" ${repo ? `--repo ${repo}` : ''}`;
        break;
      case 'issue_list':
        cmdToRun = repo ? `gh issue list --repo ${repo} --limit 20 --json number,title,state,author,url` : 'gh issue list --limit 20 --json number,title,state,author,url';
        break;
      case 'issue_create':
        if (!args.title || !args.body) throw new Error('title and body are required for issue_create');
        cmdToRun = `gh issue create --title "${args.title.replace(/"/g, '\\"')}" --body "${args.body.replace(/"/g, '\\"')}" ${repo ? `--repo ${repo}` : ''}`;
        break;
      case 'git_status':
        cmdToRun = 'git status -s';
        break;
      case 'exec_gh':
      default:
        if (!command) throw new Error('command is required for exec_gh');
        cmdToRun = command.startsWith('gh ') ? command : `gh ${command}`;
        break;
    }

    const { stdout, stderr } = await execAsync(cmdToRun, {
      cwd,
      timeout,
      env: process.env,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    });

    let structured = null;
    try {
      structured = JSON.parse(stdout.trim());
    } catch {
      structured = { rawOutput: stdout.trim() };
    }

    const outputText = stdout.trim() || stderr.trim() || '(No output)';
    return {
      content: [{ type: 'text', text: outputText }],
      structuredContent: { ok: true, action, command: cmdToRun, data: structured },
      isError: false,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `GitHub command failed: ${error.message}` }],
      structuredContent: { ok: false, error: error.message }
    };
  }
}

// 2. MCP List Servers Handler
async function handleMcpListServers() {
  try {
    const config = readMcpConfig();
    const servers = [];

    for (const [name, srv] of Object.entries(config.mcpServers || {})) {
      const schemaDir = join(MCP_DIR, name);
      let toolCount = 0;
      let tools = [];
      if (existsSync(schemaDir)) {
        try {
          const files = readdirSync(schemaDir).filter(f => f.endsWith('.json'));
          toolCount = files.length;
          tools = files.map(f => f.replace(/\.json$/, ''));
        } catch {}
      }

      servers.push({
        id: name,
        command: srv.command,
        args: srv.args || [],
        cwd: srv.cwd || null,
        toolCount,
        sampleTools: tools.slice(0, 5)
      });
    }

    const summaryText = `Found ${servers.length} registered MCP servers:\n` +
      servers.map(s => `- ${s.id} (${s.toolCount} tools): ${s.sampleTools.join(', ')}...`).join('\n');

    return {
      content: [{ type: 'text', text: summaryText }],
      structuredContent: { ok: true, totalServers: servers.length, servers },
      isError: false,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to list MCP servers: ${error.message}` }]
    };
  }
}

// 3. MCP List Tools Handler
async function handleMcpListTools(args) {
  const serverName = args?.server;
  if (!serverName) {
    return { isError: true, content: [{ type: 'text', text: 'server argument is required' }] };
  }

  try {
    const schemaDir = join(MCP_DIR, serverName);
    const tools = [];

    if (existsSync(schemaDir)) {
      const files = readdirSync(schemaDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = JSON.parse(readFileSync(join(schemaDir, file), 'utf8'));
          tools.push({
            name: file.replace(/\.json$/, ''),
            description: content.description || '',
            inputSchema: content.parameters || content.inputSchema || {}
          });
        } catch {}
      }
    }

    if (tools.length === 0) {
      const discovered = await discoverToolsViaStdio(serverName);
      tools.push(...discovered);
    }

    const summaryText = `Server '${serverName}' exposes ${tools.length} tools:\n` +
      tools.map(t => `- ${t.name}: ${t.description.slice(0, 100)}`).join('\n');

    return {
      content: [{ type: 'text', text: summaryText }],
      structuredContent: { ok: true, server: serverName, toolCount: tools.length, tools },
      isError: false,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to list tools for '${serverName}': ${error.message}` }]
    };
  }
}

// 4. MCP Call Tool Handler
async function handleMcpCall(args) {
  const serverName = args?.server;
  const toolName = args?.tool;
  const toolArgs = args?.arguments || {};
  const timeoutMs = typeof args?.timeout_ms === 'number' ? args.timeout_ms : 60000;

  if (!serverName || !toolName) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'server and tool arguments are required' }]
    };
  }

  const config = readMcpConfig();
  const srv = config.mcpServers?.[serverName];
  if (!srv) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Server '${serverName}' is not registered in mcp_config.json` }]
    };
  }

  try {
    const result = await invokeStdioMcp(serverName, srv, toolName, toolArgs, timeoutMs);
    const textContent = Array.isArray(result?.content)
      ? result.content.map(c => c.text || JSON.stringify(c)).join('\n')
      : JSON.stringify(result, null, 2);

    return {
      content: [{ type: 'text', text: textContent }],
      structuredContent: { ok: true, server: serverName, tool: toolName, result },
      isError: !!result?.isError,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `MCP Call Error (${serverName}:${toolName}): ${error.message}` }],
      structuredContent: { ok: false, error: error.message }
    };
  }
}

function resolveCommand(cmd) {
  if (cmd.toLowerCase() === 'node' || cmd.toLowerCase() === 'node.exe') {
    return process.execPath;
  }
  return cmd;
}

// Stdio JSON-RPC Helper
function invokeStdioMcp(serverName, srvConfig, toolName, toolArguments, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...(srvConfig.env || {}) };
    if (serverName === 'github' || !env.GITHUB_PERSONAL_ACCESS_TOKEN) {
      const ghToken = getGhToken();
      if (ghToken) env.GITHUB_PERSONAL_ACCESS_TOKEN = ghToken;
    }

    const resolvedCmd = resolveCommand(srvConfig.command);
    const useShell = resolvedCmd.endsWith('.bat') || resolvedCmd.endsWith('.cmd') || resolvedCmd === 'cmd' || resolvedCmd === 'cmd.exe';

    const child = spawn(resolvedCmd, srvConfig.args || [], {
      cwd: srvConfig.cwd || process.cwd(),
      env,
      shell: useShell,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let buffer = '';
    let isSettled = false;

    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        child.kill();
        reject(new Error(`MCP tool call timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.on('error', (err) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep remainder

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id === 1) {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            child.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: toolArguments
              }
            }) + '\n');
          } else if (msg.id === 2) {
            if (!isSettled) {
              isSettled = true;
              clearTimeout(timer);
              child.kill();
              if (msg.error) {
                reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              } else {
                resolve(msg.result);
              }
            }
          }
        } catch {}
      }
    });

    // Send initialize
    const initPayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'deepseek-mcp-gateway', version: '1.0.0' }
      }
    };
    child.stdin.write(JSON.stringify(initPayload) + '\n');
  });
}

async function discoverToolsViaStdio(serverName) {
  const config = readMcpConfig();
  const srv = config.mcpServers?.[serverName];
  if (!srv) return [];

  return new Promise((resolve) => {
    const env = { ...process.env, ...(srv.env || {}) };
    if (serverName === 'github' || !env.GITHUB_PERSONAL_ACCESS_TOKEN) {
      const ghToken = getGhToken();
      if (ghToken) env.GITHUB_PERSONAL_ACCESS_TOKEN = ghToken;
    }
    const resolvedCmd = resolveCommand(srv.command);
    const useShell = resolvedCmd.endsWith('.bat') || resolvedCmd.endsWith('.cmd') || resolvedCmd === 'cmd' || resolvedCmd === 'cmd.exe';

    const child = spawn(resolvedCmd, srv.args || [], {
      cwd: srv.cwd || process.cwd(),
      env,
      shell: useShell,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let buffer = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve([]);
    }, 10000);

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id === 1) {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
          } else if (msg.id === 2) {
            clearTimeout(timer);
            child.kill();
            resolve(msg.result?.tools || []);
          }
        } catch {}
      }
    });

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'discover', version: '1.0' } }
    }) + '\n');
  });
}
