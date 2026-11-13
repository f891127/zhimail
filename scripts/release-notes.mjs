#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本的说明，供 GitHub Release 与更新清单（latest.yml）使用。
 * 用法：
 *   node scripts/release-notes.mjs            # 版本号取自 package.json
 *   node scripts/release-notes.mjs v1.1.2     # 显式指定版本号（发版工作流使用）
 */
import fs from 'node:fs';
import path from 'node:path';

const packageFile = path.join(process.cwd(), 'package.json');
const packageVersion = fs.existsSync(packageFile)
  ? JSON.parse(fs.readFileSync(packageFile, 'utf8')).version
  : '';

const version = (process.argv[2] ?? packageVersion ?? '').replace(/^v/, '').trim();
const file = path.join(process.cwd(), 'CHANGELOG.md');

if (!version) {
  console.error('用法：node scripts/release-notes.mjs [版本号]');
  process.exit(1);
}

if (!fs.existsSync(file)) {
  process.stdout.write(`## 智邮 ZhiYou v${version}\n\n更新内容详见仓库 CHANGELOG.md。\n`);
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
process.stdout.write(`## 智邮 ZhiYou v${version}\n\n${body || '更新内容详见仓库 CHANGELOG.md。'}\n`);
