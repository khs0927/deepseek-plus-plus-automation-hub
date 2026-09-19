import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const batPath = path.join(__dirname, 'shell-mcp-host.bat');
const manifestPath = path.join(__dirname, 'com.deepseek_pp.shell.json');

const manifest = {
  name: "com.deepseek_pp.shell",
  description: "DeepSeek++ Custom Shell MCP Host",
  path: batPath,
  type: "stdio",
  allowed_origins: [
    "chrome-extension://kdmpkkahkhdmdhfkdihkopikgcocbpbf/"
  ]
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`[NativeHost] Manifest written to: ${manifestPath}`);

const edgeKey = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.deepseek_pp.shell';
const chromeKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.deepseek_pp.shell';

try {
  execSync(`reg add "${edgeKey}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'inherit' });
  console.log(`[NativeHost] Edge registry updated successfully.`);
} catch (e) {
  console.error(`[NativeHost] Failed to register Edge native host:`, e.message);
}

try {
  execSync(`reg add "${chromeKey}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'inherit' });
  console.log(`[NativeHost] Chrome registry updated successfully.`);
} catch (e) {
  console.error(`[NativeHost] Failed to register Chrome native host:`, e.message);
}

// Also update legacy location if exists
const legacyDir = path.join(process.env.LOCALAPPDATA || '', 'DeepSeek++', 'NativeMessagingHosts');
if (fs.existsSync(legacyDir)) {
  const legacyEdgeJson = path.join(legacyDir, 'com.deepseek_pp.shell.edge.json');
  fs.writeFileSync(legacyEdgeJson, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[NativeHost] Legacy edge manifest synced: ${legacyEdgeJson}`);
}

console.log('[NativeHost] Registration complete!');
