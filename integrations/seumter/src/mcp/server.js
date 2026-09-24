const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const axios = require('axios');
const {
  closeSeumterSession,
  inspectPage,
  listTabs,
  normalizeCdpUrl,
  openSeumterSession,
  safeScreenshotPath,
} = require('../control/agent_control');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const PORT = process.env.SEUMTER_MCP_PORT || 3300;
const CDP_URL = normalizeCdpUrl(process.env.CDP_URL || 'http://127.0.0.1:9222');
const ALLOW_EVAL = process.env.SEUMTER_ALLOW_EVAL === '1';

// Helper: Get the active EAIS page from the dedicated Edge CDP profile.
async function getSeumterPage() {
  return openSeumterSession({ endpoint: CDP_URL });
}

// Tool definitions
const TOOLS = [
  {
    name: 'seumter_status',
    description: 'Check Microsoft Edge connection (CDP 9222) and active Seumter (EAIS) tab status, URL, title, and WebSquare state.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'seumter_launch_edge',
    description: 'Start or reuse the dedicated visible Edge CDP profile for Seumter. This is an explicit local process action.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'seumter_list_tabs',
    description: 'List tabs in the dedicated Edge CDP profile and mark EAIS/Seumter tabs without changing them.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'seumter_get_page_content',
    description: 'Extract visible text and active form summary from the currently open Seumter page.',
    inputSchema: {
      type: 'object',
      properties: {
        maxLength: { type: 'number', description: 'Maximum characters of text to return (default: 4000)' }
      }
    }
  },
  {
    name: 'seumter_inspect',
    description: 'Return structured Seumter page state, visible text, login indicators, and interactive element metadata without executing arbitrary code.',
    inputSchema: {
      type: 'object',
      properties: {
        maxLength: { type: 'number', description: 'Maximum visible text characters (default: 6000, maximum: 20000)' },
        maxElements: { type: 'number', description: 'Maximum interactive elements to return (default: 120, maximum: 300)' }
      }
    }
  },
  {
    name: 'seumter_eval_websquare',
    description: 'Execute JavaScript in the Seumter page. Disabled by default; set SEUMTER_ALLOW_EVAL=1 only for trusted local diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code to execute in browser page context' }
      },
      required: ['script']
    }
  },
  {
    name: 'seumter_click_element',
    description: 'Click an element (button, tab, link) on the Seumter page by CSS selector or exact visible text.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (optional if text is provided)' },
        text: { type: 'string', description: 'Visible text of the element to click (e.g. "기본개요", "저장")' }
      }
    }
  },
  {
    name: 'seumter_fill_input',
    description: 'Set the value of an input field on the Seumter page by CSS selector or WebSquare component ID.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or WebSquare ID' },
        value: { type: 'string', description: 'Text value to set' }
      },
      required: ['selector', 'value']
    }
  },
  {
    name: 'seumter_run_checklists',
    description: 'Execute Seumter Korean Building Regulation Checklist automation (156 items: building + location).',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['all', 'building', 'location'],
          description: 'Which checklist to execute (all, building, or location)'
        }
      }
    }
  },
  {
    name: 'seumter_fill_overview',
    description: 'Auto-fill Seumter project basic overview (owner, designer, site, parking, septic tank).',
    inputSchema: {
      type: 'object',
      properties: {
        configFile: { type: 'string', description: 'Config JSON filename under src/config (default: myeongji_project.json)' }
      }
    }
  },
  {
    name: 'seumter_search_address',
    description: 'Search building register address in Seumter backend database (Road or Jibun address).',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Road or Jibun address to search (e.g. "예술대학로 105")' }
      },
      required: ['address']
    }
  },
  {
    name: 'seumter_take_screenshot',
    description: 'Capture a screenshot of the active Seumter tab and save it locally.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename for screenshot (optional)' }
      }
    }
  }
];

