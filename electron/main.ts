/** 知邮 ZhiMail 主进程：窗口、生命周期、IPC 注册、自动简报调度、截图模式 */

import { app, BrowserWindow, Menu, shell, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { initUpdater, isInstallingUpdate, onUpdateState } from './services/updater';
import { store } from './services/store';
import { resolveDataDir } from './services/location';
import { maybeAutoBackup } from './services/backup';
import { registerIpcHandlers, setMainWindow, startAutoReceive, startScheduler } from './ipc';
import { seedDemoData } from './services/demo';
import { imapService } from './services/imap';
import { briefScheduler } from './services/scheduler';
import {
  applyAppBehavior,
  applyFontScale,
  destroyTray,
  ensureTray,
  notifyNewMail,
} from './services/system';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const screenshotMode = process.env.ZHIMAIL_SCREENSHOT === '1';

let mainWindow: BrowserWindow | null = null;

/** 已提醒过的邮件 id，避免同一封邮件反复弹窗 */
const notifiedMessageIds = new Set<string>();

/** 新邮件提醒窗口：IDLE 推送或同步结束后调用 */
function maybeNotifyNewMail(accountId?: string): void {
  if (!(store.getSettings().mail?.notify ?? true)) return;
  const since = Date.now() - 5 * 60 * 1000;
  const { items } = store.queryMessages({
    accountId,
    unreadOnly: true,
    since,
    limit: 5,
    sortBy: 'date',
    sortDir: 'desc',
  });
  const fresh = items.filter((message) => !notifiedMessageIds.has(message.id));
  if (fresh.length === 0) return;
  for (const message of fresh) notifiedMessageIds.add(message.id);

  notifyNewMail(
    fresh.slice(0, 3).map((message) => ({
      id: message.id,
      subject: message.subject || '(无主题)',
      from: message.from[0]?.name || message.from[0]?.address || '未知发件人',
    })),
    (id) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('mail:open', { id });
    },
  );
}

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

  const onlyViews = (process.env.ZHIMAIL_SCREENSHOT_VIEWS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const views: { name: string; script: string; waitMs?: number }[] = [
    {
      name: '01b-skin-gmail',
      script: `(() => {
        let tries = 0;
        const tick = () => {
          if (window.__zhimailDev?.setSkin) {
            window.__zhimailDev.showMail?.();
            window.__zhimailDev.setSkin('gmail');
            return;
          }
          if (tries++ < 60) setTimeout(tick, 100);
        };
        tick();
        return true;
      })()`,
      waitMs: 2200,
    },
    {
      name: '01c-skin-notion',
      script: `(() => {
        window.__zhimailDev?.setSkin?.('notion');
        return true;
      })()`,
      waitMs: 1400,
    },
    {
      name: '01d-skin-picker',
      script: `(() => {
        window.__zhimailDev?.setSkin?.('default');
        const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '皮肤');
        if (btn) btn.click();
        return Boolean(btn);
      })()`,
      waitMs: 1000,
    },
    { name: '01-mail', script: 'window.__zhimailDev?.showMail?.()' },
    {
      name: '07-update-dialog',
      script: `(() => {
        let tries = 0;
        const tick = () => {
          if (window.__zhimailDev?.showUpdateDialog) {
            window.__zhimailDev.showUpdateDialog();
            return;
          }
          if (tries++ < 60) setTimeout(tick, 100);
        };
        tick();
        return true;
      })()`,
      waitMs: 1800,
    },
    {
      name: '01e-multi-select',
      script: `(() => {
        let tries = 0;
        const tick = () => {
          const rows = Array.from(document.querySelectorAll('div.cursor-default'));
          if (rows.length >= 4) {
            rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
            setTimeout(() => {
              rows[3].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
            }, 250);
            return;
          }
          if (tries++ < 60) setTimeout(tick, 100);
        };
        tick();
        return true;
      })()`,
      waitMs: 2200,
    },
    {
      name: '03b-brief-menu',
      script: `(() => {
        window.__zhimailDev?.showBriefs?.();
        setTimeout(() => {
          const rows = Array.from(document.querySelectorAll('button')).filter((b) => /简报/.test(b.textContent || ''));
          const target = rows[rows.length - 1];
          if (target) {
            const rect = target.getBoundingClientRect();
            target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 60, clientY: rect.top + 20 }));
          }
        }, 700);
        return true;
      })()`,
      waitMs: 2200,
    },
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
    {
      // 模拟从 1.0.0 升级到当前版本后首次启动，验证「本次更新内容」自动弹出
      name: '09-changelog',
      script: `(() => {
        try {
          window.localStorage.setItem('zhimail.lastSeenVersion', '1.0.0');
          window.location.reload();
          return true;
        } catch (error) {
          return false;
        }
      })()`,
      waitMs: 5200,
    },
    {
      // 阅读窗格操作条配置（设置 → 界面）
      name: '10-reader-actions',
      script: `(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) =>
          (el.textContent || '').includes('本次更新内容'),
        );
        if (dialog) {
          const btn = Array.from(dialog.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '关闭',
          );
          if (btn) btn.click();
        }
        window.__zhimailDev?.showSettings?.('ui');
        return true;
      })()`,
      waitMs: 3000,
    },
    {
      // 数据与备份（设置 → 数据与备份）
      name: '11-data-backup',
      script: `(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) =>
          (el.textContent || '').includes('本次更新内容'),
        );
        if (dialog) {
          const btn = Array.from(dialog.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '关闭',
          );
          if (btn) btn.click();
        }
        window.__zhimailDev?.showSettings?.('data');
        return true;
      })()`,
      waitMs: 3000,
    },
    {
      // 自动简报多组排程
      name: '12-brief-schedules',
      script: `(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) =>
          (el.textContent || '').includes('本次更新内容'),
        );
        if (dialog) {
          const closeBtn = Array.from(dialog.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '关闭',
          );
          if (closeBtn) closeBtn.click();
        }
        window.__zhimailDev?.showSettings?.('brief');
        setTimeout(() => {
          const btn = Array.from(document.querySelectorAll('button')).find((item) =>
            (item.textContent || '').includes('恢复默认（日报'),
          );
          if (btn) btn.click();
        }, 1500);
        return true;
      })()`,
      waitMs: 4200,
    },
    {
      // AI 助手最大化（其余区域暂时隐藏）
      name: '13-ai-maximized',
      script: `(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) =>
          (el.textContent || '').includes('本次更新内容'),
        );
        if (dialog) {
          const closeBtn = Array.from(dialog.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '关闭',
          );
          if (closeBtn) closeBtn.click();
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const dev = window.__zhimailDev;
        dev?.showAI?.();
        setTimeout(() => dev?.maximizeAIPanel?.(), 1200);
        return true;
      })()`,
      waitMs: 7000,
    },
    {
      name: '14-system-settings',
      script: `(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) =>
          (el.textContent || '').includes('本次更新内容'),
        );
        if (dialog) {
          const closeBtn = Array.from(dialog.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '关闭',
          );
          if (closeBtn) closeBtn.click();
        }
        window.__zhimailDev?.showSettings?.('app');
        return true;
      })()`,
      waitMs: 3200,
    },
    {
      name: '15-common-folders',
      script: `(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) =>
          (el.textContent || '').includes('本次更新内容'),
        );
        if (dialog) {
          const closeBtn = Array.from(dialog.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '关闭',
          );
          if (closeBtn) closeBtn.click();
        }
        window.__zhimailDev?.showMail?.();
        window.__zhimailDev?.showCommon?.('common/unread');
        return true;
      })()`,
      waitMs: 2600,
    },
    {
      name: '16-attachment-preview',
      script: `(() => {
        const closeDialog = () => {
          const dialog = Array.from(document.querySelectorAll('div')).find((el) =>
            (el.textContent || '').includes('本次更新内容'),
          );
          if (!dialog) return;
          const btn = Array.from(dialog.querySelectorAll('button')).find(
            (item) => (item.textContent || '').trim() === '关闭',
          );
          if (btn) btn.click();
        };
        closeDialog();
        window.__zhimailDev?.showMail?.();
        // 选中带附件的邮件，再点开附件预览
        setTimeout(() => {
          const row = Array.from(document.querySelectorAll('button, div[role="button"]')).find((el) =>
            (el.textContent || '').includes('客户反馈：灭菌后器械包出现湿包现象'),
          );
          if (row) row.click();
        }, 900);
        setTimeout(() => {
          const chip = Array.from(document.querySelectorAll('button')).find(
            (el) => /KB|MB/.test(el.textContent || '') && /照片|电气|PDF/.test(el.textContent || ''),
          );
          if (chip) chip.click();
        }, 2600);
        return true;
      })()`,
      waitMs: 5200,
    },

  ];

  for (const view of views) {
    if (onlyViews.length > 0 && !onlyViews.includes(view.name)) continue;
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
// Windows 任务栏分组标识：必须与安装包快捷方式的 AppUserModel.ID 一致，
// 否则同一程序会显示成两个图标
if (process.platform === 'win32') app.setAppUserModelId('com.zhimail.desktop');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'light';

    // 数据目录可由用户在设置中修改，位置记录在 userData 下，启动时解析
    store.init(resolveDataDir());
    const settings = store.getSettings();
    if (!settings.bootstrapped) {
      seedDemoData(false);
    }

    registerIpcHandlers();
    // 启动时按设置里的间隔开启定时收取（默认 15 分钟）
    startAutoReceive();
    mainWindow = createWindow();
    setMainWindow(mainWindow);
    applyAppBehavior(mainWindow);

    // 关闭主窗口时：按设置退出程序，或最小化到托盘继续收信
    mainWindow.on('close', (event) => {
      const quitOnClose = store.getSettings().app?.quitOnClose ?? true;
      // 安装更新时必须放行关闭，否则安装程序会一直等待进程退出
      if (quitOnClose || isInstallingUpdate() || (app as unknown as { isQuitting?: boolean }).isQuitting) return;
      event.preventDefault();
      mainWindow?.hide();
      ensureTray(
        () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
        () => {
          (app as unknown as { isQuitting?: boolean }).isQuitting = true;
          destroyTray();
          app.quit();
        },
      );
    });
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.log('[renderer] 进程异常退出：', details.reason);
    });

    // 自动简报调度：仅当用户开启且已配置模型时运行
    if (store.getSettings().brief.autoEnabled) startScheduler();

    // 在线更新：初始化并转发状态到界面
    initUpdater();

  // 每天首次启动自动备份一次（未开启时内部会直接返回）
  setTimeout(() => {
    try {
      const outcome = maybeAutoBackup();
      if (outcome.created) console.log('[backup] 自动备份完成:', outcome.path);
    } catch (error) {
      console.warn('[backup] 自动备份失败', (error as Error).message);
    }
  }, 6000);
    onUpdateState((state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:status', state);
      }
    });

    // 真实账户启动时建立 IDLE 长连接，实现新邮件即时到达
    for (const account of store.listAccounts()) {
      if (account.demo) continue;
      try {
        await imapService.startIdle(account, (accountId) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mail:new', { accountId });
          }
          maybeNotifyNewMail(accountId);
        });
      } catch (error) {
        console.warn('[main] IDLE 连接失败', account.email, (error as Error).message);
      }
    }

    if (screenshotMode) void runScreenshotMode(mainWindow);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        setMainWindow(mainWindow);
      }
    });
  });

  app.on('window-all-closed', () => {
    const quitOnClose = store.getSettings().app?.quitOnClose ?? true;
    if (isInstallingUpdate()) {
      // 安装更新：直接退出，把控制权交给安装程序
      void imapService.stopAll();
      briefScheduler.stop();
      destroyTray();
      store.flush();
      app.quit();
      return;
    }
    if (!quitOnClose) return; // 最小化到托盘，保持后台收信
    void imapService.stopAll();
    briefScheduler.stop();
    destroyTray();
    store.flush();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    (app as unknown as { isQuitting?: boolean }).isQuitting = true;
    briefScheduler.stop();
    store.flush();
  });
}
