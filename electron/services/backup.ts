/**
 * 数据备份与恢复：把数据目录（邮件、附件、简报、待办、设置、可选凭据）打包为 zip，
 * 支持导出到任意位置、从 zip 恢复，以及每天首次启动自动备份。
 */
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { store } from './store';

export interface BackupManifest {
  app: 'zhimail';
  version: string;
  exportedAt: string;
  dataDir: string;
  includeSecrets: boolean;
  counts: {
    accounts: number;
    messages: number;
    briefs: number;
    todos: number;
  };
}

export interface BackupResult {
  path: string;
  files: number;
  bytes: number;
  manifest: BackupManifest;
}

const MANIFEST_NAME = 'zhimail-backup.json';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function stamp(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function defaultBackupDir(): string {
  return path.join(path.dirname(store.root), 'zhimail-backups');
}

export function resolveBackupDir(): string {
  const configured = store.getSettings().backup?.directory?.trim();
  return configured ? path.resolve(configured) : defaultBackupDir();
}

export function backupFileName(prefix = 'ZhiMail-backup'): string {
  return `${prefix}-${stamp()}.zip`;
}

function collectFiles(root: string, current: string, skip: Set<string>, list: string[]): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, full, skip, list);
      continue;
    }
    if (!entry.isFile()) continue;
    const relative = path.relative(root, full);
    if (skip.has(relative) || skip.has(entry.name)) continue;
    list.push(relative);
  }
}

function buildManifest(includeSecrets: boolean): BackupManifest {
  const state = store.describeCounts();
  return {
    app: 'zhimail',
    version: app.getVersion(),
    exportedAt: new Date().toISOString(),
    dataDir: store.root,
    includeSecrets,
    counts: state,
  };
}

/** 生成备份 zip */
export function createBackup(targetPath: string, options?: { includeSecrets?: boolean }): BackupResult {
  store.flush();
  const includeSecrets = options?.includeSecrets ?? store.getSettings().backup?.includeSecrets ?? true;
  const root = store.root;
  const skip = new Set(includeSecrets ? [] : ['secrets.json']);
  const files: string[] = [];
  collectFiles(root, root, skip, files);

  const zip = new AdmZip();
  const manifest = buildManifest(includeSecrets);
  zip.addFile(MANIFEST_NAME, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  let bytes = 0;
  for (const relative of files) {
    const full = path.join(root, relative);
    zip.addFile(relative.split(path.sep).join('/'), fs.readFileSync(full));
    bytes += fs.statSync(full).size;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  zip.writeZip(targetPath);
  return { path: targetPath, files: files.length, bytes, manifest };
}

export interface BackupInspection {
  manifest?: BackupManifest;
  entries: number;
  bytes: number;
  valid: boolean;
  error?: string;
}

/** 读取备份包信息，用于导入前确认 */
export function inspectBackup(zipPath: string): BackupInspection {
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const manifestEntry = entries.find((entry) => entry.entryName === MANIFEST_NAME);
    const manifest = manifestEntry
      ? (JSON.parse(manifestEntry.getData().toString('utf8')) as BackupManifest)
      : undefined;
    const bytes = entries.reduce((total, entry) => total + entry.header.size, 0);
    return {
      manifest,
      entries: entries.length,
      bytes,
      valid: Boolean(manifest && manifest.app === 'zhimail'),
      error: manifest ? undefined : '备份包缺少描述文件，可能不是知邮导出的备份',
    };
  } catch (error) {
    return { entries: 0, bytes: 0, valid: false, error: `无法读取备份包：${(error as Error).message}` };
  }
}

export interface RestoreResult {
  restoredFiles: number;
  previousDataMovedTo: string;
  manifest?: BackupManifest;
}

/** 从备份 zip 恢复：先把当前数据目录整体挪到备份位置，再解压覆盖 */
export function restoreBackup(zipPath: string): RestoreResult {
  const inspection = inspectBackup(zipPath);
  if (!inspection.valid) throw new Error(inspection.error ?? '备份包不可用');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhimail-restore-'));
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  const previous = `${store.root}.before-restore-${stamp()}`;
  store.flush();
  fs.renameSync(store.root, previous);
  fs.mkdirSync(store.root, { recursive: true });

  const copied = copyTree(tempDir, store.root);
  fs.rmSync(tempDir, { recursive: true, force: true });

  return { restoredFiles: copied, previousDataMovedTo: previous, manifest: inspection.manifest };
}

function copyTree(from: string, to: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      count += copyTree(source, target);
      continue;
    }
    if (!entry.isFile() || entry.name === MANIFEST_NAME) continue;
    fs.copyFileSync(source, target);
    count += 1;
  }
  return count;
}

export interface AutoBackupOutcome {
  created: boolean;
  path?: string;
  reason?: string;
  pruned?: number;
}

/** 每天首次启动时自动备份一次，并按保留份数清理旧文件 */
export function maybeAutoBackup(): AutoBackupOutcome {
  const settings = store.getSettings().backup;
  if (!settings?.autoEnabled) return { created: false, reason: '未开启自动备份' };

  const dir = resolveBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  const today = stamp().slice(0, 8);
  const existing = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('ZhiMail-auto-') && name.endsWith('.zip'));

  if (existing.some((name) => name.includes(`-${today}`))) {
    return { created: false, reason: '今日已备份' };
  }

  const target = path.join(dir, backupFileName('ZhiMail-auto'));
  const result = createBackup(target, { includeSecrets: settings.includeSecrets });

  const keep = Math.max(1, settings.keep ?? 7);
  const sorted = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('ZhiMail-auto-') && name.endsWith('.zip'))
    .sort()
    .reverse();
  let pruned = 0;
  for (const name of sorted.slice(keep)) {
    try {
      fs.rmSync(path.join(dir, name), { force: true });
      pruned += 1;
    } catch {
      /* 忽略删除失败 */
    }
  }

  return { created: true, path: result.path, pruned };
}

export interface BackupOverview {
  dataDir: string;
  backupDir: string;
  backups: { name: string; path: string; size: number; time: number }[];
  counts: BackupManifest['counts'];
}

export function getBackupOverview(): BackupOverview {
  const dir = resolveBackupDir();
  const backups: BackupOverview['backups'] = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.zip')) continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      backups.push({ name, path: full, size: stat.size, time: stat.mtimeMs });
    }
  }
  backups.sort((a, b) => b.time - a.time);
  return { dataDir: store.root, backupDir: dir, backups, counts: store.describeCounts() };
}
