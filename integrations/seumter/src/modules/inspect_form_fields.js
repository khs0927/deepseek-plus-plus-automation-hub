const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectHtml() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('AWPADC08F01')) || context.pages()[2];

  const htmlSummary = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const forms = Array.from(document.querySelectorAll('form, select, input')).map(el => ({
      tagName: el.tagName,
      id: el.id,
      name: el.name,
      value: el.value,
      type: el.type
    }));
    return {
      text: text.substring(0, 2000),
      forms
    };
  });

  console.log('Text Content:\n', htmlSummary.text);
  console.log('Forms & Inputs:', JSON.stringify(htmlSummary.forms.slice(0, 30), null, 2));
}

inspectHtml().catch(console.error);
