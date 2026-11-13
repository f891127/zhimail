/**
 * 在线更新：基于 electron-updater + GitHub Releases。
 * 支持自动检查、手动检查、自动/手动下载，下载完成后重启安装。
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { store } from './store';

export const UPDATE_OWNER = 'f891127';
export const UPDATE_REPO = 'zhimail';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
  canCheck: boolean;
}

let state: UpdateState = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  canCheck: app.isPackaged,
};

let listeners: ((value: UpdateState) => void)[] = [];
let initialized = false;

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch, currentVersion: app.getVersion() };
  for (const listener of listeners) listener(state);
}

export function getUpdateState(): UpdateState {
  return state;
}

export function onUpdateState(listener: (value: UpdateState) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

function normalizeNotes(notes: unknown): string {
  if (!notes) return '';
  if (typeof notes === 'string') return notes.slice(0, 2000);
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (typeof item === 'string') return item;
        const record = item as { version?: string; note?: string };
        return `v${record.version ?? ''} ${(record.note ?? '').replace(/<[^>]+>/g, '')}`;
      })
      .join('\n')
      .slice(0, 2000);
  }
  return '';
}

/** 解析当前生效的更新源；custom 时使用通用源（可填镜像前缀） */
export function resolveUpdateFeed(): Record<string, unknown> {
  const settings = store.getSettings().update;
  const customUrl = (settings?.customUrl ?? '').trim();
  if (settings?.source === 'custom' && customUrl) {
    return {
      provider: 'generic',
      url: customUrl.endsWith('/') ? customUrl : `${customUrl}/`,
    };
  }
  return { provider: 'github', owner: UPDATE_OWNER, repo: UPDATE_REPO };
}

/** 应用更新源；切换设置后需要重新调用 */
export function applyUpdateFeed(): void {
  try {
    autoUpdater.setFeedURL(resolveUpdateFeed() as never);
  } catch (error) {
    console.warn('[updater] 设置更新源失败', (error as Error).message);
  }
}

export function initUpdater(): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = store.getSettings().update?.autoDownload ?? false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;

  applyUpdateFeed();

  autoUpdater.on('checking-for-update', () => setState({ phase: 'checking', error: undefined }));
  autoUpdater.on('update-available', (info) =>
    setState({
      phase: 'available',
      version: info.version,
      releaseNotes: normalizeNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
      error: undefined,
    }),
  );
  autoUpdater.on('update-not-available', () => setState({ phase: 'not-available', version: undefined }));
  autoUpdater.on('download-progress', (progress) =>
    setState({
      phase: 'downloading',
      percent: Math.round(progress.percent * 10) / 10,
      bytesPerSecond: progress.bytesPerSecond,
    }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    setState({ phase: 'downloaded', version: info.version, percent: 100 }),
  );
  autoUpdater.on('error', (error) => {
    const raw = String(error?.message ?? error);
    const networkIssue = /ERR_CONNECTION|ETIMEDOUT|ENOTFOUND|ECONNRESET|timeout|socket hang up/i.test(raw);
    setState({
      phase: 'error',
      error: networkIssue
        ? `无法连接更新服务器（${raw.slice(0, 120)}）。常见原因是网络无法直连 GitHub，可在下方把更新源切换为镜像地址后重试。`
        : raw.slice(0, 400),
    });
  });

  // 启动后自动检查（打包版本才可用）
  if (app.isPackaged && (store.getSettings().update?.autoCheck ?? true)) {
    setTimeout(() => {
      void checkForUpdates().catch(() => undefined);
    }, 8000);
  }
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) {
    setState({
      phase: 'unsupported',
      error: '开发模式不检查更新；安装版会从 GitHub Releases 检查新版本。',
      canCheck: false,
    });
    return state;
  }
  setState({ phase: 'checking', canCheck: true });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const raw = String((error as Error).message);
    const networkIssue = /ERR_CONNECTION|ETIMEDOUT|ENOTFOUND|ECONNRESET|timeout|socket hang up/i.test(raw);
    setState({
      phase: 'error',
      error: networkIssue
        ? `无法连接更新服务器（${raw.slice(0, 120)}）。常见原因是网络无法直连 GitHub，可在下方把更新源切换为镜像地址后重试。`
        : raw.slice(0, 400),
    });
  }
  return state;
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!app.isPackaged) {
    setState({ phase: 'unsupported', error: '开发模式无法下载更新' });
    return state;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    setState({ phase: 'error', error: String((error as Error).message).slice(0, 400) });
  }
  return state;
}

export function quitAndInstall(window?: BrowserWindow | null): void {
  if (!app.isPackaged) return;
  setImmediate(() => {
    window?.destroy();
    autoUpdater.quitAndInstall(false, true);
  });
}
