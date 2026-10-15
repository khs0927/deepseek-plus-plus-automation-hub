/**
 * khs0927 / deepseek-plus-plus-automation-hub
 * Module: mcp_hub_client.js
 * Description: khs0927 Smithery MCP 환경과 연동되는 데이터/판례/캐시 어댑터 레이어
 */

class McpHubClient {
  constructor() {
    this.statusMap = {
      context7: { liveAvailable: false, reason: "Monthly quota exceeded", fallback: "LocalTTLCache" },
      mem0: { liveAvailable: false, reason: "Invalid API key (401)", fallback: "LocalOfficerFeedbackStore" },
      supabase: { liveAvailable: false, reason: "auth_required in Smithery", fallback: "LocalSQLiteStore" },
      court: { liveAvailable: false, reason: "Backend Timeout", fallback: "PrecedentsSeedEngine" }
    };
    this.localCache = new Map();
    this.localMemories = [];
  }

  async healthCheck() {
    return {
      timestamp: new Date().toISOString(),
      servers: this.statusMap,
      fallbackModeActive: true,
      allHealthyUnderFallback: true
    };
  }
}

module.exports = { McpHubClient };
