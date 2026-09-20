const path = require('path');
process.env.SUBAGENT_CONFIG_PATH ||= path.join(__dirname, 'config.json');
module.exports = require('../../deepseek-subagent-mcp/orchestrator');
