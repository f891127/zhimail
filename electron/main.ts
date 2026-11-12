/** 知邮 ZhiMail 主进程：窗口、生命周期、IPC 注册、自动简报调度、截图模式 */

import { app, BrowserWindow, Menu, shell, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { store } from './services/store';
import { registerIpcHandlers, setMainWindow, startScheduler } from './ipc';
import { seedDemoData } from './services/demo';
import { imapService } from './services/imap';
import { briefScheduler } from './services/scheduler';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const screenshotMode = process.env.ZHIMAIL_SCREENSHOT === '1';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 660,
    show: false,
    backgroundColor: '#f5f6f7',
    title: '知邮 ZhiMail',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  window.once('ready-to-show', () => {
    if (!screenshotMode) window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }

  // 调试辅助：ZHIMAIL_DEV_VIEW=showAI 可在窗口可见状态下自动切换到某个调试视图
  const devView = process.env.ZHIMAIL_DEV_VIEW;
  if (devView) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void window.webContents.executeJavaScript(`window.__zhimailDev?.${devView}?.()`);
      }, 2200);
    });
  }

  return window;
}

async function runScreenshotMode(window: BrowserWindow): Promise<void> {
  const outDir = path.join(process.cwd(), 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((resolve) => setTimeout(resolve, 2600));

  const views: { name: string; script: string; waitMs?: number }[] = [
    { name: '01-mail', script: 'window.__zhimailDev?.showMail?.()' },
    { name: '02-ai-panel', script: 'window.__zhimailDev?.showAI?.()' },
    {
      name: '02b-analysis',
      script: `(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find((btn) => (btn.textContent || '').includes('开始汇总分析'));
        if (target) target.click();
        return Boolean(target);
      })()`,
    },
    { name: '03-briefs', script: 'window.__zhimailDev?.showBriefs?.()' },
    { name: '04-todos', script: 'window.__zhimailDev?.showTodos?.()' },
    { name: '05-settings', script: 'window.__zhimailDev?.showSettings?.()' },
    {
      name: '06-update',
      script: `(() => {
        const target = Array.from(document.querySelectorAll('button')).find((btn) => (btn.textContent || '').trim() === '在线更新');
        if (target) target.click();
        return Boolean(target);
      })()`,
    },
    {
      name: '07-translate',
      script: `(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        window.__zhimailDev?.showAI?.();
        const attempt = (left) => {
          const btn = Array.from(document.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '译英',
          );
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
          if (left > 0) setTimeout(() => attempt(left - 1), 500);
          return false;
        };
        setTimeout(() => attempt(24), 1800);
        return true;
      })()`,
      waitMs: 9000,
    },
    {
      name: '08-context',
      script: `(() => {
        const rows = Array.from(document.querySelectorAll('div')).filter(
          (el) => (el.className || '').includes('border-b') && (el.className || '').includes('px-2.5'),
        );
        const row = rows.find((el) => (el.textContent || '').includes('11 月产品例会'));
        if (!row) return false;
        const rect = row.getBoundingClientRect();
        row.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 150, clientY: rect.top + 18 }),
        );
        return true;
      })()`,
      waitMs: 2200,
    },
  ];

  for (const view of views) {
    try {
      await window.webContents.executeJavaScript(view.script);
    } catch (error) {
      console.warn('[screenshot] 视图切换失败', view.name, (error as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, view.waitMs ?? 2800));
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${view.name}.png`), image.toPNG());
    console.log('[screenshot] 已保存', view.name);
  }
  app.quit();
}
