const { getSeumterPage } = require('../utils/browser');

const targetUrl = 'https://www.eais.go.kr/websquare/websquare.html?w2xPath=/static/ui/cdd/a/a/a01/CDDAAA01P03.xml&mgrNo=202633900001026701600&inqryCode=010600&bizCode=Architecture&recpNo=&clsfCd=1042&optVal=Rename&bimSubmtYn=0';

async function inspectDrawingPage() {
  console.log('Connecting to browser session...');
  const { context, page } = await getSeumterPage();

  let targetPage = context.pages().find(p => p.url().includes('CDDAAA01P03') || p.url().includes('mgrNo=202633900001026701600'));

  if (!targetPage) {
    console.log('Target drawing page not open yet. Navigating page to target URL...');
    targetPage = page;
    await targetPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.log('Goto notice:', e.message));
  } else {
    console.log('Found existing target page:', targetPage.url());
  }

  console.log('Waiting for WebSquare and UI components...');
  await new Promise(r => setTimeout(r, 4000));

  const pageDetails = await targetPage.evaluate(() => {
    const text = document.body.innerText || '';

    // Find grids, trees, file inputs, tabs
    const grids = Array.from(document.querySelectorAll('table, .w2grid, .w2treeview, .w2upload')).map(el => ({
      id: el.id,
      className: el.className,
      textPreview: el.innerText.slice(0, 100).replace(/\n/g, ' ')
    }));

    const fileInputs = Array.from(document.querySelectorAll('input[type=file]')).map(el => ({
      id: el.id,
      name: el.name,
      accept: el.accept
    }));

    const allButtons = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).map(el => ({
      id: el.id,
      text: (el.innerText || el.value || '').trim()
    })).filter(b => b.text.length > 0 && b.text.length < 30);

    // Check WebSquare global objects
    let wsDataSets = [];
    if (typeof WebSquare !== 'undefined' && WebSquare.ModelUtil) {
      // Collect DataCollections if available
    }

    return {
      title: document.title,
      url: window.location.href,
      bodyPreview: text.slice(0, 1000),
      grids,
      fileInputs,
      allButtons: allButtons.slice(0, 50)
    };
  });

  console.log('--- Page Details ---');
  console.log('Title:', pageDetails.title);
  console.log('URL:', pageDetails.url);
  console.log('Body Preview:\n', pageDetails.bodyPreview);
  console.log('File Inputs:', pageDetails.fileInputs);
  console.log('Grids / Components:', pageDetails.grids);
  console.log('Buttons:', pageDetails.allButtons);
}

inspectDrawingPage().catch(console.error);
