/**
 * PDF 预览验证：在真实 Electron 里用私有协议把一个 PDF 塞进 iframe，
 * 截图后统计非白色像素占比，判断内置 PDF 阅读器是否真的渲染出来了。
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const pdf = process.argv[2];
const out = process.argv[3] || '/tmp/pdf-preview.png';
const protocolModule = require(path.join(__dirname, '..', 'dist-electron', 'services', 'attachmentProtocol.js'));

protocolModule.registerAttachmentScheme();

app.whenReady().then(async () => {
  protocolModule.handleAttachmentProtocol();
  const url = protocolModule.registerAttachmentFile(pdf);
  const win = new BrowserWindow({
    width: 900,
    height: 1000,
    show: true,
    webPreferences: { plugins: true, sandbox: false, contextIsolation: true },
  });
  const html = `<!doctype html><html><body style="margin:0;background:#fff">
    <iframe src="${url}" style="width:900px;height:1000px;border:0"></iframe>
  </body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 6000));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(out, image.toPNG());
  // 统计深色像素，PDF 有文字/线条时不会是纯白
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(Buffer.from(image.toPNG()));
  let dark = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] < 200) dark += 1;
  }
  const total = png.width * png.height;
  console.log('RESULT url=' + url);
  console.log('RESULT darkRatio=' + (dark / total).toFixed(4) + ' size=' + png.width + 'x' + png.height);
  app.quit();
});
