const { chromium } = require('C:/CODE/seumter/node_modules/playwright');

async function main() {
  console.log('Connecting to Edge on CDP 9222...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0].pages();
  const dppPage = pages.find(p => p.url().includes('sidepanel.html'));
  if (!dppPage) {
    console.error('DeepSeek++ sidepanel page not found!');
    process.exit(1);
  }

  console.log('Found DeepSeek++ page!');

  // Ensure Capabilities tab is active
  const capBtn = dppPage.locator('button:has-text("Capabilities"), [role="tab"]:has-text("Capabilities")').first();
  if (await capBtn.count() > 0) {
    await capBtn.click();
    await new Promise(r => setTimeout(r, 400));
  }

  // Ensure MCP subtab is active
  console.log('Switching to MCP tab...');
  const mcpTab = dppPage.locator('[role="tab"]:has-text("MCP")').first();
  await mcpTab.click();
  await new Promise(r => setTimeout(r, 800));

  // Check if Seumter MCP already exists
  const existingSeumter = dppPage.locator('text="Seumter MCP"');
  if (await existingSeumter.count() > 0) {
    console.log('Seumter MCP server is already in the list!');
  } else {
    // Click Add server button
    console.log('Clicking Add Server button...');
    const addBtn = dppPage.locator('button:has-text("Add"), button:has-text("Add server")').first();
    await addBtn.click();
    await new Promise(r => setTimeout(r, 800));

    // Fill Display Name
    console.log('Filling Server Name...');
    const nameInput = dppPage.locator('input[placeholder*="Filesystem"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('Seumter MCP');
    } else {
      // fallback to first visible text input in form
      const firstInput = dppPage.locator('.ds-input, input[type="text"]').first();
      await firstInput.fill('Seumter MCP');
    }

    // Select SSE Transport
    console.log('Selecting SSE Transport...');
    const sseRadio = dppPage.locator('button[role="radio"]:has-text("SSE")').first();
    if (await sseRadio.count() > 0) {
      await sseRadio.click();
      await new Promise(r => setTimeout(r, 300));
    }

    // Fill URL
    console.log('Filling Service URL...');
    const urlInput = dppPage.locator('input[placeholder*="example.com"]').first();
    if (await urlInput.count() > 0) {
      await urlInput.fill('http://127.0.0.1:3300/sse');
    } else {
      const allInputs = await dppPage.locator('input[type="text"], .ds-input').all();
      if (allInputs.length >= 2) {
        await allInputs[1].fill('http://127.0.0.1:3300/sse');
      }
    }

    // Click Save
    console.log('Saving Server configuration...');
    const saveBtn = dppPage.locator('button:has-text("Save"), button.ds-btn-primary').first();
    await saveBtn.click();
    await new Promise(r => setTimeout(r, 1500));
  }

  // Click on Seumter MCP row to expand details if not expanded
  const seumterRow = dppPage.locator('text="Seumter MCP"').first();
  if (await seumterRow.count() > 0) {
    await seumterRow.click();
    await new Promise(r => setTimeout(r, 800));
  }

  // Try Refresh tools or Test if available
  const refreshBtn = dppPage.locator('button:has-text("Refresh tools"), button:has-text("Test")').first();
  if (await refreshBtn.count() > 0) {
    console.log('Clicking Refresh / Test button...');
    await refreshBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  }

  // Capture screenshot of result
  const screenshotPath = 'C:/Users/USER/.gemini/antigravity/brain/2818c2d2-7b3e-4908-802c-a5f26aa4f32f/scratch/deepseek_mcp_configured.png';
  await dppPage.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  const pageText = await dppPage.evaluate(() => document.body.innerText);
  console.log('Configured State Text:\n', pageText.slice(0, 1500));

  process.exit(0);
}

main().catch(err => {
  console.error('Error during automation:', err);
  process.exit(1);
});
