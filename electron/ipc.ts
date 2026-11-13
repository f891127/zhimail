/** IPC 接口层：渲染进程通过 preload 暴露的 API 调用这些处理函数 */

import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { store } from './services/store';
import type { AppLocale } from './services/types';
import { applyAppBehavior, getDefaultMailClientStatus, setDefaultMailClient } from './services/system';
import { fetchBalance, resetBalanceCache, testBalance } from './services/ai/balance';
import { defaultDataDir, isCustomDataDir, migrateData, saveDataDir } from './services/location';
import {
  backupFileName,
  createBackup,
  getBackupOverview,
  inspectBackup,
  maybeAutoBackup,
  resolveBackupDir,
  restoreBackup,
} from './services/backup';
import {
  listAccounts,
  removeAccount,
  saveAccount,
  testAccount,
  ensureDefaultFolders,
} from './services/accounts';
import { imapService } from './services/imap';
import { smtpService } from './services/smtp';
import { groupThreads } from './services/thread';
import { runSearch } from './services/search';
import { generateBrief, exportBrief, listBriefs, getBrief, removeBrief, BRIEF_GROUPS, BRIEF_ROOT_ID } from './services/brief';
import { createTodoItems, listTodos, removeTodo, toggleTodo, updateTodo, clearCompleted, todoStats } from './services/todo';
import { seedDemoData, DEMO_ACCOUNT_ID } from './services/demo';
import { briefScheduler } from './services/scheduler';
import {
  applyUpdateFeed,
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  openDownloadedInstaller,
  RELEASE_URL,
} from './services/updater';
import {
  analyzeRange,
  composeAssist,
  extractTodosFromMessage,
  interpretSearch,
  suggestReplies,
  summarizeMessage,
  summarizeThread,
  testAIConnection,
  translateMessage,
  triageMessage,
} from './services/ai/tasks';
import { AI_PROVIDERS } from './services/ai/presets';
import { MAIL_PRESETS } from './services/presets';
import { isStrongEncryptionAvailable } from './services/crypto';
import type {
  AccountInput,
  AISettings,
  AppSettings,
  BriefGenerateParams,
  ComposeAssistParams,
  DraftInput,
  FolderView,
  MessageFull,
  MessageMeta,
  MessageQuery,
  RangeAnalysisParams,
  SyncProgress,
} from './services/types';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

