const { chromium } = require('C:/CODE/seumter/node_modules/playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0].pages();
  const dppPage = pages.find(p => p.url().includes('sidepanel.html'));
  if (!dppPage) {
    console.error('Sidepanel not found');
    process.exit(1);
  }

  // Click + Add button
  console.log('Clicking "+ Add" button...');
  const addBtn = dppPage.locator('button:has-text("+ Add"), button:has-text("Add")').first();
  await addBtn.click();
  await new Promise(r => setTimeout(r, 600));

  // Take screenshot of opened form
  await dppPage.screenshot({ path: 'C:/Users/USER/.gemini/antigravity/brain/2818c2d2-7b3e-4908-802c-a5f26aa4f32f/scratch/mcp_form_opened.png' });

  // Inspect form inputs
  const inputs = await dppPage.$$eval('input', list => list.map(i => ({
    placeholder: i.placeholder,
    value: i.value,
    type: i.type,
    name: i.name
  })));
  console.log('Form inputs:', JSON.stringify(inputs, null, 2));

  // Radio buttons for transport
  const radios = await dppPage.$$eval('[role="radio"]', list => list.map(r => r.innerText.trim()));
  console.log('Transport radios:', radios);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
