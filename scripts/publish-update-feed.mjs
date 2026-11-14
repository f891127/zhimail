#!/usr/bin/env node
/**
 * publish-update-feed.mjs —— 把桌面应用的发布产物发布到 Manus 更新源
 *
 * 做的事：
 *   1. 读取产物目录（electron-builder 的输出）里的安装包、便携版与它生成的 latest.yml
 *   2. 用 manus-upload-file 把产物上传到 Manus CDN（给更新清单用）与项目存储（给下载页用）
 *   3. 生成静态站里的 updates/latest.yml —— 安装包地址写成 CDN 绝对地址，带 sha512 与 size
 *   4. 生成静态站里的下载页 index.html —— 版本号、更新说明、安装版/便携版下载入口
 *
 * 用法（必须在 WebDev 静态站项目目录下执行，--webdev 上传需要项目上下文）：
 *   node scripts/publish-update-feed.mjs                      # 读 ./update-feed.config.json
 *   node scripts/publish-update-feed.mjs --config path/to.json
 *   node scripts/publish-update-feed.mjs --artifacts /path --site /path --skip-storage
 *
 * 幂等：按「文件名:大小」缓存已上传地址到产物目录的 .update-feed-cache.json，重复执行不重复上传。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const readFlag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const log = (message) => console.log(`[update-feed] ${message}`);
const warn = (message) => console.warn(`[update-feed] ${message}`);
const fail = (message) => {
  console.error(`[update-feed] ${message}`);
  process.exit(1);
};

/* ------------------------------- 配置 ------------------------------- */

const configPath = path.resolve(readFlag('config', 'update-feed.config.json'));
if (!fs.existsSync(configPath)) {
  fail(`找不到配置文件 ${configPath}（可复制 templates/update-feed.config.json 改名后使用）`);
}
const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const cfg = {
  /** 产品名，用于下载页标题与默认文件名 */
  productName: 'MyApp',
  /** 产品英文副标题，可留空 */
  productTagline: '',
  /** 下载页页脚署名，可留空 */
  author: '',
  /** 下载页副标题 */
  leadText: '下载与在线更新服务',
  /** 产物平台标识，显示在按钮小字里 */
  platformLabel: 'Windows x64',
  /** electron-builder 产物目录 */
  artifactsDir: '/home/ubuntu/app-release',
  /** WebDev 静态站项目目录 */
  siteDir: '/home/ubuntu/app-site',
  /** 安装包 / 便携版文件名匹配（正则字符串） */
  setupPattern: '^.*-Setup-.*-x64\\.exe$',
  portablePattern: '^.*-Portable-.*-x64\\.zip$',
  /** 下载页保存的文件名模板，{version} 会被替换成版本号 */
  setupDownloadName: '{product}-Setup-{version}-x64.exe',
  portableDownloadName: '{product}-Portable-{version}-x64.zip',
  /** 站点仓库里的相对路径 */
  feedPath: 'public/updates/latest.yml',
  pagePath: 'public/index.html',
  /** 下载页展示的更新源目录地址，例如 https://xxx.manus.space/updates */
  updateBaseUrl: '',
  /** 下载页文案 */
  installNote: '安装版会自动创建开始菜单与桌面快捷方式，并支持客户端内一键在线更新。',
  portableNote: '便携版解压即用，更新请重新下载。',
  ...fileConfig,
};

const artifactsDir = path.resolve(readFlag('artifacts', cfg.artifactsDir));
const siteDir = path.resolve(readFlag('site', cfg.siteDir));
const skipUpload = hasFlag('skip-upload');
const skipStorage = hasFlag('skip-storage') || cfg.skipStorage === true;
const cachePath = path.join(artifactsDir, '.update-feed-cache.json');

if (!fs.existsSync(siteDir)) fail(`站点目录不存在：${siteDir}`);

const readCache = () => {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
};
const writeCache = (cache) => fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');

/* ------------------------------ 上传 ------------------------------ */

function sha512(file) {
  return execFileSync('openssl', ['dgst', '-sha512', '-binary', file], { maxBuffer: 64 * 1024 * 1024 })
    .toString('base64');
}

