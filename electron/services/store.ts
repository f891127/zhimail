/**
 * 智邮 ZhiYou —— 本地仓储
 *
 * 采用「JSON 索引 + 单封邮件独立文件」的轻量文件型存储，避免原生模块依赖：
 *   <dataDir>/state.json                        账户、文件夹、设置、待办、简报元数据
 *   <dataDir>/messages/<accountId>/<folderId>/<uid>.json   单封邮件正文
 *   <dataDir>/attachments/<messageKey>/<n>_<name>          附件
 *   <dataDir>/briefs/<id>.json                  简报正文
 *   <dataDir>/secrets.json                      safeStorage 加密后的凭据
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  Account,
  AccountSecret,
  AppSettings,
  Brief,
  BriefSchedule,
  Folder,
  MessageBody,
  MessageMeta,
  MessageQuery,
  TodoItem,
} from './types';

const MAX_INDEX_MESSAGES = 40000;

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    temperature: 0.3,
    maxTokens: 3000,
    timeoutMs: 120000,
    metadataOnly: false,
    hasApiKey: false,
  },
  brief: {
    autoEnabled: false,
    schedules: [
      defaultSchedule('daily', '日报', true),
      defaultSchedule('weekly', '周报', true),
      defaultSchedule('monthly', '月报', true),
      defaultSchedule('yearly', '年报', false),
    ],
  },
  ui: {
    readingPane: true,
    listDensity: 'compact',
    showSnippet: true,
    pageSize: 200,
    readerActions: [
      'reply',
      'replyAll',
      'forward',
      'summarize',
      'translateZh',
      'translateEn',
      'triage',
      'threadSummary',
      'replies',
      'todos',
    ],
    readerActionLimit: 7,
    toolbarActions: [
      'collect',
      'reply',
      'replyAll',
      'forward',
      'star',
      'delete',
      'sync',
      'brief',
      'todos',
      'ai',
      'skin',
      'settings',
    ],
    skin: 'default',
  },
  backup: {
    autoEnabled: false,
    directory: '',
    keep: 7,
    includeSecrets: true,
  },
  sync: {
    days: 30,
    limit: 500,
  },
  translate: {
    engine: 'auto',
  },
  update: {
    autoCheck: true,
    autoDownload: false,
    source: 'github',
    customUrl: '',
  },
  app: {
    autoLaunch: false,
    showInTaskbar: true,
    quitOnClose: true,
    fontScale: 'standard',
  },
  mail: {
    autoReceive: true,
    receiveIntervalMinutes: 15,
    notify: true,
    notifySound: false,
    attachmentPreview: true,
    listMode: 'conversation',
    deleteOnServer: true,
    syncServerDeletes: false,
  },
  locale: 'system',
};

/** 默认简报排程：每天/每周/每月/每年各一组，可在设置中增删与改周期 */
function defaultSchedule(
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  name: string,
  enabled: boolean,
): BriefSchedule {
  return {
    id: `schedule-${frequency}`,
    name,
    enabled,
    frequency,
    time: '08:30',
    weekday: 1,
    dayOfMonth: 1,
    month: 1,
    days: frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : frequency === 'monthly' ? 30 : 365,
    scope: 'all',
    anchorAt: 0,
    lastRun: {},
  };
}

/** 兼容旧版单组简报设置：迁移为一组排程 */
function migrateBriefSchedules(raw: AppSettings['brief'] | undefined): BriefSchedule[] {
  if (!raw) return DEFAULT_SETTINGS.brief.schedules;
  if (Array.isArray(raw.schedules) && raw.schedules.length > 0) {
    return raw.schedules.map((schedule) => ({
      ...defaultSchedule('daily', '日报', true),
      ...schedule,
      lastRun: schedule.lastRun ?? {},
    }));
  }
  if (raw.frequency) {
    const base = defaultSchedule(raw.frequency, `${raw.frequency === 'daily' ? '日报' : raw.frequency === 'weekly' ? '周报' : '月报'}`, true);
    return [
      {
        ...base,
        time: raw.time ?? base.time,
        weekday: raw.weekday ?? base.weekday,
        dayOfMonth: raw.dayOfMonth ?? base.dayOfMonth,
        scope: raw.scope ?? base.scope,
        lastRun: raw.lastRun ?? {},
      },
    ];
  }
  return DEFAULT_SETTINGS.brief.schedules;
}

