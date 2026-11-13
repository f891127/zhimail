/**
 * 打包后清理：去掉 Chromium 许可证文件与多余语言包，减小安装包体积。
 * electronLanguages 在部分 electron-builder 版本上不生效，这里做一次兜底。
 */
const fs = require('node:fs');
const path = require('node:path');

const KEEP_LOCALES = new Set(['zh-CN.pak', 'en-US.pak']);
const DROP_FILES = ['LICENSES.chromium.html', 'LICENSE.electron.txt', 'LICENSE', 'version'];

exports.default = async function afterPack(context) {
  const dir = context.appOutDir;
  let saved = 0;

  const removeFile = (file) => {
    try {
      const stat = fs.statSync(file);
      fs.rmSync(file, { force: true });
      saved += stat.size;
    } catch {
      /* 文件不存在时忽略 */
    }
  };

  for (const name of DROP_FILES) removeFile(path.join(dir, name));

  const localesDir = path.join(dir, 'locales');
  if (fs.existsSync(localesDir)) {
    for (const file of fs.readdirSync(localesDir)) {
      if (!KEEP_LOCALES.has(file)) removeFile(path.join(localesDir, file));
    }
  }

  console.log(`[afterPack] 清理完成，节省 ${(saved / 1024 / 1024).toFixed(1)} MB（${dir}）`);
};
