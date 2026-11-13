/**
 * 程序行为服务（参照 Foxmail 的「系统设置 → 程序 / 邮件」）：
 * - 开机自动启动、最小化时是否在任务栏显示、关闭主窗口是否退出
 * - 注册为系统默认邮件客户端（Windows 注册表，HKCU 无需管理员）
 * - 界面字体大小（缩放因子）
 * - 新邮件提醒窗口（系统通知）与托盘
 */

import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, shell } from 'electron';
import { execFile } from 'node:child_process';
import { store } from './store';
import { TRAY_ICON_DATA_URL } from './trayIcon';

let tray: Tray | null = null;

/* ----------------------------- 界面字体大小 ----------------------------- */

export function fontScaleFactor(scale: 'small' | 'standard' | 'large'): number {
  if (scale === 'small') return 0.9;
  if (scale === 'large') return 1.12;
  return 1;
}

export function applyFontScale(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return;
  const factor = fontScaleFactor(store.getSettings().app?.fontScale ?? 'standard');
  window.webContents.setZoomFactor(factor);
}

/* ------------------------------- 程序行为 ------------------------------- */

export function applyAppBehavior(window: BrowserWindow | null): void {
  const behavior = store.getSettings().app;
  try {
    app.setLoginItemSettings({
      openAtLogin: behavior?.autoLaunch ?? false,
      openAsHidden: true,
      args: ['--hidden'],
    });
  } catch (error) {
    console.warn('[system] 设置开机自启失败', (error as Error).message);
  }
  try {
    window?.setSkipTaskbar(!(behavior?.showInTaskbar ?? true));
  } catch (error) {
    console.warn('[system] 设置任务栏显示失败', (error as Error).message);
  }
  applyFontScale(window);
}

/* --------------------------- 系统默认邮件客户端 --------------------------- */

export function getDefaultMailClientStatus(): { supported: boolean; enabled: boolean } {
  if (process.platform !== 'win32') return { supported: false, enabled: false };
  return { supported: true, enabled: store.getSettings().app?.defaultMailClient === true };
}

/**
 * 在 Windows 上把本程序注册为 mailto 处理程序（写入 HKCU，不需要管理员权限）。
 * 关闭时删除对应注册表项。
 */
export function setDefaultMailClient(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, error: '仅 Windows 支持注册系统默认邮件客户端' });
      return;
    }
    const exe = process.execPath;
    const clientKey = 'HKCU\\Software\\Clients\\Mail\\知邮 ZhiMail';
    const commands: string[][] = enabled
      ? [
          ['add', 'HKCU\\Software\\Classes\\ZhiMail', '/ve', '/d', 'URL:知邮邮件', '/f'],
          ['add', 'HKCU\\Software\\Classes\\ZhiMail\\DefaultIcon', '/ve', '/d', `${exe},0`, '/f'],
          ['add', 'HKCU\\Software\\Classes\\ZhiMail\\shell\\open\\command', '/ve', '/d', `"${exe}" "%1"`, '/f'],
          ['add', 'HKCU\\Software\\Classes\\mailto', '/ve', '/d', 'URL:mailto Protocol', '/f'],
          ['add', 'HKCU\\Software\\Classes\\mailto\\shell\\open\\command', '/ve', '/d', `"${exe}" "%1"`, '/f'],
          ['add', clientKey, '/ve', '/d', '知邮 ZhiMail', '/f'],
          ['add', `${clientKey}\\DefaultIcon`, '/ve', '/d', `${exe},0`, '/f'],
          ['add', `${clientKey}\\shell\\open\\command`, '/ve', '/d', `"${exe}" "%1"`, '/f'],
        ]
      : [
          ['delete', 'HKCU\\Software\\Classes\\ZhiMail', '/f'],
          ['delete', 'HKCU\\Software\\Classes\\mailto\\shell\\open\\command', '/f'],
          ['delete', clientKey, '/f'],
        ];

    const run = (index: number) => {
      if (index >= commands.length) {
        store.updateSettings({ app: { ...store.getSettings().app, defaultMailClient: enabled } });
        resolve({ ok: true });
        return;
      }
      execFile('reg', commands[index], (error) => {
        if (error && enabled) {
          resolve({ ok: false, error: error.message.slice(0, 200) });
          return;
        }
        run(index + 1);
      });
    };
    run(0);
  });
}

/* --------------------------------- 托盘 --------------------------------- */

export function ensureTray(onShow: () => void, onQuit: () => void): Tray {
  if (tray) return tray;
  tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON_DATA_URL));
  tray.setToolTip('知邮 ZhiMail');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: onShow },
      { type: 'separator' },
      { label: '退出知邮', click: onQuit },
    ]),
  );
  tray.on('double-click', onShow);
  tray.on('click', onShow);
  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

/* ------------------------------ 新邮件提醒 ------------------------------ */

export interface NewMailNotice {
  id: string;
  subject: string;
  from: string;
}

/** 新邮件提醒窗口：点击通知后聚焦主窗口并定位到该邮件 */
export function notifyNewMail(notices: NewMailNotice[], onOpen: (id: string) => void): void {
  if (notices.length === 0) return;
  if (!Notification.isSupported()) return;

  const first = notices[0];
  const body =
    notices.length === 1
      ? `${first.from}\n${first.subject}`
      : `${first.from}：${first.subject}\n另有 ${notices.length - 1} 封新邮件`;

  const notification = new Notification({
    title: notices.length === 1 ? '新邮件' : `${notices.length} 封新邮件`,
    body,
    icon: nativeImage.createFromDataURL(TRAY_ICON_DATA_URL),
    silent: !(store.getSettings().mail?.notifySound ?? false),
  });
  notification.on('click', () => onOpen(first.id));
  notification.show();
}

export function openExternal(url: string): Promise<void> {
  return shell.openExternal(url);
}
