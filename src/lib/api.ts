/**
 * API 访问层。
 * 桌面环境使用 preload 暴露的 window.zhimail；在纯浏览器中打开时提供空数据降级，
 * 保证界面不会因为缺少 Electron 环境而崩溃。
 */

import type {
  Account,
  AppInfo,
  AppSettings,
  Brief,
  Folder,
  MessageFull,
  MessageMeta,
  ThreadSummary,
  TodoItem,
  TodoStats,
  ZhimailApi,
} from '@/types/zhimail';

const EMPTY_STATS: TodoStats = { total: 0, pending: 0, done: 0, overdue: 0, high: 0 };

const emptySettings: AppSettings = {
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
  brief: { autoEnabled: false, schedules: [] },
  ui: {
    readingPane: true,
    listDensity: 'compact',
    showSnippet: true,
    pageSize: 200,
    readerActions: [],
  },
  backup: { autoEnabled: false, directory: '', keep: 7, includeSecrets: true },
  sync: { days: 30, limit: 500 },
  translate: { engine: 'auto' },
  update: { autoCheck: true, autoDownload: false, source: 'github', customUrl: '' },
};

const emptyInfo: AppInfo = {
  version: '1.0.0',
  platform: 'browser',
  dataDir: '-',
  strongEncryption: false,
  mailPresets: [],
  aiProviders: [],
};

function notAvailable(): never {
  throw new Error('当前不在桌面应用环境中，该操作不可用');
}

const mockApi: ZhimailApi = {
  app: {
    info: async () => emptyInfo,
    chooseDataDir: async () => ({ canceled: true }),
    resetDataDir: async () => ({ dataDir: emptyInfo.dataDir }),
    relaunch: async () => false,
  },
  accounts: {
    list: async () => [] as Account[],
    save: notAvailable,
    remove: notAvailable,
    test: notAvailable,
  },
  folders: {
    list: async () => [] as Folder[],
    create: notAvailable,
    remove: notAvailable,
  },
  messages: {
    list: async () => ({ total: 0, items: [] as MessageMeta[] }),
    get: async () => undefined as MessageFull | undefined,
    thread: async () => [] as MessageMeta[],
    threads: async () => ({ total: 0, items: [] as ThreadSummary[] }),
    setFlags: notAvailable,
    move: notAvailable,
    remove: notAvailable,
    send: notAvailable,
    saveDraft: notAvailable,
  },
  sync: { start: notAvailable, cancel: notAvailable, idle: notAvailable },
  search: { run: async () => [], ai: notAvailable },
  ai: {
    test: notAvailable,
    balance: async () => ({
      ok: false,
      supported: false,
      provider: 'browser',
      error: '浏览器预览模式',
      fetchedAt: Date.now(),
    }),
    summarize: notAvailable,
    summarizeThread: notAvailable,
    analyze: notAvailable,
    replies: notAvailable,
    compose: notAvailable,
    translate: notAvailable,
    triage: notAvailable,
    todos: notAvailable,
  },
  brief: {
    list: async () => [] as Brief[],
    get: async () => undefined,
    generate: notAvailable,
    remove: notAvailable,
    runSchedule: async () => ({ scheduleId: '', scheduleName: '', error: '浏览器预览模式不支持' }),
    export: notAvailable,
  },
  todos: {
    list: async () => ({ items: [] as TodoItem[], stats: EMPTY_STATS }),
    toggle: notAvailable,
    update: notAvailable,
    remove: notAvailable,
    clearCompleted: notAvailable,
  },
  settings: {
    get: async () => emptySettings,
    update: async () => emptySettings,
  },
  backup: {
    overview: async () => ({
      dataDir: emptyInfo.dataDir,
      backupDir: '',
      backups: [],
      counts: { accounts: 0, messages: 0, briefs: 0, todos: 0 },
    }),
    export: async () => ({ canceled: true }),
    inspect: async () => ({ canceled: true }),
    import: async () => ({ ok: false, error: '浏览器预览模式不支持导入备份' }),
    autoRun: async () => ({ created: false, reason: '浏览器预览模式' }),
    remove: async () => ({ ok: false, error: '浏览器预览模式' }),
    openDir: async () => ({ ok: false, error: '浏览器预览模式' }),
  },
  demo: { reset: notAvailable },
  system: {
    openPath: notAvailable,
    revealFile: notAvailable,
    openExternal: notAvailable,
    pickFiles: async () => [],
  },
  update: {
    state: async () => ({ phase: 'unsupported' as const, currentVersion: '1.0.0', canCheck: false }),
    check: notAvailable,
    download: notAvailable,
    install: notAvailable,
  },
  on: () => () => undefined,
};

export const isDesktop = typeof window !== 'undefined' && Boolean(window.zhimail);

export const api: ZhimailApi = isDesktop ? window.zhimail : mockApi;