function emit(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function briefFolders(): FolderView[] {
  const briefs = store.listBriefs();
  const root: FolderView = {
    id: BRIEF_ROOT_ID,
    accountId: 'local',
    name: '邮件简报',
    kind: 'brief',
    deletable: false,
    order: 900,
    local: true,
    unread: 0,
    total: briefs.length,
  };
  const groups: FolderView[] = BRIEF_GROUPS.map((group, index) => ({
    id: group.id,
    accountId: 'local',
    name: group.name,
    kind: 'brief' as const,
    parentId: BRIEF_ROOT_ID,
    deletable: false,
    order: 901 + index,
    local: true,
    unread: 0,
    total: briefs.filter((brief) => brief.group === group.id).length,
  }));
  return [root, ...groups];
}

/** 把「常用文件夹」的虚拟 id 翻译成查询条件 */
function virtualFolderQuery(folderId: string, rest: MessageQuery): MessageQuery | null {
  const base: MessageQuery = { ...rest, excludeKinds: ['trash', 'junk', 'draft'] };
  if (folderId === 'common/unread') base.unreadOnly = true;
  else if (folderId === 'common/flagged') base.flaggedOnly = true;
  else if (folderId === 'common/important') base.importance = 'high';
  else if (folderId === 'common/labels') base.hasLabel = true;
  else if (folderId === 'common/todo') {
    base.messageIds = listTodos()
      .map((item) => item.sourceMessageId)
      .filter((id): id is string => Boolean(id));
    if (base.messageIds.length === 0) return { ...base, messageIds: ['__none__'] };
  } else return null;
  return base;
}

/** 「常用文件夹」：跨账户的虚拟视图，参照 Foxmail 的常用文件夹分组 */
function commonFolders(): FolderView[] {
  const excludeKinds = ['trash', 'junk', 'draft'];
  const count = (query: Parameters<typeof store.queryMessages>[0]) =>
    store.queryMessages({ ...query, excludeKinds, limit: 100000 });

  const unread = count({ unreadOnly: true });
  const flagged = count({ flaggedOnly: true });
  const important = count({ importance: 'high' });
  const todoIds = new Set(
    listTodos()
      .map((item) => item.sourceMessageId)
      .filter((id): id is string => Boolean(id)),
  );
  const todoCount = store
    .queryMessages({ excludeKinds, limit: 100000 })
    .items.filter((message) => todoIds.has(message.id)).length;

  const base = {
    accountId: '',
    kind: 'virtual' as const,
    order: -10,
    remotePath: '',
    parentId: undefined,
    deletable: false,
  };
  return [
    { ...base, id: 'common', name: '常用文件夹', unread: 0, total: 0 },
    { ...base, id: 'common/unread', name: '所有未读', parentId: 'common', unread: unread.total, total: unread.total },
    { ...base, id: 'common/flagged', name: '置顶邮件', parentId: 'common', unread: 0, total: flagged.total },
    { ...base, id: 'common/important', name: '高优先级', parentId: 'common/labels', unread: 0, total: important.total },
    { ...base, id: 'common/todo', name: '待办邮件', parentId: 'common/labels', unread: 0, total: todoCount },
    { ...base, id: 'common/labels', name: '标签邮件', parentId: 'common', unread: 0, total: important.total + todoCount },
  ];
}

function folderViews(): FolderView[] {
  const folders = store.listFolders().map((folder) => ({
    ...folder,
    unread: store.countUnread(folder.id),
    total: store.countFolder(folder.id),
  }));
  return [...commonFolders(), ...folders, ...briefFolders()];
}

function folderOf(id: string) {
  return store.getFolder(id);
}

/** 读取邮件正文；真实账户缺少正文时按需从服务器下载 */
async function loadMessage(id: string): Promise<MessageFull | undefined> {
  const meta = store.getMessageMeta(id);
  if (!meta) return undefined;
  let body = store.getMessageBody(meta.accountId, meta.folderId, meta.uid);
  const account = store.getAccount(meta.accountId);
  const folder = folderOf(meta.folderId);
  if ((!body || (!body.text && !body.html)) && account && folder && !account.demo && folder.remotePath) {
    try {
      const fetched = await imapService.fetchMessageBody(account, folder, meta.uid);
      if (fetched) body = fetched;
    } catch (error) {
      console.warn('[ipc] 按需下载正文失败', (error as Error).message);
    }
  }
  return { ...meta, body: body ?? { attachments: [] } };
}

export function registerIpcHandlers(): void {
  /* ------------------------------ 应用信息 ------------------------------ */

  ipcMain.handle('app/info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: store.root,
    dataDirCustom: isCustomDataDir(),
    defaultDataDir: defaultDataDir(),
    strongEncryption: isStrongEncryptionAvailable(),
    mailPresets: MAIL_PRESETS,
    aiProviders: AI_PROVIDERS,
  }));

  /* ------------------------------ 账户 ------------------------------ */

  ipcMain.handle('accounts/list', () => listAccounts());

  ipcMain.handle('accounts/save', (_event, input: AccountInput) => {
    const account = saveAccount(input);
    ensureDefaultFolders(account.id);
    return listAccounts();
  });

  ipcMain.handle('accounts/remove', async (_event, id: string) => {
    if (id === DEMO_ACCOUNT_ID) {
      await imapService.stopIdle(id);
      store.removeAccount(id);
      return listAccounts();
    }
    return removeAccount(id);
  });

  ipcMain.handle('accounts/test', async (_event, input: AccountInput) => testAccount(input));

  /* ------------------------------ 文件夹 ------------------------------ */

  ipcMain.handle('folders/list', () => folderViews());

  ipcMain.handle('folders/create', (_event, payload: { accountId: string; name: string }) => {
    const id = `${payload.accountId}:custom-${Date.now()}`;
    store.upsertFolder({
      id,
      accountId: payload.accountId,
      name: payload.name,
      kind: 'custom',
      deletable: true,
      order: 20,
      local: true,
    });
    return folderViews();
  });

  ipcMain.handle('folders/remove', (_event, id: string) => {
    const folder = folderOf(id);
    if (folder && folder.deletable) store.removeFolder(id);
    return folderViews();
  });

  /* ------------------------------ 邮件 ------------------------------ */

  ipcMain.handle('messages/list', (_event, query: MessageQuery) => {
    if (query.folderId && query.folderId.startsWith('briefs')) {
      return { total: 0, items: [] as MessageMeta[] };
    }
    // 常用文件夹（虚拟视图）：把 folderId 翻译成跨账户的筛选条件
    if (query.folderId && query.folderId.startsWith('common')) {
      const { folderId, ...rest } = query;
      const mapped = virtualFolderQuery(folderId, rest);
      if (!mapped) return { total: 0, items: [] as MessageMeta[] };
      return store.queryMessages(mapped);
    }
    return store.queryMessages(query);
  });

  ipcMain.handle('messages/get', async (_event, id: string) => loadMessage(id));

  ipcMain.handle('messages/thread', (_event, threadId: string) => {
    const result = store.queryMessages({ threadId, limit: 200, sortDir: 'asc' });
    return result.items;
  });

  ipcMain.handle('messages/threads', (_event, query: MessageQuery) => {
    // 常用文件夹同样是跨账户视图，这里做一次同样的条件映射
    const mapped =
      query.folderId && query.folderId.startsWith('common')
        ? (() => {
            const { folderId, ...rest } = query;
            return virtualFolderQuery(folderId, rest);
          })()
        : query;
    if (!mapped) return { total: 0, items: [] };
    const result = store.queryMessages({ ...mapped, limit: 2000 });
    const threads = groupThreads(result.items).slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 200));
    return { total: groupThreads(result.items).length, items: threads };
  });

  ipcMain.handle('messages/flags', async (_event, payload: { ids: string[]; flag: string; value: boolean }) => {
    const touched: { accountId: string; folderId: string; uid: number; add: boolean }[] = [];
    for (const id of payload.ids) {
      const meta = store.getMessageMeta(id);
      if (!meta) continue;
      const flags = new Set(meta.flags);
      if (payload.value) flags.add(payload.flag);
      else flags.delete(payload.flag);
      store.patchMessage(id, { flags: [...flags] });
      touched.push({ accountId: meta.accountId, folderId: meta.folderId, uid: meta.uid, add: payload.value });
    }
    // 后台同步到服务器，失败不影响本地状态
    for (const item of touched) {
      const account = store.getAccount(item.accountId);
      const folder = folderOf(item.folderId);
      if (!account || !folder || account.demo || !folder.remotePath) continue;
      try {
        await imapService.setFlags(account, folder, [item.uid], payload.flag, item.add);
      } catch (error) {
        console.warn('[ipc] 标记同步失败', (error as Error).message);
      }
    }
    return folderViews();
  });

  ipcMain.handle('messages/move', async (_event, payload: { ids: string[]; folderId: string }) => {
    store.moveMessages(payload.ids, payload.folderId);
    const target = folderOf(payload.folderId);
    if (target?.remotePath) {
      for (const id of payload.ids) {
        const meta = store.getMessageMeta(id);
        if (!meta) continue;
        const account = store.getAccount(meta.accountId);
        const source = folderOf(meta.folderId);
        if (!account || account.demo || !source?.remotePath) continue;
        try {
          await imapService.moveMessages(account, source, [meta.uid], target.remotePath);
        } catch (error) {
          console.warn('[ipc] 移动同步失败', (error as Error).message);
        }
      }
    }
    return folderViews();
  });

  ipcMain.handle('messages/delete', async (_event, ids: string[]) => {
    const metas = ids.map((id) => store.getMessageMeta(id)).filter(Boolean) as MessageMeta[];
    store.deleteMessages(ids);
    for (const meta of metas) {
      const account = store.getAccount(meta.accountId);
      const folder = folderOf(meta.folderId);
      if (!account || account.demo || !folder?.remotePath) continue;
      try {
        await imapService.deleteMessages(account, folder, [meta.uid]);
      } catch (error) {
        console.warn('[ipc] 删除同步失败', (error as Error).message);
      }
    }
    return folderViews();
  });

  ipcMain.handle('messages/send', async (_event, draft: DraftInput) => {
    const account = store.getAccount(draft.accountId);
    if (!account) return { ok: false, error: '账户不存在' };
    const result = await smtpService.send(account, draft);
    if (result.ok) {
      // 写入已发送文件夹（本地副本）
      const sentFolder = store
        .listFolders(account.id)
        .find((folder) => folder.kind === 'sent');
      if (sentFolder) {
        const uid = Date.now();
        const meta: MessageMeta = {
          id: `${account.id}/${sentFolder.id}/${uid}`,
          accountId: account.id,
          folderId: sentFolder.id,
          uid,
          messageId: result.messageId,
          subject: draft.subject || '(无主题)',
          from: [{ name: account.displayName, address: account.email }],
          to: draft.to.split(/[,;]/).filter(Boolean).map((address) => ({ address: address.trim() })),
          cc: (draft.cc ?? '')
            .split(/[,;]/)
            .filter(Boolean)
            .map((address) => ({ address: address.trim() })),
          date: Date.now(),
          size: draft.html.length,
          flags: ['\\Seen'],
          hasAttachments: Boolean(draft.attachments?.length),
          snippet: draft.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 180),
        };
        store.upsertMessageMetas([meta]);
        store.saveMessageBody(account.id, sentFolder.id, uid, {
          html: draft.html,
          text: draft.text,
          attachments: [],
        });
      }
    }
    return result;
  });

  ipcMain.handle('messages/saveDraft', (_event, draft: DraftInput) => {
    const account = store.getAccount(draft.accountId);
    if (!account) return { ok: false, error: '账户不存在' };
    const draftFolder = store.listFolders(account.id).find((folder) => folder.kind === 'draft');
    if (!draftFolder) return { ok: false, error: '草稿箱不存在' };
    const uid = draft.draftId ? Number(draft.draftId.split('/').pop()) : Date.now();
    const id = `${account.id}/${draftFolder.id}/${uid}`;
    store.upsertMessageMetas([
      {
        id,
        accountId: account.id,
        folderId: draftFolder.id,
        uid,
        subject: draft.subject || '(无主题)',
        from: [{ name: account.displayName, address: account.email }],
        to: draft.to ? [{ address: draft.to }] : [],
        cc: [],
        date: Date.now(),
        size: draft.html.length,
        flags: ['\\Draft'],
        hasAttachments: Boolean(draft.attachments?.length),
        snippet: draft.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 180),
      },
    ]);
    store.saveMessageBody(account.id, draftFolder.id, uid, {
      html: draft.html,
      text: draft.text,
      attachments: [],
    });
    return { ok: true, id };
  });

  /* ------------------------------ 同步 ------------------------------ */

  ipcMain.handle('sync/start', async (_event, accountId: string) => {
    const account = store.getAccount(accountId);
    if (!account) return { ok: false, error: '账户不存在' };
    if (account.demo) {
      return { ok: false, error: '演示邮箱为本地示例数据，无需同步。可在「设置 → 账户」中添加真实邮箱。' };
    }
    const settings = store.getSettings().sync;
    try {
      const result = await imapService.syncAccount(
        account,
        { days: account.syncDays || settings.days, limit: settings.limit },
        (progress: SyncProgress) => emit('sync:progress', progress),
      );
      emit('mail:changed', {});
      return { ok: true, ...result };
    } catch (error) {
      emit('sync:progress', {
        accountId,
        phase: 'error',
        current: 0,
        total: 0,
        message: (error as Error).message,
      } satisfies SyncProgress);
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('sync/cancel', (_event, accountId: string) => {
    imapService.cancel(accountId);
    return { ok: true };
  });

  ipcMain.handle('sync/idle', async (_event, accountId: string) => {
    const account = store.getAccount(accountId);
    if (!account || account.demo) return { ok: false, error: '演示账户不支持 IDLE' };
    try {
      await imapService.startIdle(account, (id) => emit('mail:new', { accountId: id }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  /* ------------------------------ 搜索 ------------------------------ */

  ipcMain.handle('search/run', (_event, query: Parameters<typeof runSearch>[0]) => runSearch(query));
  ipcMain.handle('search/ai', async (_event, text: string) => {
    const interpretation = await interpretSearch(text);
    const items = runSearch(interpretation.query);
    return { ...interpretation, items };
  });

  /* ------------------------------ AI ------------------------------ */

  // 模型账户余额（状态栏展示）
  ipcMain.handle('ai/balance', (_event, force?: boolean) => fetchBalance(Boolean(force)));
  ipcMain.handle('ai/testBalance', () => testBalance());

  ipcMain.handle('ai/test', async (_event, config: Partial<AISettings> & { apiKey?: string }) => {
    try {
      const result = await testAIConnection(config);
      return { ...result };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/summarize', async (_event, messageId: string) => {
    try {
      return { ok: true, markdown: await summarizeMessage(messageId) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/thread', async (_event, threadId: string) => {
    try {
      return { ok: true, ...(await summarizeThread(threadId)) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/analyze', async (_event, params: RangeAnalysisParams) => {
    try {
      const result = await analyzeRange(params, {
        onProgress: (message) => emit('ai:progress', { message }),
      });
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/replies', async (_event, messageId: string) => {
    try {
      return { ok: true, suggestions: await suggestReplies(messageId) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/compose', async (_event, params: ComposeAssistParams) => {
    try {
      return { ok: true, text: await composeAssist(params) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/translate', async (_event, payload: { messageId: string; target: '中文' | 'English' }) => {
    try {
      const result = await translateMessage(payload.messageId, payload.target);
      return { ok: true, text: result.body, subject: result.subject, engine: result.engine };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/triage', async (_event, messageId: string) => {
    try {
      return { ok: true, result: await triageMessage(messageId) };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai/todos', async (_event, messageId: string) => {
    try {
      const drafts = await extractTodosFromMessage(messageId);
      const meta = store.getMessageMeta(messageId);
      const items = createTodoItems(drafts, {
        messageId,
        sourceSubject: meta?.subject,
        sourceFrom: meta?.from[0]?.name,
        folderId: meta?.folderId,
      });
      return { ok: true, items, todos: listTodos() };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  /* ------------------------------ 简报 ------------------------------ */

  ipcMain.handle('brief/list', (_event, groupId?: string) => listBriefs(groupId));

  ipcMain.handle('brief/get', (_event, id: string) => getBrief(id));

  ipcMain.handle('brief/generate', async (_event, params: BriefGenerateParams) => {
    try {
      const brief = await generateBrief(params, {
        onProgress: (message) => emit('ai:progress', { message }),
      });
      emit('brief:generated', brief);
      return { ok: true, brief };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('brief/remove', (_event, id: string) => removeBrief(id));

  // 立即生成某一组自动简报
  ipcMain.handle('brief/runSchedule', async (_event, scheduleId: string) => briefScheduler.runNow(scheduleId));

  ipcMain.handle('brief/export', async (_event, payload: { id: string; format: 'md' | 'html' | 'docx' }) => {
    try {
      const result = await exportBrief(payload.id, payload.format);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  /* ------------------------------ 待办 ------------------------------ */

  ipcMain.handle('todos/list', () => ({ items: listTodos(), stats: todoStats() }));
  ipcMain.handle('todos/toggle', (_event, payload: { id: string; done: boolean }) => ({
    items: toggleTodo(payload.id, payload.done),
    stats: todoStats(),
  }));
  ipcMain.handle('todos/update', (_event, payload: { id: string; patch: Record<string, unknown> }) => ({
    items: updateTodo(payload.id, payload.patch),
    stats: todoStats(),
  }));
  ipcMain.handle('todos/remove', (_event, id: string) => ({ items: removeTodo(id), stats: todoStats() }));
  ipcMain.handle('todos/clearCompleted', () => ({ items: clearCompleted(), stats: todoStats() }));

  /* ------------------------------ 设置 ------------------------------ */

  ipcMain.handle('settings/get', () => {
    const settings = store.getSettings();
    return {
      ...settings,
      ai: { ...settings.ai, hasApiKey: Boolean(store.getAIKey()) },
    };
  });

  ipcMain.handle('settings/update', (_event, patch: Partial<AppSettings> & { aiApiKey?: string }) => {
    const { aiApiKey, ...rest } = patch;
    if (typeof aiApiKey === 'string') {
      store.setAIKey(aiApiKey.trim() || undefined);
    }
    const updated = store.updateSettings(rest);
    if (rest.update) applyUpdateFeed();
    if (rest.ai) resetBalanceCache();
    if (rest.brief) {
      // 排程或总开关变化后按最新设置重启调度
      if (rest.brief.autoEnabled ?? updated.brief.autoEnabled) startScheduler();
      else briefScheduler.stop();
    }
    return { ...updated, ai: { ...updated.ai, hasApiKey: Boolean(store.getAIKey()) } };
  });

  /* ------------------------------ 演示数据 ------------------------------ */

  ipcMain.handle('demo/reset', () => {
    const result = seedDemoData(true);
    return { ...result, folders: folderViews() };
  });

  /* ------------------------------ 系统 ------------------------------ */

  /* ------------------------------ 在线更新 ------------------------------ */

  /* ---------------------------- 程序与邮件行为 ---------------------------- */

  ipcMain.handle('app/system', () => {
    const settings = store.getSettings();
    const client = getDefaultMailClientStatus();
    return {
      ...settings.app,
      defaultMailClient: client.enabled,
      canSetDefaultMailClient: client.supported,
      locale: settings.locale,
      mail: settings.mail,
    };
  });

  ipcMain.handle('app/system/set', (_event, patch: Record<string, unknown>) => {
    const settings = store.getSettings();
    const nextApp = { ...settings.app, ...(patch.app as object | undefined) };
    const nextMail = { ...settings.mail, ...(patch.mail as object | undefined) };
    store.updateSettings({
      app: nextApp,
      mail: nextMail,
      ...(patch.locale ? { locale: patch.locale as AppLocale } : {}),
    });
    applyAppBehavior(mainWindow);
    return store.getSettings().app;
  });

  ipcMain.handle('app/defaultMailClient/set', async (_event, enabled: boolean) => setDefaultMailClient(enabled));

  ipcMain.handle('messages/attachmentData', (_event, payload: { messageId: string; filename: string }) => {
    try {
      const file = store.attachmentPath(payload.messageId, payload.filename);
      if (!fs.existsSync(file)) return { ok: false, error: '附件文件不存在（可能未下载或已被清理）' };
      const stat = fs.statSync(file);
      if (stat.size > 20 * 1024 * 1024) return { ok: false, error: '附件超过 20MB，预览已跳过，请直接保存到本地打开' };
      const ext = path.extname(file).toLowerCase();
      const imageExt: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
      };
      if (imageExt[ext]) {
        return {
          ok: true,
          kind: 'image',
          mime: imageExt[ext],
          dataUrl: `data:${imageExt[ext]};base64,${fs.readFileSync(file).toString('base64')}`,
        };
      }
      if (ext === '.pdf') {
        return {
          ok: true,
          kind: 'pdf',
          mime: 'application/pdf',
          dataUrl: `data:application/pdf;base64,${fs.readFileSync(file).toString('base64')}`,
        };
      }
      if (['.txt', '.csv', '.log', '.md', '.json', '.xml', '.htm', '.html'].includes(ext)) {
        return { ok: true, kind: 'text', text: fs.readFileSync(file, 'utf8').slice(0, 200_000) };
      }
      return { ok: true, kind: 'other', size: stat.size };
    } catch (error) {
      return { ok: false, error: (error as Error).message.slice(0, 200) };
    }
  });

  ipcMain.handle('update/state', () => getUpdateState());
  ipcMain.handle('update/check', async () => checkForUpdates());
  ipcMain.handle('update/download', async () => downloadUpdate());
  ipcMain.handle('update/install', () => installUpdate());
  ipcMain.handle('update/openInstaller', () => openDownloadedInstaller());

  // 便携版等无法自动安装时，直接打开发布页手动下载
  ipcMain.handle('update/openRelease', async () => {
    const { shell } = await import('electron');
    await shell.openExternal(RELEASE_URL);
    return true;
  });

  ipcMain.handle('dialog/pickFiles', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择附件',
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  /* ---------------------- 数据存储位置 ---------------------- */

  ipcMain.handle('app/chooseDataDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: '选择数据存储位置',
      buttonLabel: '使用此目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: store.root,
    });
    const target = result.filePaths[0];
    if (result.canceled || !target) return { canceled: true };
    try {
      // 先复制现有数据，再写入新位置；原目录保留，确认无误后可自行删除
      store.flush();
      const migrated = migrateData(store.root, target);
      saveDataDir(target);
      return { canceled: false, dataDir: target, files: migrated.files, bytes: migrated.bytes };
    } catch (error) {
      return { canceled: false, error: (error as Error).message };
    }
  });

  /* ---------------------- 备份与恢复 ---------------------- */

  ipcMain.handle('backup/overview', () => getBackupOverview());

  ipcMain.handle('backup/export', async (_event, options?: { includeSecrets?: boolean }) => {
    const dir = resolveBackupDir();
    fs.mkdirSync(dir, { recursive: true });
    const result = await dialog.showSaveDialog(mainWindow ?? undefined!, {
      title: '导出数据备份',
      defaultPath: path.join(dir, backupFileName()),
      filters: [{ name: '知邮备份包', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      const created = createBackup(result.filePath, options);
      return { canceled: false, ...created };
    } catch (error) {
      return { canceled: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('backup/inspect', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: '选择要导入的备份包',
      properties: ['openFile'],
      filters: [{ name: '知邮备份包', extensions: ['zip'] }],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return { canceled: true };
    return { canceled: false, path: file, inspection: inspectBackup(file) };
  });

  ipcMain.handle('backup/import', async (_event, filePath: string) => {
    try {
      const restored = restoreBackup(filePath);
      return { ok: true, ...restored };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('backup/autoRun', () => maybeAutoBackup());

  ipcMain.handle('backup/remove', (_event, filePath: string) => {
    const dir = resolveBackupDir();
    const target = path.resolve(filePath);
    // 只允许删除备份目录内的文件
    if (!target.startsWith(path.resolve(dir))) return { ok: false, error: '只能删除备份目录内的文件' };
    try {
      fs.rmSync(target, { force: true });
      return { ok: true, ...getBackupOverview() };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('backup/openDir', async () => {
    const dir = resolveBackupDir();
    fs.mkdirSync(dir, { recursive: true });
    const error = await shell.openPath(dir);
    return error ? { ok: false, error } : { ok: true, dir };
  });

  ipcMain.handle('app/resetDataDir', () => {
    saveDataDir(null);
    return { dataDir: defaultDataDir() };
  });

  ipcMain.handle('app/relaunch', () => {
    app.relaunch();
    app.exit(0);
    return true;
  });

  ipcMain.handle('shell/openPath', async (_event, target: string) => {
    if (!fs.existsSync(target)) return { ok: false, error: '文件不存在' };
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true };
  });

  ipcMain.handle('shell/revealFile', (_event, target: string) => {
    if (!fs.existsSync(target)) return { ok: false, error: '文件不存在' };
    shell.showItemInFolder(path.normalize(target));
    return { ok: true };
  });

  ipcMain.handle('shell/openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: '仅支持打开 http/https 链接' };
    await shell.openExternal(url);
    return { ok: true };
  });
}

export function startScheduler(): void {
  briefScheduler.start({
    onGenerated: (brief) => {
      emit('brief:generated', brief);
      emit('mail:changed', {});
    },
    onError: (message) => emit('brief:error', { message }),
  });
}
