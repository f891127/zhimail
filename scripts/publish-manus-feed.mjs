#!/usr/bin/env node
/**
 * 智邮 ZhiYou —— 把发布产物发布到 Manus 更新源
 *
 * 做的事：
 *   1. 读取发布产物目录（默认 /home/ubuntu/zhimail-release）里的安装包、便携版与 electron-builder 生成的 latest.yml
 *   2. 用 manus-upload-file 把安装包与便携版上传到 Manus CDN，拿到公开直链
 *   3. 生成站点仓库里的 public/updates/latest.yml —— 清单里的安装包地址写成 CDN 绝对地址
 *   4. 重新生成站点仓库里的 public/index.html —— 版本号、更新说明、两个下载入口
 *
 * 用法：
 *   node scripts/publish-manus-feed.mjs                # 默认目录
 *   node scripts/publish-manus-feed.mjs --artifacts /path --site /path --skip-upload
 *
 * 上传完成后还需要在站点仓库提交并推送，再触发站点发布（这一步由 Manus 侧的发布流程完成）。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const artifactsDir = path.resolve(readFlag('artifacts', '/home/ubuntu/zhimail-release'));
const siteDir = path.resolve(readFlag('site', '/home/ubuntu/zhiyou'));
const skipUpload = args.includes('--skip-upload');
/** 上传过的文件缓存：同一路径重复执行时不必再传一遍 */
const cachePath = path.join(artifactsDir, '.cdn-cache.json');

function log(message) {
  console.log(`[manus-feed] ${message}`);
}

