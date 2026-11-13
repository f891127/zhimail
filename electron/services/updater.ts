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
    const kind = classifyUpdateError(raw);
    if (kind === 'not-found') {
      // 上游没有比当前版本更新的发布（或清单缺失），按「已是最新版本」提示，不再报连接错误
      setState({ phase: 'not-available', error: undefined });
      return;
    }
    setState({
      phase: 'error',
      error:
        kind === 'network'
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


/** 把 electron-updater 的报错分类：网络不通 / 没有可用的更新包 / 其他 */
function classifyUpdateError(raw: string): 'network' | 'not-found' | 'other' {
  if (/ERR_CONNECTION|ETIMEDOUT|ENOTFOUND|ECONNRESET|EAI_AGAIN|timeout|socket hang up|net::ERR_INTERNET/i.test(raw)) {
    return 'network';
  }
  // 没有新版本、渠道不存在、latest.yml 404 等情况都表示「当前已是最新」
  if (/404|not found|cannot find|no published versions|ERR_HTTP_RESPONSE_CODE_FAILURE|latest\.yml/i.test(raw)) {
    return 'not-found';
  }
  return 'other';
}

export async function checkForUpdates(): Promise<UpdateState> {
  // 下载或安装进行中不要再触发检查：electron-updater 会直接拒绝这次调用，
  // 界面上就表现为「点了在线更新没反应」。直接把当前进度回给界面。
  if (state.phase === 'downloading' || state.phase === 'downloaded' || state.phase === 'installing') {
    return state;
  }
  if (state.phase === 'checking') return state;
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
    const kind = classifyUpdateError(raw);
    if (kind === 'not-found') {
      setState({ phase: 'not-available', error: undefined });
      return state;
    }
    setState({
      phase: 'error',
      error:
        kind === 'network'
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

  // 先让界面把安装遮罩画出来，再退出进程启动安装程序（否则窗口会先消失，用户看不到任何反馈）。
  // 400ms 足够画一帧，等待越久用户越觉得「点安装卡住」。
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


/**
 * 把用户填的地址规范成「latest.yml 所在目录」。
 * GitHub 官方与镜像常见的几种写法都要能认：
 *   （空）                    -> .../releases/latest/download
 *   .../releases/latest       -> .../releases/latest/download
 *   .../releases/tag/v1.2.0   -> .../releases/download/v1.2.0
 *   .../releases/latest/download（已正确，原样保留）
 */
function normalizeFeedBase(rawUrl: string): string {
  let base = (rawUrl || `${RELEASE_URL}/download`).trim().replace(/\/+$/, '');
  if (/\/releases\/latest$/i.test(base)) base = `${base}/download`;
  else if (/\/releases\/tag\/[^/]+$/i.test(base)) base = base.replace(/\/releases\/tag\//i, '/releases/download/');
  else if (/\/releases$/i.test(base)) base = `${base}/latest/download`;
  return base;
}

/** 「测试更新源」的结果：能拿到 latest.yml 就说明这个地址可用 */
export interface UpdateSourceTest {
  ok: boolean;
  feedUrl: string;
  version?: string;
  installer?: string;
  latencyMs: number;
  /** 安装包是否也能取到（只发 HEAD，失败不算致命） */
  installerOk?: boolean;
  error?: string;
  hint?: string;
}

/**
 * 测试更新源：按 electron-updater 的 generic 约定，取 `<base>/latest.yml`。
 * 这里不启动真实更新流程，只做一次带超时的探测，让用户先确认地址是否可达。
 */
export async function testUpdateSource(rawUrl: string): Promise<UpdateSourceTest> {
  const base = normalizeFeedBase(rawUrl);
  const feedUrl = `${base}/latest.yml`;
  const started = Date.now();
  const withTimeout = async (url: string, ms: number, method = 'GET') => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { method, signal: controller.signal, redirect: 'follow' });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const response = await withTimeout(feedUrl, 15_000);
    const latencyMs = Date.now() - started;
    if (response.status === 404) {
      return {
        ok: false,
        feedUrl,
        latencyMs,
        error: `地址可访问，但该路径下没有 latest.yml（HTTP 404）`,
        hint: '确认地址指向 releases/latest/download 这一级；镜像请保留完整的 GitHub 原始地址。',
      };
    }
    if (!response.ok) {
      return { ok: false, feedUrl, latencyMs, error: `读取 latest.yml 失败（HTTP ${response.status}）` };
    }
    const text = await response.text();
    const version = /^version:\s*(.+)$/m.exec(text)?.[1]?.trim();
    const installer = /^\s*-?\s*url:\s*(.+)$/m.exec(text)?.[1]?.trim();
    if (!version) {
      return {
        ok: false,
        feedUrl,
        latencyMs,
        error: '返回内容不是有效的 latest.yml',
        hint: '这个地址可能被重定向到 HTML 页面（例如镜像的登录页或错误页）。',
      };
    }
    let installerOk: boolean | undefined;
    if (installer) {
      try {
        const head = await withTimeout(`${base}/${installer}`, 15_000, 'HEAD');
        installerOk = head.ok;
      } catch {
        installerOk = false;
      }
    }
    return {
      ok: true,
      feedUrl,
      version,
      installer,
      latencyMs,
      installerOk,
      hint:
        installerOk === false
          ? '清单可读，但安装包暂时取不到（镜像可能尚未缓存），正式更新时可能失败。'
          : undefined,
    };
  } catch (error) {
    const message = String((error as Error).message || error);
    const aborted = /abort/i.test(message);
    return {
      ok: false,
      feedUrl,
      latencyMs: Date.now() - started,
      error: aborted ? '请求超时（15 秒无响应）' : message.slice(0, 200),
      hint: '常见原因是本机无法直连该地址，换一个镜像或使用代理后重试。',
    };
  }
}
