/**
 * 数据存储位置：默认放在用户数据目录下的 zhimail-data，
 * 允许用户改到其它磁盘或目录（例如 D 盘、加密盘、同步盘）。
 * 位置本身记录在 userData 下的 zhimail-location.json，不随数据目录移动。
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = 'zhimail-location.json';

export interface LocationConfig {
  dataDir?: string;
}

export function defaultDataDir(): string {
  return path.join(app.getPath('userData'), 'zhimail-data');
}

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

export function readLocationConfig(): LocationConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as LocationConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 解析当前生效的数据目录，不存在则创建 */
export function resolveDataDir(): string {
  const configured = readLocationConfig().dataDir?.trim();
  const dir = configured ? path.resolve(configured) : defaultDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 是否使用自定义位置 */
export function isCustomDataDir(): boolean {
  return Boolean(readLocationConfig().dataDir?.trim());
}

/** 写入自定义位置；传入 null 表示恢复默认 */
export function saveDataDir(dir: string | null): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!dir) {
    fs.writeFileSync(file, JSON.stringify({}, null, 2), 'utf8');
    return;
  }
  fs.writeFileSync(file, JSON.stringify({ dataDir: path.resolve(dir) }, null, 2), 'utf8');
}

export interface MigrateResult {
  files: number;
  bytes: number;
}

function copyTree(from: string, to: string, result: MigrateResult): void {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyTree(source, target, result);
      continue;
    }
    if (!entry.isFile()) continue;
    // 已存在的文件不覆盖，避免把更新的数据写回旧内容
    if (fs.existsSync(target)) continue;
    fs.copyFileSync(source, target);
    result.files += 1;
    result.bytes += fs.statSync(target).size;
  }
}

/** 把现有数据复制到新目录（保留原目录，不删除） */
export function migrateData(from: string, to: string): MigrateResult {
  const source = path.resolve(from);
  const target = path.resolve(to);
  if (source === target) return { files: 0, bytes: 0 };
  if (target.startsWith(`${source}${path.sep}`)) {
    throw new Error('新位置不能位于当前数据目录内部，请另选一个目录');
  }
  fs.mkdirSync(target, { recursive: true });
  const result: MigrateResult = { files: 0, bytes: 0 };
  if (!fs.existsSync(source)) return result;
  copyTree(source, target, result);
  return result;
}
