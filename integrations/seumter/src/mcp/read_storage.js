const { chromium } = require('C:/CODE/seumter/node_modules/playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0].pages();
  const dppPage = pages.find(p => p.url().includes('sidepanel.html'));
  if (!dppPage) process.exit(1);

  const storage = await dppPage.evaluate(async () => {
    return await chrome.storage.local.get('deepseek_pp_mcp_servers');
  });

  console.log('MCP Storage:', JSON.stringify(storage, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