interface PersistState {
  version: number;
  accounts: Account[];
  folders: Folder[];
  messages: MessageMeta[];
  todos: TodoItem[];
  briefs: Brief[];
  settings: AppSettings;
}

interface SecretsFile {
  accounts: Record<string, AccountSecret>;
  aiApiKey?: string;
}

function emptyState(): PersistState {
  return {
    version: 1,
    accounts: [],
    folders: [],
    messages: [],
    todos: [],
    briefs: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  };
}

function safeFolderSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.@-]/g, '_');
}

/** 1.2.1 及更早版本的默认操作条顺序（翻译排在后面，容易被「更多」隐藏） */
const LEGACY_READER_ACTIONS = [
  'reply',
  'replyAll',
  'forward',
  'summarize',
  'threadSummary',
  'replies',
  'triage',
  'translateZh',
  'translateEn',
  'todos',
];

export class Store {
  private dataDir = '';
  private state: PersistState = emptyState();
  private secrets: SecretsFile = { accounts: {} };
  private messageCache = new Map<string, MessageBody>();
  private persistTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  init(dataDir: string): void {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'messages'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'attachments'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'briefs'), { recursive: true });

    const statePath = path.join(this.dataDir, 'state.json');
    if (fs.existsSync(statePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as PersistState;
        this.state = { ...emptyState(), ...parsed };
        this.state.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed.settings,
          ai: { ...DEFAULT_SETTINGS.ai, ...parsed.settings?.ai },
          brief: {
            autoEnabled: parsed.settings?.brief?.autoEnabled ?? DEFAULT_SETTINGS.brief.autoEnabled,
            schedules: migrateBriefSchedules(parsed.settings?.brief),
          },
          ui: { ...DEFAULT_SETTINGS.ui, ...parsed.settings?.ui },
          sync: { ...DEFAULT_SETTINGS.sync, ...parsed.settings?.sync },
          translate: { ...DEFAULT_SETTINGS.translate, ...parsed.settings?.translate },
          backup: { ...DEFAULT_SETTINGS.backup, ...parsed.settings?.backup },
          update: { ...DEFAULT_SETTINGS.update, ...parsed.settings?.update },
        };
        // 旧版默认顺序（用户未自定义过）升级为把翻译前置的新默认，避免翻译被「更多」隐藏
        if (
          JSON.stringify(this.state.settings.ui?.readerActions ?? []) === JSON.stringify(LEGACY_READER_ACTIONS)
        ) {
          this.state.settings.ui = {
            ...this.state.settings.ui,
            readerActions: [...DEFAULT_SETTINGS.ui.readerActions],
          };
        }
      } catch (error) {
        console.error('[store] state.json 解析失败，使用空状态重建', error);
        this.state = emptyState();
      }
    }

    const secretsPath = path.join(this.dataDir, 'secrets.json');
    if (fs.existsSync(secretsPath)) {
      try {
        this.secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as SecretsFile;
        if (!this.secrets.accounts) this.secrets.accounts = {};
      } catch {
        this.secrets = { accounts: {} };
      }
    }
    this.schedulePersist(true);
  }

  /** 数据规模统计：用于备份信息展示 */
  describeCounts(): { accounts: number; messages: number; briefs: number; todos: number } {
    return {
      accounts: this.state.accounts.length,
      messages: this.state.messages.length,
      briefs: this.state.briefs.length,
      todos: this.state.todos.length,
    };
  }

  get root(): string {
    return this.dataDir;
  }

  /* --------------------------- 持久化 --------------------------- */

  private schedulePersist(immediate = false): void {
    this.dirty = true;
    if (immediate) {
      this.flush();
      return;
    }
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush();
    }, 400);
  }

  flush(): void {
    if (!this.dirty || !this.dataDir) return;
    this.dirty = false;
    const statePath = path.join(this.dataDir, 'state.json');
    const tmp = `${statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state), 'utf8');
    fs.renameSync(tmp, statePath);

    const secretsPath = path.join(this.dataDir, 'secrets.json');
    const secretsTmp = `${secretsPath}.tmp`;
    fs.writeFileSync(secretsTmp, JSON.stringify(this.secrets), 'utf8');
    fs.renameSync(secretsTmp, secretsPath);
  }

  /* --------------------------- 设置 --------------------------- */

  getSettings(): AppSettings {
    return this.state.settings;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
      ai: { ...this.state.settings.ai, ...(patch.ai ?? {}) },
      brief: { ...this.state.settings.brief, ...(patch.brief ?? {}) },
      ui: { ...this.state.settings.ui, ...(patch.ui ?? {}) },
      sync: { ...this.state.settings.sync, ...(patch.sync ?? {}) },
    };
    this.schedulePersist(true);
    return this.state.settings;
  }

  /* --------------------------- 账户 --------------------------- */

  listAccounts(): Account[] {
    return this.state.accounts;
  }

  getAccount(id: string): Account | undefined {
    return this.state.accounts.find((a) => a.id === id);
  }

  upsertAccount(account: Account): Account {
    const index = this.state.accounts.findIndex((a) => a.id === account.id);
    if (index >= 0) this.state.accounts[index] = account;
    else this.state.accounts.push(account);
    this.schedulePersist(true);
    return account;
  }

  removeAccount(id: string): void {
    this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
    this.state.folders = this.state.folders.filter((f) => f.accountId !== id);
    this.state.messages = this.state.messages.filter((m) => m.accountId !== id);
    delete this.secrets.accounts[id];
    const accountDir = path.join(this.dataDir, 'messages', safeFolderSegment(id));
    fs.rmSync(accountDir, { recursive: true, force: true });
    this.schedulePersist(true);
  }

  getAccountSecret(id: string): AccountSecret {
    return this.secrets.accounts[id] ?? {};
  }

  setAccountSecret(id: string, secret: AccountSecret): void {
    this.secrets.accounts[id] = { ...this.secrets.accounts[id], ...secret };
    this.schedulePersist(true);
  }

  getAIKey(): string | undefined {
    return this.secrets.aiApiKey;
  }

  setAIKey(key: string | undefined): void {
    if (key) this.secrets.aiApiKey = key;
    else delete this.secrets.aiApiKey;
    this.schedulePersist(true);
  }

  /* --------------------------- 文件夹 --------------------------- */

  listFolders(accountId?: string): Folder[] {
    const folders = accountId
      ? this.state.folders.filter((f) => f.accountId === accountId)
      : this.state.folders;
    return [...folders].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh'));
  }

  getFolder(id: string): Folder | undefined {
    return this.state.folders.find((f) => f.id === id);
  }

  upsertFolder(folder: Folder): Folder {
    const index = this.state.folders.findIndex((f) => f.id === folder.id);
    if (index >= 0) this.state.folders[index] = { ...this.state.folders[index], ...folder };
    else this.state.folders.push(folder);
    this.schedulePersist();
    return folder;
  }

  removeFolder(id: string): void {
    this.state.folders = this.state.folders.filter((f) => f.id !== id);
    this.state.messages = this.state.messages.filter((m) => m.folderId !== id);
    this.schedulePersist(true);
  }
  /** 删除文件夹及其本地邮件正文目录（用于清理重复的服务器文件夹） */
  removeFolderData(id: string): void {
    const folder = this.getFolder(id);
    this.removeFolder(id);
    if (!folder) return;
    try {
      fs.rmSync(this.messageKeyDir(folder.accountId, id), { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }

  /* --------------------------- 邮件索引 --------------------------- */

  private messageKeyDir(accountId: string, folderId: string): string {
    return path.join(
      this.dataDir,
      'messages',
      safeFolderSegment(accountId),
      safeFolderSegment(folderId),
    );
  }

  upsertMessageMetas(metas: MessageMeta[]): void {
    if (!metas.length) return;
    const byId = new Map(this.state.messages.map((m) => [m.id, m]));
    for (const meta of metas) {
      const existing = byId.get(meta.id);
      byId.set(meta.id, existing ? { ...existing, ...meta } : meta);
    }
    let all = [...byId.values()];
    if (all.length > MAX_INDEX_MESSAGES) {
      all.sort((a, b) => b.date - a.date);
      all = all.slice(0, MAX_INDEX_MESSAGES);
    }
    this.state.messages = all;
    this.schedulePersist();
  }

  patchMessage(id: string, patch: Partial<MessageMeta>): MessageMeta | undefined {
    const meta = this.state.messages.find((m) => m.id === id);
    if (!meta) return undefined;
    Object.assign(meta, patch);
    this.schedulePersist();
    return meta;
  }

  getMessageMeta(id: string): MessageMeta | undefined {
    return this.state.messages.find((m) => m.id === id);
  }

  saveMessageBody(accountId: string, folderId: string, uid: number, body: MessageBody): void {
    const key = `${accountId}/${folderId}/${uid}`;
    this.messageCache.set(key, body);
    const dir = this.messageKeyDir(accountId, folderId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${uid}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body), 'utf8');
    fs.renameSync(tmp, file);
  }

  getMessageBody(accountId: string, folderId: string, uid: number): MessageBody | undefined {
    const key = `${accountId}/${folderId}/${uid}`;
    const cached = this.messageCache.get(key);
    if (cached) return cached;
    const file = path.join(this.messageKeyDir(accountId, folderId), `${uid}.json`);
    if (!fs.existsSync(file)) return undefined;
    try {
      const body = JSON.parse(fs.readFileSync(file, 'utf8')) as MessageBody;
      this.messageCache.set(key, body);
      return body;
    } catch {
      return undefined;
    }
  }

  deleteMessages(ids: string[]): void {
    const idSet = new Set(ids);
    const removed = this.state.messages.filter((m) => idSet.has(m.id));
    for (const meta of removed) {
      const file = path.join(this.messageKeyDir(meta.accountId, meta.folderId), `${meta.uid}.json`);
      fs.rmSync(file, { force: true });
      this.messageCache.delete(`${meta.accountId}/${meta.folderId}/${meta.uid}`);
    }
    this.state.messages = this.state.messages.filter((m) => !idSet.has(m.id));
    this.schedulePersist();
  }

  moveMessages(ids: string[], targetFolderId: string): void {
    for (const id of ids) {
      const meta = this.state.messages.find((m) => m.id === id);
      if (meta) meta.folderId = targetFolderId;
    }
    this.schedulePersist();
  }

  queryMessages(query: MessageQuery): { total: number; items: MessageMeta[] } {
    const keyword = query.keyword?.trim().toLowerCase();
    const from = query.from?.trim().toLowerCase();
    let items = this.state.messages.filter((m) => {
      if (query.accountId && m.accountId !== query.accountId) return false;
      if (query.folderId && m.folderId !== query.folderId) return false;
      if (query.threadId && m.threadId !== query.threadId) return false;
      if (query.unreadOnly && m.flags.includes('\\Seen')) return false;
      if (query.flaggedOnly && !m.flags.includes('\\Flagged')) return false;
      if (query.hasAttachment && !m.hasAttachments) return false;
      if (query.hasLabel && !(m.labels && m.labels.length > 0)) return false;
      if (query.importance && m.importance !== query.importance) return false;
      if (query.messageIds && !query.messageIds.includes(m.id)) return false;
      if (query.excludeKinds && query.excludeKinds.length > 0) {
        const folder = this.state.folders.find((item) => item.id === m.folderId);
        if (folder && query.excludeKinds.includes(folder.kind)) return false;
      }
      if (query.since && m.date < query.since) return false;
      if (query.until && m.date > query.until) return false;
      if (from) {
        const hit = m.from.some(
          (a) =>
            a.address.toLowerCase().includes(from) ||
            (a.name ?? '').toLowerCase().includes(from),
        );
        if (!hit) return false;
      }
      if (keyword) {
        const haystack = [
          m.subject,
          m.snippet,
          ...m.from.map((a) => `${a.name ?? ''} ${a.address}`),
          ...m.to.map((a) => `${a.name ?? ''} ${a.address}`),
          ...(m.labels ?? []),
        ]
          .join('\n')
          .toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });

    const dir = query.sortDir === 'asc' ? 1 : -1;
    const sortBy = query.sortBy ?? 'date';
    items = items.sort((a, b) => {
      switch (sortBy) {
        case 'from':
          return dir * (a.from[0]?.address ?? '').localeCompare(b.from[0]?.address ?? '');
        case 'subject':
          return dir * a.subject.localeCompare(b.subject, 'zh');
        case 'size':
          return dir * (a.size - b.size);
        default:
          return dir * (a.date - b.date);
      }
    });

    const total = items.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? this.state.settings.ui.pageSize;
    return { total, items: items.slice(offset, offset + limit) };
  }

  /** 返回范围内全部邮件元数据，供 AI 汇总使用 */
  listMessagesInRange(
    since: number,
    until: number,
    options: { folderId?: string; from?: string; keyword?: string; accountId?: string } = {},
  ): MessageMeta[] {
    return this.queryMessages({
      since,
      until,
      folderId: options.folderId,
      accountId: options.accountId,
      from: options.from,
      keyword: options.keyword,
      limit: 100000,
    }).items;
  }

  countUnread(folderId: string): number {
    return this.state.messages.filter((m) => m.folderId === folderId && !m.flags.includes('\\Seen'))
      .length;
  }

  countFolder(folderId: string): number {
    return this.state.messages.filter((m) => m.folderId === folderId).length;
  }

  allMessages(): MessageMeta[] {
    return this.state.messages;
  }

  /* --------------------------- 待办 --------------------------- */

  listTodos(): TodoItem[] {
    return [...this.state.todos].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const rank = { high: 0, medium: 1, low: 2 };
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      return (a.due ? Date.parse(a.due) : Number.MAX_SAFE_INTEGER) -
        (b.due ? Date.parse(b.due) : Number.MAX_SAFE_INTEGER);
    });
  }

  upsertTodos(items: TodoItem[]): TodoItem[] {
    const byId = new Map(this.state.todos.map((t) => [t.id, t]));
    for (const item of items) byId.set(item.id, { ...byId.get(item.id), ...item });
    this.state.todos = [...byId.values()];
    this.schedulePersist(true);
    return this.listTodos();
  }

  removeTodo(id: string): void {
    this.state.todos = this.state.todos.filter((t) => t.id !== id);
    this.schedulePersist(true);
  }

  /* --------------------------- 简报 --------------------------- */

  listBriefs(): Brief[] {
    return [...this.state.briefs].sort((a, b) => b.createdAt - a.createdAt);
  }

  getBrief(id: string): Brief | undefined {
    return this.state.briefs.find((b) => b.id === id);
  }

  saveBrief(brief: Brief): Brief {
    const index = this.state.briefs.findIndex((b) => b.id === brief.id);
    if (index >= 0) this.state.briefs[index] = brief;
    else this.state.briefs.push(brief);
    const file = path.join(this.dataDir, 'briefs', `${brief.id}.json`);
    fs.writeFileSync(file, JSON.stringify(brief), 'utf8');
    this.schedulePersist();
    return brief;
  }

  removeBrief(id: string): void {
    this.state.briefs = this.state.briefs.filter((b) => b.id !== id);
    fs.rmSync(path.join(this.dataDir, 'briefs', `${id}.json`), { force: true });
    this.schedulePersist(true);
  }

  /* --------------------------- 附件 --------------------------- */

  attachmentPath(messageId: string, filename: string): string {
    const dir = path.join(this.dataDir, 'attachments', safeFolderSegment(messageId));
    fs.mkdirSync(dir, { recursive: true });
    const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
    return path.join(dir, safeName);
  }

  /* --------------------------- 检索 --------------------------- */

  searchFullText(keyword: string, limit = 100): MessageMeta[] {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return [];
    const hits: MessageMeta[] = [];
    for (const meta of this.state.messages) {
      const haystack = [meta.subject, meta.snippet, meta.from.map((a) => a.name ?? a.address).join(' ')]
        .join('\n')
        .toLowerCase();
      if (haystack.includes(needle)) hits.push(meta);
      if (hits.length >= limit) break;
    }
    return hits.sort((a, b) => b.date - a.date);
  }
}

export const store = new Store();
