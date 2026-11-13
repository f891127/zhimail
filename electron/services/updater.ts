/**
 * 在线更新：基于 electron-updater + GitHub Releases。
 * 支持自动检查、手动检查、自动/手动下载，下载完成后重启安装。
 */

import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
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
  | 'installing'
  | 'error'
  | 'unsupported';

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  /** 安装形态：安装版可静默自动安装；便携版只能手动替换 */
  installMode: 'installed' | 'portable' | 'dev';
  /** 是否支持一键自动安装并重启 */
  canAutoInstall: boolean;
  /** 便携版手动下载页 */
  releaseUrl: string;
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
  canCheck: boolean;
}

/** 便携版由 electron-builder 注入 PORTABLE_EXECUTABLE_DIR，此时无法静默替换自身文件 */
function detectInstallMode(): 'installed' | 'portable' | 'dev' {
  if (!app.isPackaged) return 'dev';
  if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  return 'installed';
}

const installMode = detectInstallMode();
export const RELEASE_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`;

let state: UpdateState = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  installMode,
  canAutoInstall: installMode === 'installed',
  releaseUrl: RELEASE_URL,
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
    setState({ phase: 'downloaded', version: info.version, percent: 100, error: undefined }),
  );
  // 该事件在部分 electron-updater 版本的类型定义中缺失，这里按事件名注册
  (autoUpdater as unknown as { on: (event: string, listener: () => void) => void }).on(
    'before-quit-for-update',
    () => setState({ phase: 'installing' }),
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

/**
 * 立即安装并重启：
 * - 安装版：静默安装（isSilent=true）并在安装完成后自动启动新版本（isForceRunAfter=true）
 * - 便携版：无法替换正在运行的程序文件，返回失败并提示手动下载
 * 注意：不要在调用前销毁窗口，否则进程可能先退出，安装器根本没机会启动。
 */
/** 是否正在执行安装（用于放行窗口关闭，避免安装被拦截） */
let installing = false;
export function isInstallingUpdate(): boolean {
  return installing;
}

/** 找到已下载的安装包（electron-updater 的 pending 缓存目录） */
export function findDownloadedInstaller(): string | null {
  const roots = [
    path.join(app.getPath('userData'), '..', `${app.name}-updater`, 'pending'),
    path.join(app.getPath('appData'), `${app.name}-updater`, 'pending'),
    path.join(app.getPath('temp'), `${app.name}-updater`),
  ];
  let newest: { file: string; mtime: number } | null = null;
  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      for (const entry of fs.readdirSync(root)) {
        if (!/\.(exe|msi|zip|dmg|AppImage)$/i.test(entry)) continue;
        const file = path.join(root, entry);
        const mtime = fs.statSync(file).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { file, mtime };
      }
    } catch {
      /* 忽略单个目录的异常 */
    }
  }
  return newest?.file ?? null;
}

/** 手动运行已下载的安装包：作为自动安装失败时的兜底（安装向导有完整进度） */
export async function openDownloadedInstaller(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const file = findDownloadedInstaller();
  if (!file) return { ok: false, error: '没有找到已下载的安装包，请先点击「下载更新」' };
  const error = await shell.openPath(file);
  if (error) return { ok: false, path: file, error };
  return { ok: true, path: file };
}

export function installUpdate(): { ok: boolean; error?: string } {
  if (!app.isPackaged) {
    setState({ phase: 'unsupported', error: '开发模式无法安装更新' });
    return { ok: false, error: '开发模式无法安装更新' };
  }
  if (installMode === 'portable') {
    const error = '当前是免安装便携版，更新程序无法替换正在运行的文件。请下载新版便携包解压覆盖，或改用安装版以获得一键自动更新。';
    setState({ phase: 'downloaded', error });
    return { ok: false, error };
  }

  installing = true;
  setState({ phase: 'installing', error: undefined });

  // 先让界面把安装遮罩画出来，再退出进程启动安装程序（否则窗口会先消失，用户看不到任何反馈）
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      installing = false;
      const message = String((error as Error).message).slice(0, 300);
      setState({ phase: 'downloaded', error: `启动安装失败：${message}` });
    }
  }, 1200);

  // 兜底：30 秒后进程仍在运行，说明安装器没有接管，给出可操作的提示
  const timer = setTimeout(() => {
    if (!installing) return;
    installing = false;
    setState({
      phase: 'downloaded',
      error: '安装程序未能启动。可点击「手动运行安装包」用安装向导完成升级，或关闭应用后手动运行下载的安装包。',
    });
  }, 30_000);
  if (typeof timer.unref === 'function') timer.unref();

  return { ok: true };
}