/** 上传到 Manus CDN，返回公开直链（写进更新清单，客户端直连下载） */
function uploadCdn(file, cache) {
  const key = `cdn:${path.basename(file)}:${fs.statSync(file).size}`;
  if (cache[key]) {
    log(`复用 CDN 地址：${path.basename(file)}`);
    return cache[key];
  }
  if (skipUpload) fail(`缺少已上传 CDN 地址且指定了 --skip-upload：${path.basename(file)}`);
  log(`上传 CDN ${path.basename(file)}（${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB）…`);
  const output = execFileSync('manus-upload-file', [file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const url = /CDN URL:\s*(\S+)/.exec(output)?.[1];
  if (!url) fail(`上传后没有解析到 CDN 地址：${output.slice(-400)}`);
  cache[key] = url;
  writeCache(cache);
  log(`  → ${url}`);
  return url;
}

/**
 * 再上传一份到项目存储（/manus-storage/xxx），给下载页用。
 * 站点同源 + download 属性，浏览器才会把文件保存成「产品名-版本-架构.exe」这种正常名字；
 * 直接用 CDN 直链会保存成随机键名。上传失败时自动退回 CDN 直链，不阻塞发版。
 */
function uploadStorage(file, cache) {
  const key = `storage:${path.basename(file)}:${fs.statSync(file).size}`;
  if (cache[key]) {
    log(`复用项目存储路径：${path.basename(file)}`);
    return cache[key];
  }
  if (skipUpload) return '';
  log(`上传项目存储 ${path.basename(file)}…`);
  try {
    const output = execFileSync('manus-upload-file', ['--webdev', file], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      cwd: siteDir,
    });
    const storagePath = /Storage Path:\s*(\S+)/.exec(output)?.[1];
    if (!storagePath) {
      warn(`没有解析到存储路径，下载页改用 CDN 直链：${output.slice(-200)}`);
      return '';
    }
    cache[key] = storagePath;
    writeCache(cache);
    log(`  → ${storagePath}`);
    return storagePath;
  } catch (error) {
    warn(`项目存储上传失败（下载页改用 CDN 直链）：${error?.message ?? error}`);
    return '';
  }
}

/* ---------------------------- 读取产物信息 ---------------------------- */

if (!fs.existsSync(artifactsDir)) fail(`产物目录不存在：${artifactsDir}`);
const entries = fs.readdirSync(artifactsDir);
const setupName = entries.find((name) => new RegExp(cfg.setupPattern, 'i').test(name));
if (!setupName) fail(`在 ${artifactsDir} 里找不到匹配 ${cfg.setupPattern} 的安装包`);
const setupPath = path.join(artifactsDir, setupName);

const portableName = entries.find((name) => new RegExp(cfg.portablePattern, 'i').test(name));
const portablePath = portableName ? path.join(artifactsDir, portableName) : null;

const builtYmlPath = path.join(artifactsDir, 'latest.yml');
if (!fs.existsSync(builtYmlPath)) {
  fail(`找不到 ${builtYmlPath}（应由 electron-builder 生成，含版本号与更新说明）`);
}
const builtYml = fs.readFileSync(builtYmlPath, 'utf8');

const version = readFlag('version', null) ?? /^version:\s*(.+)$/m.exec(builtYml)?.[1]?.trim();
if (!version) fail('latest.yml 里没有 version 字段（可用 --version 指定）');
const releaseDate =
  /^releaseDate:\s*'?(.+?)'?\s*$/m.exec(builtYml)?.[1]?.trim() ?? new Date().toISOString();
// releaseNotes 是块标量：取 "releaseNotes: |" 之后的缩进内容
const notesMatch = /releaseNotes:\s*\|?\s*\n([\s\S]*?)(?:\nreleaseDate:|\s*$)/.exec(builtYml);
const releaseNotes = (notesMatch?.[1] ?? '')
  .split('\n')
  .map((line) => line.replace(/^ {2}/, ''))
  .join('\n')
  .trim();

/* ------------------------------ 上传产物 ------------------------------ */

const cache = readCache();
const setupUrl = uploadCdn(setupPath, cache);
const portableUrl = portablePath ? uploadCdn(portablePath, cache) : '';
const setupSize = fs.statSync(setupPath).size;
const setupSha = sha512(setupPath);

const setupStorage = skipStorage ? '' : uploadStorage(setupPath, cache);
const portableStorage = portablePath && !skipStorage ? uploadStorage(portablePath, cache) : '';
const setupHref = setupStorage || setupUrl;
const portableHref = portableStorage || portableUrl;

const fillName = (template) =>
  String(template).replace(/\{version\}/g, version).replace(/\{product\}/g, cfg.productName.replace(/\s+/g, ''));
const setupFileName = fillName(cfg.setupDownloadName);
const portableFileName = fillName(cfg.portableDownloadName);

/* --------------------------- 生成更新清单 --------------------------- */

const manifest = [
  `version: ${version}`,
  'files:',
  `  - url: ${setupUrl}`,
  `    sha512: ${setupSha}`,
  `    size: ${setupSize}`,
  `path: ${setupUrl}`,
  `sha512: ${setupSha}`,
  'releaseNotes: |',
  ...releaseNotes.split('\n').map((line) => `  ${line}`),
  `releaseDate: '${releaseDate}'`,
  '',
].join('\n');

const feedPath = path.join(siteDir, cfg.feedPath);
fs.mkdirSync(path.dirname(feedPath), { recursive: true });
fs.writeFileSync(feedPath, manifest, 'utf8');
log(`已写入清单：${cfg.feedPath}（version ${version}）`);

/* ----------------------------- 生成下载页 ----------------------------- */

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 极简 Markdown 渲染：只处理更新日志用到的 ### 小标题与 - 列表 */
function renderNotes(markdown) {
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('          </ul>');
      inList = false;
    }
  };
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,2}\s/.test(line)) continue; // 版本号大标题由页面自己展示
    if (/^###\s/.test(line)) {
      closeList();
      out.push(`          <h3>${escapeHtml(line.replace(/^###\s*/, ''))}</h3>`);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      if (!inList) {
        out.push('          <ul class="notes">');
        inList = true;
      }
      out.push(`            <li>${escapeHtml(line.replace(/^[-*]\s*/, ''))}</li>`);
      continue;
    }
    closeList();
    out.push(`          <p>${escapeHtml(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const publishedAt = releaseDate.slice(0, 10);
const DOWNLOAD_ICON =
  '<svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></svg>';
const CHECK_ICON = '<path d="M20 6 9 17l-5-5" />';
const ARROW_PATH = DOWNLOAD_ICON.replace(/^<svg[^>]*>|<\/svg>$/g, '');

const portableLine = portablePath
  ? `<a class="btn btn-default" href="${portableHref}" download="${portableFileName}" data-default-label="下载便携版" data-clicked-label="已开始下载">
            <span class="btn-row">${DOWNLOAD_ICON}<span class="btn-label">下载便携版</span></span>
            <small>${escapeHtml(portableSmall())}</small>
          </a>`
  : '';

/** 按钮小字：平台 · 体积 · 扩展名 */
function portableSmall() {
  if (!portablePath) return '';
  return `${cfg.platformLabel} · ${mb(fs.statSync(portablePath).size)} · ${path.extname(portablePath)} 免安装`;
}
const setupSmall = `${cfg.platformLabel} · ${mb(setupSize)} · ${path.extname(setupPath)}`;

const page = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(cfg.productName)} · 下载与更新</title>
    <meta name="description" content="${escapeHtml(cfg.productName)} 下载与自动更新服务：安装版、便携版下载，以及客户端在线更新清单。" />
    <style>
      :root {
        --bg: #f5f6f8;
        --card: #ffffff;
        --text: #1c1f23;
        --muted: #6b7280;
        --line: #e5e7eb;
        --brand: #2f6df6;
        --brand-dark: #1f52c4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 48px 20px 64px;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
        line-height: 1.65;
      }
      .wrap { max-width: 720px; margin: 0 auto; }
      .brand { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
      .brand h1 { font-size: 26px; margin: 0; letter-spacing: .5px; }
      .brand span { color: var(--muted); font-size: 14px; letter-spacing: 1px; }
      .lead { color: var(--muted); margin: 0 0 28px; font-size: 15px; }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 24px 26px;
        margin-bottom: 18px;
        box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
      }
      .ver { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
      .ver .tag {
        background: rgba(47, 109, 246, .1);
        color: var(--brand-dark);
        border-radius: 999px;
        padding: 3px 12px;
        font-size: 13px;
        font-weight: 600;
      }
      .ver .date { color: var(--muted); font-size: 13px; }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
      .btn {
        display: inline-flex;
        flex-direction: column;
        gap: 3px;
        text-decoration: none;
        border-radius: 10px;
        padding: 12px 20px;
        font-size: 15px;
        font-weight: 600;
        border: 1px solid transparent;
        transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease, border-color .12s ease, color .12s ease;
      }
      .btn-row { display: flex; align-items: center; gap: 7px; }
      .btn-ico { width: 15px; height: 15px; flex: none; }
      .btn:hover { transform: translateY(-1px); }
      .btn:active { transform: translateY(0); }
      .btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
      .btn small { font-weight: 400; font-size: 12px; opacity: .78; }
      /* 两个按钮初始样式一致（都不预置蓝底），点过的那一个才变蓝，一眼能看出点的是哪个 */
      .btn-default { background: #fff; color: var(--text); border-color: var(--line); }
      .btn-default:hover { background: #f2f6ff; border-color: var(--brand); color: var(--brand-dark); box-shadow: 0 6px 18px rgba(47, 109, 246, .18); }
      .btn-default:active { background: #e4ecff; border-color: var(--brand-dark); color: var(--brand-dark); box-shadow: 0 1px 4px rgba(16, 24, 40, .18); }
      .badge { margin-left: 7px; padding: 1px 7px; border-radius: 999px; background: rgba(47, 109, 246, .12); color: var(--brand-dark); font-size: 11px; font-weight: 600; }
      .btn.is-clicked { background: var(--brand); border-color: var(--brand); color: #fff; box-shadow: 0 0 0 3px rgba(47, 109, 246, .3); }
      .btn.is-clicked small { color: rgba(255, 255, 255, .82); }
      .btn.is-clicked .badge { background: rgba(255, 255, 255, .22); color: #fff; }
      h2 { font-size: 16px; margin: 0 0 12px; }
      ul.notes { margin: 0; padding-left: 18px; color: #33383f; font-size: 14.5px; }
      ul.notes li { margin-bottom: 6px; }
      .notes h3 { font-size: 14px; margin: 14px 0 6px; color: var(--brand-dark); }
      .notes p { margin: 6px 0; font-size: 14.5px; }
      code {
        background: #f1f3f6;
        border-radius: 6px;
        padding: 2px 7px;
        font-size: 13px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        word-break: break-all;
      }
      .hint { color: var(--muted); font-size: 13.5px; margin: 10px 0 0; }
      footer { color: var(--muted); font-size: 13px; text-align: center; margin-top: 26px; }
      a { color: var(--brand-dark); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="brand">
        <h1>${escapeHtml(cfg.productName)}</h1>
        ${cfg.productTagline ? `<span>${escapeHtml(cfg.productTagline)}</span>` : ''}
      </div>
      <p class="lead">${escapeHtml(cfg.leadText)}</p>

      <div class="card">
        <div class="ver">
          <span class="tag">最新版本 v${escapeHtml(version)}</span>
          <span class="date">发布于 ${escapeHtml(publishedAt)}</span>
        </div>
        <div class="actions">
          <a class="btn btn-default" href="${setupHref}" download="${setupFileName}" data-default-label="下载安装版" data-clicked-label="已开始下载">
            <span class="btn-row">${DOWNLOAD_ICON}<span class="btn-label">下载安装版</span><span class="badge">推荐</span></span>
            <small>${escapeHtml(setupSmall)}</small>
          </a>
          ${portableLine}
        </div>
        <p class="hint">
          ${escapeHtml(cfg.installNote)}${portablePath ? escapeHtml(cfg.portableNote) : ''}
        </p>
      </div>

      <div class="card">
        <h2>本版更新说明</h2>
        <div class="notes">
${renderNotes(releaseNotes)}
        </div>
      </div>

      <div class="card">
        <h2>客户端在线更新源</h2>
        <p class="hint" style="margin-top:0">
          客户端默认使用本站作为在线更新源；也可以在设置里选「自定义地址」手动填写下面这个目录地址：
        </p>
        <p><code>${escapeHtml(cfg.updateBaseUrl || '/updates')}/latest.yml</code></p>
        <p class="hint">清单中的安装包指向 Manus CDN 的绝对地址，客户端会校验 SHA-512 后再安装。</p>
      </div>

      <footer>${escapeHtml(cfg.productName)}${cfg.author ? ` · 作者 ${escapeHtml(cfg.author)}` : ''} · 更新分发由 Manus 托管</footer>
    </div>
    <script>
      // 点击下载后给出明确反馈：图标换成对勾、文案变成「已开始下载」，并保留按下态样式
      (() => {
        const buttons = Array.from(document.querySelectorAll('a.btn'));
        buttons.forEach((btn) => {
          btn.addEventListener('click', () => {
            buttons.forEach((other) => {
              other.classList.remove('is-clicked');
              const icon = other.querySelector('.btn-ico');
              if (icon) icon.innerHTML = '${ARROW_PATH}';
              const label = other.querySelector('.btn-label');
              if (label && other.dataset.defaultLabel) label.textContent = other.dataset.defaultLabel;
            });
            btn.classList.add('is-clicked');
            const icon = btn.querySelector('.btn-ico');
            if (icon) icon.innerHTML = '${CHECK_ICON}';
            const label = btn.querySelector('.btn-label');
            if (label && btn.dataset.clickedLabel) label.textContent = btn.dataset.clickedLabel;
          });
        });
      })();
    </script>
  </body>
</html>
`;

const pagePath = path.join(siteDir, cfg.pagePath);
fs.mkdirSync(path.dirname(pagePath), { recursive: true });
fs.writeFileSync(pagePath, page, 'utf8');
log(`已写入下载页：${cfg.pagePath}`);

log('完成。接下来：站点仓库提交推送，再触发站点发布（webdev.config POST publish）。');
log(`  安装版：${setupUrl}`);
if (portableUrl) log(`  便携版：${portableUrl}`);
