/** 智邮 ZhiYou 主进程：窗口、生命周期、IPC 注册、自动简报调度、截图模式 */

import { app, BrowserWindow, Menu, shell, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { initUpdater, isInstallingUpdate, onUpdateState } from './services/updater';
import { store } from './services/store';
import { initLogger, logLine, logRendererError, getLogPath } from './services/log';
import { resolveDataDir } from './services/location';
import { maybeAutoBackup } from './services/backup';
import { registerIpcHandlers, setMainWindow, startAutoReceive, startScheduler, warmDataSize } from './ipc';
import { seedDemoData } from './services/demo';
import { stopAttachmentServer } from './services/attachmentServer';
import { imapService } from './services/imap';
import { briefScheduler } from './services/scheduler';
import {
  applyAppBehavior,
  applyFontScale,
  destroyTray,
  ensureTray,
  notifyNewMail,
} from './services/system';

/**
 * 改名迁移：应用名从「知邮 ZhiMail」改为「智邮 ZhiYou」后，Electron 默认的 userData 目录会跟着变，
 * 老用户会看到「账户和邮件都不见了」。这里在启动早期把旧目录整体搬过去；
 * 搬不动（被占用等）就退回使用旧目录，宁可目录名难看，也不能丢数据。
 */
function migrateLegacyUserData(): void {
  try {
    const appData = app.getPath('appData');
    const currentName = app.getName();
    if (!currentName || currentName === 'ZhiMail') return;
    const targetDir = path.join(appData, currentName);
    const legacyDirs = [path.join(appData, 'ZhiMail'), path.join(appData, '知邮 ZhiMail')];
    const legacy = legacyDirs.find((dir) => fs.existsSync(dir));
    if (!legacy) return;
    if (fs.existsSync(targetDir)) return; // 已经在新目录运行过，不做任何事
    try {
      fs.renameSync(legacy, targetDir);
      console.log('[migrate] userData 已迁移：', legacy, '->', targetDir);
    } catch (error) {
      console.warn('[migrate] 迁移失败，继续使用旧目录：', (error as Error).message);
      app.setPath('userData', legacy);
    }
  } catch {
    /* 迁移属于尽力而为，失败不阻塞启动 */
  }
}
migrateLegacyUserData();
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
    title: '智邮 ZhiYou',
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
      waitMs: 3000,
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
    {
      name: '17-attachment-menu',
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
        window.__zhimailDev?.selectBySubject?.('湿包');
        setTimeout(() => {
          const chip = Array.from(document.querySelectorAll('button')).find((el) =>
            (el.textContent || '').includes('湿包现场记录'),
          );
          if (!chip) return;
          const rect = chip.getBoundingClientRect();
          chip.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: Math.round(rect.left + rect.width / 2),
              clientY: Math.round(rect.top + rect.height / 2),
            }),
          );
        }, 3200);
        return true;
      })()`,
      waitMs: 5600,
    },
    {
      name: '18-pdf-preview',
      script: `(() => {
        window.__zhimailDev?.showMail?.();
        window.__zhimailDev?.selectBySubject?.('评审');
        setTimeout(() => {
          const chip = Array.from(document.querySelectorAll('button')).find((el) =>
            (el.textContent || '').includes('.pdf'),
          );
          if (chip) chip.click();
        }, 2600);
        return true;
      })()`,
      waitMs: 11000,
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
    {
      name: '06b-update-test',
      script: `(async () => {
        window.__zhimailDev?.showSettings?.('update');
        await new Promise((resolve) => setTimeout(resolve, 600));
        const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === '测试');
        button?.click();
        return Boolean(button);
      })()`,
      waitMs: 4200,
    },
    {
      name: '06c-update-single',
      script: `(async () => {
        for (let index = 0; index < 40 && !window.__zhimailDev; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        // 初始化会重置界面状态，重复几次确保设置窗真的打开
        for (let index = 0; index < 6; index += 1) {
          window.__zhimailDev?.showSettings?.('update');
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        // 再尝试弹更新窗，验证不会出现两个下载窗口
        window.__zhimailDev?.showUpdateDialog?.();
        return true;
      })()`,
      waitMs: 2600,
    },
    {
      name: '19-about',
      script: `(async () => {
        for (let index = 0; index < 30 && !window.__zhimailDev; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        window.__zhimailDev?.showSettings?.('about');
        return true;
      })()`,
      waitMs: 2600,
    },
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
        window.__zhimailDev?.selectBySubject?.('湿包');
        setTimeout(() => {
          const chip = Array.from(document.querySelectorAll('button')).find(
            (el) => (el.textContent || '').includes('湿包现场记录'),
          );
          if (chip) chip.click();
        }, 3000);
        return true;
      })()`,
      waitMs: 5200,
    },

    {
      // 走真实交互路径：打开设置后点侧边栏「数据与备份」，验证占用统计不会一直停在「统计中」
      name: '08-settings-data',
      script: `(() => {
        window.__zhimailDev?.openSettings?.('account');
        setTimeout(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(
            (el) => (el.textContent || '').trim() === '数据与备份',
          );
          if (btn) btn.click();
        }, 600);
        return true;
      })()`,
      waitMs: 5000,
    },
    {
      name: '08-settings-update',
      script: `(() => {
        window.__zhimailDev?.openSettings?.('update');
        return true;
      })()`,
      waitMs: 2200,
    },
    {
      name: '08-settings-about',
      script: `(() => {
        window.__zhimailDev?.openSettings?.('about');
        return true;
      })()`,
      waitMs: 2200,
    },
  ];

  for (const view of views) {
    if (onlyViews.length > 0 && !onlyViews.includes(view.name)) continue;
    try {
      // 版本变化时更新日志会自动弹出，除专门展示它的视图外先关掉
      if (view.name !== '09-changelog') {
        await window.webContents.executeJavaScript(
          "document.querySelector('[data-changelog-close]')?.click?.(); true",
        );
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
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

// 启动耗时基准：用于定位「装完点完成卡一会儿」这类冷启动问题
const BOOT_TS = Date.now();
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
    logLine('perf', `whenReady 耗时 ${Date.now() - BOOT_TS}ms`);
    const tStore = Date.now();
    store.init(resolveDataDir());
    logLine('perf', `store.init 耗时 ${Date.now() - tStore}ms`);
    // 日志跟着数据目录走：白屏 / 闪退时可在 <数据目录>/logs/app.log 里查原因
    initLogger(store.root);
    logLine('app', `启动 v${app.getVersion()}（${app.isPackaged ? '打包版' : '开发版'}），数据目录 ${store.root}`);
    const settings = store.getSettings();
    if (!settings.bootstrapped) {
      const tSeed = Date.now();
      seedDemoData(false);
      logLine('perf', `首次写入示例数据 ${Date.now() - tSeed}ms`);
    }

    registerIpcHandlers();
    // 启动后空闲时统计一次数据目录占用，设置页打开即可显示
    setTimeout(() => void warmDataSize(), 4000);
    // 启动时按设置里的间隔开启定时收取（默认 15 分钟）
    startAutoReceive();
    mainWindow = createWindow();
    mainWindow.once('ready-to-show', () => {
      logLine('perf', `窗口可显示 总耗时 ${Date.now() - BOOT_TS}ms`);
    });
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
      if (level >= 2) {
        console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
        logLine(`renderer:${level}`, `${message} (${sourceId}:${line})`);
      }
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.log('[renderer] 进程异常退出：', details.reason);
      logLine('renderer-gone', `进程异常退出：${details.reason}`);
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
    stopAttachmentServer();
    (app as unknown as { isQuitting?: boolean }).isQuitting = true;
    briefScheduler.stop();
    store.flush();
  });
}
