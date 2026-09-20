import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const custom = path.join(root, 'integrations', 'deepseek-pp-custom', 'subagent-mcp');

const wrappers = {
  'server.js': `const path = require('path');\nprocess.env.SUBAGENT_CONFIG_PATH ||= path.join(__dirname, 'config.json');\nconst { startServer } = require('../../deepseek-subagent-mcp/server');\nstartServer();\n`,
  'orchestrator.js': `const path = require('path');\nprocess.env.SUBAGENT_CONFIG_PATH ||= path.join(__dirname, 'config.json');\nmodule.exports = require('../../deepseek-subagent-mcp/orchestrator');\n`,
  'session-keeper.js': `module.exports = require('../../deepseek-subagent-mcp/session-keeper');\n`,
  'watchdog-daemon.js': `module.exports = require('../../deepseek-subagent-mcp/watchdog-daemon');\n`,
  'engine-deepseek-web.js': `module.exports = require('../../deepseek-subagent-mcp/engine-deepseek-web');\n`,
  'engine-gemini.js': `module.exports = require('../../deepseek-subagent-mcp/engine-gemini');\n`,
  'engine-groq.js': `module.exports = require('../../deepseek-subagent-mcp/engine-groq');\n`,
  'request-helper.js': `module.exports = require('../../deepseek-subagent-mcp/request-helper');\n`,
};

const failures = [];
for (const [file, expected] of Object.entries(wrappers)) {
  const actual = fs.readFileSync(path.join(custom, file), 'utf8').replaceAll('\r\n', '\n');
  if (actual !== expected) failures.push(file);
}

if (failures.length > 0) {
  console.error(`Custom Subagent generated wrappers are stale: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Custom Subagent wrappers match the canonical source.');
}
