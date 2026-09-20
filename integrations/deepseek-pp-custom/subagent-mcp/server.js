const path = require('path');
process.env.SUBAGENT_CONFIG_PATH ||= path.join(__dirname, 'config.json');
const { startServer } = require('../../deepseek-subagent-mcp/server');
startServer();