// Tool call handler
async function handleToolCall(name, args) {
  switch (name) {
    case 'seumter_status': {
      let browser;
      try {
        const res = await getSeumterPage();
        browser = res.browser;
        const inspection = await inspectPage(res.page, { maxElements: 30, maxTextLength: 1000 });
        const activeTabs = await res.page.evaluate(() => Array.from(document.querySelectorAll('a, button, li.w2tab_active, .active'))
          .map(element => (element.innerText || '').trim())
          .filter(text => text.length > 1 && text.length < 20)
          .slice(0, 10));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'connected',
              cdpUrl: CDP_URL,
              pageTitle: inspection.title,
              pageUrl: inspection.url,
              isSeumter: inspection.isSeumter,
              loginState: inspection.loginState,
              hasWebSquare: inspection.hasWebSquare,
              sessionRepPresent: inspection.sessionRepPresent,
              webSquare: {
                activeTabs,
                bodyLength: inspection.bodyLength,
                bodyPreview: inspection.bodyPreview
              }
            }, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              error: err.message,
              hint: 'Ensure Edge is running on 127.0.0.1:9222 (e.g. via 시작_Edge.bat)'
            }, null, 2)
          }],
          isError: true
        };
      } finally {
        await closeSeumterSession({ browser });
      }
    }

    case 'seumter_launch_edge': {
      const script = path.resolve(__dirname, '../../launch_visible_edge.ps1');
      const result = spawnSync('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', script,
      ], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 20000,
        env: { ...process.env, CDP_URL },
      });
      if (result.error) {
        return { content: [{ type: 'text', text: `Edge launch error: ${result.error.message}` }], isError: true };
      }
      if (result.status !== 0) {
        return { content: [{ type: 'text', text: `Edge launcher exited with code ${result.status}` }], isError: true };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 'launched', cdpUrl: CDP_URL }, null, 2)
        }]
      };
    }

    case 'seumter_list_tabs': {
      try {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(await listTabs({ endpoint: CDP_URL }), null, 2)
          }]
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Tab listing error: ${err.message}` }], isError: true };
      }
    }

    case 'seumter_get_page_content': {
      let browser;
      try {
        const res = await getSeumterPage();
        browser = res.browser;
        const page = res.page;
        const maxLength = args.maxLength || 4000;
        const text = await page.evaluate(() => document.body.innerText);
        const title = await page.title();
        const url = page.url();

        return {
          content: [{
            type: 'text',
            text: `[Page Title]: ${title}\n[URL]: ${url}\n\n[Content Preview]:\n${text.slice(0, maxLength)}`
          }]
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error reading page: ${err.message}` }], isError: true };
      } finally {
        await closeSeumterSession({ browser });
      }
    }

    case 'seumter_inspect': {
      let session;
      try {
        session = await getSeumterPage();
        const inspection = await inspectPage(session.page, {
          maxElements: args.maxElements,
          maxTextLength: args.maxLength,
        });
        return { content: [{ type: 'text', text: JSON.stringify(inspection, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Inspection error: ${err.message}` }], isError: true };
      } finally {
        await closeSeumterSession(session);
      }
    }

    case 'seumter_eval_websquare': {
      if (!ALLOW_EVAL) {
        return {
          content: [{ type: 'text', text: 'seumter_eval_websquare is disabled. Use seumter_inspect or the structured control CLI. Set SEUMTER_ALLOW_EVAL=1 only for an explicitly trusted diagnostic session.' }],
          isError: true
        };
      }
      let browser;
      try {
        const res = await getSeumterPage();
        browser = res.browser;
        const page = res.page;
        const result = await page.evaluate(args.script);
        return {
          content: [{
            type: 'text',
            text: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
          }]
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Evaluation error: ${err.message}` }], isError: true };
      } finally {
        await closeSeumterSession({ browser });
      }
    }

    case 'seumter_click_element': {
      let browser;
      try {
        const res = await getSeumterPage();
        browser = res.browser;
        const page = res.page;

        if (args.selector) {
          await page.locator(args.selector).first().click({ timeout: 5000 });
          return { content: [{ type: 'text', text: `Clicked selector: ${args.selector}` }] };
        } else if (args.text) {
          const clicked = await page.evaluate((targetText) => {
            const elements = Array.from(document.querySelectorAll('a, button, span, li, input[type="button"]'));
            const match = elements.find(el => (el.innerText || el.value || '').trim() === targetText.trim());
            if (match) {
              match.click();
              return true;
            }
            return false;
          }, args.text);

          if (clicked) {
            return { content: [{ type: 'text', text: `Successfully clicked element with text: "${args.text}"` }] };
          } else {
            return { content: [{ type: 'text', text: `Could not find clickable element with text: "${args.text}"` }], isError: true };
          }
        } else {
          return { content: [{ type: 'text', text: 'Either selector or text is required.' }], isError: true };
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Click failed: ${err.message}` }], isError: true };
      } finally {
        await closeSeumterSession({ browser });
      }
    }

    case 'seumter_fill_input': {
      let browser;
      try {
        const res = await getSeumterPage();
        browser = res.browser;
        const page = res.page;
        await page.locator(args.selector).first().fill(args.value, { timeout: 5000 });
        return { content: [{ type: 'text', text: `Filled "${args.selector}" with value: "${args.value}"` }] };
      } catch (err) {
        // Fallback: try WebSquare component setValue
        try {
          const compResult = await res.page.evaluate(({ id, val }) => {
            if (window.$p && window.$p.getComponentById) {
              const comp = window.$p.getComponentById(id);
              if (comp && comp.setValue) {
                comp.setValue(val);
                return true;
              }
            }
            return false;
          }, { id: args.selector.replace(/^#/, ''), val: args.value });

          if (compResult) {
            return { content: [{ type: 'text', text: `Filled WebSquare component "${args.selector}" with: "${args.value}"` }] };
          }
        } catch (_) {}

        return { content: [{ type: 'text', text: `Fill failed: ${err.message}` }], isError: true };
      } finally {
        await closeSeumterSession({ browser });
      }
    }

    case 'seumter_run_checklists': {
      try {
        const mode = args.mode || 'all';
        if (mode === 'building') {
          const { runBuildingChecklist } = require('../modules/checklist_building');
          await runBuildingChecklist();
          return { content: [{ type: 'text', text: 'Building checklist (107 items) completed successfully.' }] };
        } else if (mode === 'location') {
          const { runLocationChecklist } = require('../modules/checklist_location');
          await runLocationChecklist();
          return { content: [{ type: 'text', text: 'Location checklist (49 items) completed successfully.' }] };
        } else {
          const { runAllChecklists } = require('../modules/checklist_all');
          await runAllChecklists();
          return { content: [{ type: 'text', text: 'All checklists (156 items: building + location) completed successfully.' }] };
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Checklist execution failed: ${err.message}` }], isError: true };
      }
    }

    case 'seumter_fill_overview': {
      try {
        const { fillProjectOverview } = require('../modules/fill_project_overview');
        const configFile = args.configFile || 'myeongji_project.json';
        await fillProjectOverview(configFile);
        return { content: [{ type: 'text', text: `Basic project overview filled successfully using ${configFile}.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Overview fill failed: ${err.message}` }], isError: true };
      }
    }

    case 'seumter_search_address': {
      try {
        const res = await axios.post('https://search.eais.go.kr/bldrgstmst/_search', {
          query: {
            multi_match: {
              query: args.address,
              type: 'cross_fields',
              operator: 'and',
              fields: ['jibunAddr', 'roadAddr^3'],
              tie_breaker: 0.3
            }
          },
          size: 5
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });

        const hits = res.data?.hits?.hits || [];
        const formatted = hits.map(h => ({
          mgmBldrgstPk: h._source?.mgmBldrgstPk,
          bldNm: h._source?.bldNm,
          roadAddr: h._source?.roadAddr,
          jibunAddr: h._source?.jibunAddr,
          mainPurpsCdNm: h._source?.mainPurpsCdNm,
          totArea: h._source?.totArea,
          grndFlrCnt: h._source?.grndFlrCnt
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ total: hits.length, results: formatted }, null, 2)
          }]
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Search failed: ${err.message}` }], isError: true };
      }
    }

    case 'seumter_take_screenshot': {
      let browser;
      try {
        const res = await getSeumterPage();
        browser = res.browser;
        const page = res.page;
        const scratchDir = path.resolve(__dirname, '../../scratch');
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        const filePath = safeScreenshotPath(args.filename, scratchDir);
        await page.screenshot({ path: filePath });
        return {
          content: [{
            type: 'text',
            text: `Screenshot saved to: ${filePath}`
          }]
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Screenshot failed: ${err.message}` }], isError: true };
      } finally {
        await closeSeumterSession({ browser });
      }
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
}

