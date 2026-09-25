// DeepSeek++ Custom default MCP/Skill state initializer.
//
// This file is appended to the canonical browser build by
// scripts/package-custom-extension.mjs. Keeping it outside the generated
// extension makes the custom package reproducible while the runtime remains
// on the canonical authorization implementation.
async function initDeepSeekPPCustomDefaults() {
  try {
    const resp = await fetch(chrome.runtime.getURL('defaults.json'));
    if (!resp.ok) return;
    const defaults = await resp.json();
    const existing = await chrome.storage.local.get(['deepseek_pp_mcp_servers', 'deepseek_pp_skills']);
    const updates = {};
    if (defaults.deepseek_pp_mcp_servers) {
      if (!existing.deepseek_pp_mcp_servers) {
        updates.deepseek_pp_mcp_servers = defaults.deepseek_pp_mcp_servers;
      } else {
        const cur = typeof existing.deepseek_pp_mcp_servers === 'string'
          ? JSON.parse(existing.deepseek_pp_mcp_servers)
          : JSON.parse(JSON.stringify(existing.deepseek_pp_mcp_servers));
        const def = typeof defaults.deepseek_pp_mcp_servers === 'string'
          ? JSON.parse(defaults.deepseek_pp_mcp_servers)
          : defaults.deepseek_pp_mcp_servers;
        cur.servers = cur.servers || [];
        cur.toolCaches = cur.toolCaches || [];
        let modified = false;
        for (const ds of (def.servers || [])) {
          const found = cur.servers.some(s => s.id === ds.id || (s.transport && ds.transport && s.transport.url && s.transport.url === ds.transport.url));
          if (!found) {
            cur.servers.push(ds);
            modified = true;
          }
        }
        for (const dc of (def.toolCaches || [])) {
          const found = cur.toolCaches.some(c => c.serverId === dc.serverId);
          if (!found) {
            cur.toolCaches.push(dc);
            modified = true;
          }
        }
        if (modified) {
          updates.deepseek_pp_mcp_servers = typeof existing.deepseek_pp_mcp_servers === 'string'
            ? JSON.stringify(cur)
            : cur;
        }
      }
    }
    if ((!existing.deepseek_pp_skills || existing.deepseek_pp_skills.length === 0) && defaults.deepseek_pp_skills) {
      updates.deepseek_pp_skills = defaults.deepseek_pp_skills;
      updates.deepseek_pp_skill_sources = defaults.deepseek_pp_skill_sources;
      updates.deepseek_pp_bundled_skill_enabled = defaults.deepseek_pp_bundled_skill_enabled;
      updates.deepseek_pp_skill_auto_activation = defaults.deepseek_pp_skill_auto_activation;
      updates.deepseek_pp_browser_control_settings = defaults.deepseek_pp_browser_control_settings;
      updates.deepseek_pp_chat_enabled = true;
    }
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      console.log('[DeepSeek++ Custom] Loaded pre-configured defaults successfully:', Object.keys(updates));
    }
  } catch (err) {
    console.error('[DeepSeek++ Custom] Failed to load defaults.json:', err);
  }
}
initDeepSeekPPCustomDefaults();