function fail(message) {
  console.error(`[manus-feed] ${message}`);
  process.exit(1);
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

function sha512(file) {
  return execFileSync('openssl', ['dgst', '-sha512', '-binary', file], { maxBuffer: 64 * 1024 * 1024 })
    .toString('base64');
}

function upload(file, cache) {
  const key = `${path.basename(file)}:${fs.statSync(file).size}`;
  if (cache[key]) {
    log(`复用已上传地址：${path.basename(file)}`);
    return cache[key];
  }
  if (skipUpload) fail(`缺少已上传地址且指定了 --skip-upload：${path.basename(file)}`);
  log(`上传 ${path.basename(file)}（${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB）…`);
  const output = execFileSync('manus-upload-file', [file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const url = /CDN URL:\s*(\S+)/.exec(output)?.[1];
  if (!url) fail(`上传后没有解析到 CDN 地址：${output.slice(-400)}`);
  cache[key] = url;
  writeCache(cache);
  log(`  → ${url}`);
  return url;
}

/* ---------------------------- 读取产物信息 ---------------------------- */

const entries = fs.readdirSync(artifactsDir);
const setupName = entries.find((name) => /^ZhiYou-Setup-.*-x64\.exe$/i.test(name));
if (!setupName) fail(`在 ${artifactsDir} 里找不到 ZhiYou-Setup-*-x64.exe`);
const setupPath = path.join(artifactsDir, setupName);

const portableName = entries.find((name) => /^ZhiYou-Portable-.*-x64\.zip$/i.test(name));
const portablePath = portableName ? path.join(artifactsDir, portableName) : null;

const builtYmlPath = path.join(artifactsDir, 'latest.yml');
if (!fs.existsSync(builtYmlPath)) fail(`找不到 ${builtYmlPath}（electron-builder 生成，含版本号与更新说明）`);
const builtYml = fs.readFileSync(builtYmlPath, 'utf8');

const version = /^version:\s*(.+)$/m.exec(builtYml)?.[1]?.trim();
if (!version) fail('latest.yml 里没有 version 字段');
const releaseDate = /^releaseDate:\s*'?(.+?)'?\s*$/m.exec(builtYml)?.[1]?.trim() ?? new Date().toISOString();
// releaseNotes 是块标量：取 "releaseNotes: |" 之后的缩进内容
const notesMatch = /releaseNotes:\s*\|?\s*\n([\s\S]*?)(?:\nreleaseDate:|\s*$)/.exec(builtYml);
const releaseNotes = (notesMatch?.[1] ?? '')
  .split('\n')
  .map((line) => line.replace(/^ {2}/, ''))
  .join('\n')
  .trim();

/* ------------------------------ 上传产物 ------------------------------ */

const cache = readCache();
const setupUrl = upload(setupPath, cache);
const portableUrl = portablePath ? upload(portablePath, cache) : '';
const setupSize = fs.statSync(setupPath).size;
const setupSha = sha512(setupPath);

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

const updatesDir = path.join(siteDir, 'public', 'updates');
fs.mkdirSync(updatesDir, { recursive: true });
fs.writeFileSync(path.join(updatesDir, 'latest.yml'), manifest, 'utf8');
log(`已写入清单：public/updates/latest.yml（version ${version}）`);

/* ----------------------------- 生成下载页 ----------------------------- */

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
/** 下载箭头图标：两个下载按钮共用 */
const DOWNLOAD_ICON =
  '<svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></svg>';
const portableLine = portablePath
  ? `<a class="btn btn-ghost" href="${portableUrl}">
            <span class="btn-row">${DOWNLOAD_ICON}<span>下载便携版</span></span>
            <small>Windows x64 · ${mb(fs.statSync(portablePath).size)} · .zip 免安装</small>
          </a>`
  : '';

const page = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>智邮 ZhiYou · 下载与更新</title>
    <meta name="description" content="智邮 ZhiYou 桌面邮件客户端下载与自动更新服务：安装版、便携版下载，以及客户端在线更新清单。" />
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
      .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(16, 24, 40, .12); }
      .btn:active { transform: translateY(0); box-shadow: 0 2px 6px rgba(16, 24, 40, .16); }
      .btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
      .btn small { font-weight: 400; font-size: 12px; opacity: .78; }
      .btn-primary { background: var(--brand); color: #fff; }
      .btn-primary:hover { background: var(--brand-dark); }
      .btn-primary:active { background: #1a45a6; }
      .btn-ghost { background: #fff; color: var(--text); border-color: var(--line); }
      .btn-ghost:hover { background: #f2f6ff; border-color: var(--brand); color: var(--brand-dark); }
      .btn-ghost:active { background: #e4ecff; border-color: var(--brand-dark); color: var(--brand-dark); }
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
        <h1>智邮 ZhiYou</h1>
        <span>ZHIYOU MAIL</span>
      </div>
      <p class="lead">桌面邮件客户端 · 下载与在线更新服务</p>

      <div class="card">
        <div class="ver">
          <span class="tag" id="version-tag">最新版本 v${escapeHtml(version)}</span>
          <span class="date">发布于 ${escapeHtml(publishedAt)}</span>
        </div>
        <div class="actions">
          <a class="btn btn-primary" href="${setupUrl}">
            <span class="btn-row">${DOWNLOAD_ICON}<span>下载安装版</span></span>
            <small>Windows x64 · ${mb(setupSize)} · .exe</small>
          </a>
          ${portableLine}
        </div>
        <p class="hint">
          安装版会自动创建开始菜单与桌面快捷方式，并支持客户端内一键在线更新；便携版解压即用，更新请重新下载。
        </p>
      </div>

      <div class="card">
        <h2>本版更新说明</h2>
        <div class="notes" id="release-notes">
${renderNotes(releaseNotes)}
        </div>
      </div>

      <div class="card">
        <h2>客户端在线更新源</h2>
        <p class="hint" style="margin-top:0">
          客户端默认使用本站作为在线更新源；也可以在「设置 → 在线更新 → 更新源」中选「自定义地址」手动填写下面这个目录地址：
        </p>
        <p><code>/updates/latest.yml</code></p>
        <p class="hint">
          清单中的安装包指向 Manus CDN 的绝对地址，客户端会校验 SHA-512 后再安装。
        </p>
      </div>

      <footer>智邮 ZhiYou · 作者 fxj · 更新分发由 Manus 托管</footer>
    </div>
  </body>
</html>
`;

fs.writeFileSync(path.join(siteDir, 'public', 'index.html'), page, 'utf8');
log('已写入下载页：public/index.html');

log('完成。接下来：在站点仓库提交并推送，然后发布站点。');
log(`  安装版：${setupUrl}`);
if (portableUrl) log(`  便携版：${portableUrl}`);