// Server factory for each connection
function createMcpServer() {
  const server = new Server(
    { name: 'seumter-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handleToolCall(name, args || {});
  });

  return server;
}

// Express App
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const activeTransports = new Map();

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'seumter-mcp',
    port: PORT,
    tools: TOOLS.map(t => t.name)
  });
});

// SSE Endpoint
app.get('/sse', async (req, res) => {
  console.log('[SSE] New SSE client connection request');
  const server = createMcpServer();
  const transport = new SSEServerTransport('/messages', res);

  activeTransports.set(transport.sessionId, { server, transport });

  transport.onclose = () => {
    console.log(`[SSE] Client disconnected (session: ${transport.sessionId})`);
    activeTransports.delete(transport.sessionId);
  };

  try {
    await server.connect(transport);
    console.log(`[SSE] Server connected to session: ${transport.sessionId}`);
  } catch (err) {
    console.error('[SSE] Error connecting transport:', err);
    activeTransports.delete(transport.sessionId);
  }
});

// POST Messages for SSE session
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const entry = activeTransports.get(sessionId);
  if (!entry) {
    res.status(404).send(`Session not found: ${sessionId}`);
    return;
  }
  await entry.transport.handlePostMessage(req, res);
});

// Direct JSON-RPC POST Endpoint for Streamable HTTP / standard HTTP transport
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'seumter-mcp', version: '1.0.0' }
      }
    });
  }
  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    });
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const result = await handleToolCall(name, args || {});
    return res.json({
      jsonrpc: '2.0',
      id,
      result
    });
  }
  return res.json({
    jsonrpc: '2.0',
    id,
    result: {}
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`========================================================`);
  console.log(`🏛️  Seumter MCP Server is running!`);
  console.log(`📡 URL: http://127.0.0.1:${PORT}`);
  console.log(`🔌 SSE Endpoint: http://127.0.0.1:${PORT}/sse`);
  console.log(`🔌 HTTP Endpoint: http://127.0.0.1:${PORT}/mcp`);
  console.log(`🔍 Health Check: http://127.0.0.1:${PORT}/health`);
  console.log(`🛠️  Tools: ${TOOLS.length} Seumter tools available`);
  console.log(`========================================================`);
});
