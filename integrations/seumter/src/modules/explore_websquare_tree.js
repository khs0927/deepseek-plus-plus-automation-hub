const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function explore() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log('Page Title:', await page.title());
  console.log('Page URL:', page.url());

  // Frames check
  const frames = page.frames();
  console.log(`Total Frames: ${frames.length}`);
  frames.forEach((f, idx) => console.log(` - Frame [${idx}]: name="${f.name()}" url="${f.url()}"`));

  // Evaluate on main page or frames
  const domInfo = await page.evaluate(() => {
    // Collect all elements with text or id
    const treeItems = Array.from(document.querySelectorAll('*')).filter(el => {
      const txt = (el.innerText || '').trim();
      return (txt.includes('기본설계도서') || txt.includes('건축행정서식') || txt.includes('발급공부') || txt.includes('일반문서') || txt.includes('설계문서') || txt.includes('도면')) && el.children.length === 0;
    }).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      text: el.innerText.trim(),
      parentTagName: el.parentElement ? el.parentElement.tagName : '',
      parentId: el.parentElement ? el.parentElement.id : '',
      parentClass: el.parentElement ? el.parentElement.className : ''
    }));

    // Find all clickable buttons / anchors
    const actions = Array.from(document.querySelectorAll('button, input[type=button], a, .w2anchor, .btn')).map(el => ({
      id: el.id,
      text: (el.innerText || el.value || '').trim(),
      className: el.className
    })).filter(a => a.text.length > 0 && a.text.length < 40);

    // Find all tables / grids
    const tables = Array.from(document.querySelectorAll('table, .w2grid')).map(t => ({
      id: t.id,
      className: t.className,
      headers: Array.from(t.querySelectorAll('th, td')).slice(0, 10).map(c => c.innerText.trim())
    }));

    return {
      treeItems: treeItems.slice(0, 30),
      actions: actions.slice(0, 30),
      tables
    };
  });

  console.log('--- DOM INFO ---');
  console.log('Tree Items Count:', domInfo.treeItems.length);
  console.log('Tree Items:', JSON.stringify(domInfo.treeItems, null, 2));
  console.log('Actions:', JSON.stringify(domInfo.actions, null, 2));
  console.log('Tables:', JSON.stringify(domInfo.tables, null, 2));

  process.exit(0);
}

explore().catch(console.error);
