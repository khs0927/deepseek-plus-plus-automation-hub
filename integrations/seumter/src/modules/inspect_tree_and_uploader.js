const { getSeumterPage } = require('../utils/browser');

async function inspectTreeAndUploader() {
  const { context } = await getSeumterPage();
  const pages = context.pages();

  let targetPage = pages.find(p => p.url().includes('CDDAAA01P03') || p.url().includes('202633900001026701600'));
  if (!targetPage) {
    targetPage = pages[0];
  }

  console.log('Inspecting page:', targetPage.url());

  const info = await targetPage.evaluate(() => {
    // Collect all WebSquare components on page
    const components = [];
    if (typeof $p !== 'undefined') {
      const allComp = $p.getComponentList ? $p.getComponentList() : [];
      components.push(...allComp.map(c => ({ id: c.id, pluginName: c.getPluginName ? c.getPluginName() : 'unknown' })));
    }

    // Inspect TreeView
    const treeviews = Array.from(document.querySelectorAll('.w2treeview, [id*=tree], [id*=Tree]')).map(t => ({
      id: t.id,
      classes: t.className,
      nodes: Array.from(t.querySelectorAll('.w2treeview_node, li, span.w2treeview_label')).map(n => n.innerText.trim()).filter(Boolean)
    }));

    // Inspect Upload components
    const uploaders = Array.from(document.querySelectorAll('input[type=file], .w2upload, .w2multiupload, [id*=upload], [id*=Upload], [id*=File]')).map(u => ({
      id: u.id,
      tagName: u.tagName,
      className: u.className,
      name: u.name || '',
      accept: u.accept || ''
    }));

    // Inspect Grid / Table in file list area
    const grids = Array.from(document.querySelectorAll('.w2grid, table[id*=grid], table[id*=grd], table[id*=list]')).map(g => ({
      id: g.id,
      className: g.className
    }));

    // Inspect Buttons
    const buttons = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).map(b => ({
      id: b.id,
      text: (b.innerText || b.value || '').trim()
    })).filter(b => b.text.length > 0 && b.text.length < 30);

    return {
      title: document.title,
      components,
      treeviews,
      uploaders,
      grids,
      buttons
    };
  });

  console.log('--- Inspection Results ---');
  console.log('Components Count:', info.components.length);
  console.log('TreeViews:', JSON.stringify(info.treeviews, null, 2));
  console.log('Uploaders:', JSON.stringify(info.uploaders, null, 2));
  console.log('Grids:', JSON.stringify(info.grids, null, 2));
  console.log('Buttons:', JSON.stringify(info.buttons, null, 2));
}

inspectTreeAndUploader().catch(console.error);
