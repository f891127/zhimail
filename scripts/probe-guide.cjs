const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false });
  await win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 4000));
  const result = await win.webContents.executeJavaScript(`(() => {
    const grad = Array.from(document.querySelectorAll('*')).filter((el) => (getComputedStyle(el).backgroundImage || '').includes('linear-gradient')).map((el) => el.tagName + '|' + el.className.slice(0, 40));
    const tree = document.querySelector('.scroll-area');
    const span = document.querySelector('span[aria-hidden]');
    const all = Array.from(document.querySelectorAll('span[aria-hidden]'));
    const guide = all.find((el) => getComputedStyle(el).backgroundImage.includes('linear-gradient'));
    const cs = guide ? getComputedStyle(guide) : null;
    return {
      skin: document.documentElement.dataset.skin,
      guideCount: all.length,
      guideFound: Boolean(guide),
      bg: cs ? cs.backgroundImage.slice(0, 80) : null,
      rect: guide ? JSON.stringify(guide.getBoundingClientRect()) : null,
      opacity: cs ? cs.opacity : null,
      display: cs ? cs.display : null,
      grad: grad.slice(0, 8),
      treeHtml: tree ? tree.innerHTML.slice(0, 400) : null,
    };
  })()`);
  console.log('PROBE', JSON.stringify(result));
  app.quit();
});
