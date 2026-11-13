#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本的说明，供 GitHub Release 使用。
 * 用法：node scripts/release-notes.mjs v1.1.0 > release-notes.md
 */
import fs from 'node:fs';
import path from 'node:path';

const version = (process.argv[2] ?? '').replace(/^v/, '').trim();
const file = path.join(process.cwd(), 'CHANGELOG.md');

if (!version) {
  console.error('用法：node scripts/release-notes.mjs <版本号>');
  process.exit(1);
}

if (!fs.existsSync(file)) {
  process.stdout.write(`## 知邮 ZhiMail v${version}\n\n更新内容详见仓库 CHANGELOG.md。\n`);
  process.exit(0);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const collected = [];
let capturing = false;

for (const line of lines) {
  const heading = /^##\s*\[?v?([0-9][^\]\s]*)\]?/.exec(line.trim());
  if (heading) {
    if (capturing) break;
    capturing = heading[1] === version;
    continue;
  }
  if (capturing) collected.push(line);
}

const body = collected.join('\n').trim();
process.stdout.write(`## 知邮 ZhiMail v${version}\n\n${body || '更新内容详见仓库 CHANGELOG.md。'}\n`);
