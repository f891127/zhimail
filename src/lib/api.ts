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
    readerActionLimit: 7,
    skin: 'default',
  },
  app: {
    autoLaunch: false,
    showInTaskbar: true,
    quitOnClose: true,
    fontScale: 'standard' as const,
  },
  mail: {
    autoReceive: true,
    receiveIntervalMinutes: 15,
    notify: true,
    notifySound: false,
    attachmentPreview: true,
    listMode: 'conversation' as const,
  },
  locale: 'system' as const,
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

function mockSystemState() {
  return {
    autoLaunch: false,
    showInTaskbar: true,
    quitOnClose: true,
    fontScale: 'standard' as const,
    defaultMailClient: false,
    canSetDefaultMailClient: false,
    locale: 'system' as const,
    mail: {
      autoReceive: true,
      receiveIntervalMinutes: 15,
      notify: true,
      notifySound: false,
      attachmentPreview: true,
      listMode: 'conversation' as const,
    },
  };
}

const mockApi: ZhimailApi = {
  app: {
    info: async () => emptyInfo,
    chooseDataDir: async () => ({ canceled: true }),
    dataSize: async () => ({ dataDir: '浏览器预览模式（无本地数据）', bytes: 0, files: 0 }),
    resetDataDir: async () => ({ dataDir: emptyInfo.dataDir }),
    relaunch: async () => false,
    system: async () => mockSystemState(),
    setSystem: async () => mockSystemState(),
    setDefaultMailClient: async () => ({ ok: false, error: '浏览器预览模式不支持' }),
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
    attachmentData: async () => ({ ok: false, error: '浏览器预览模式不支持' }),
    attachmentOpen: async () => ({ ok: false, error: '浏览器预览模式不支持打开本地附件' }),
    attachmentSave: async () => ({ ok: false, error: '浏览器预览模式不支持保存附件' }),
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
    testBalance: async () => ({
      ok: false,
      provider: 'browser',
      hasKey: false,
      baseUrl: '',
      steps: [],
      message: '浏览器预览模式无法查询余额，请在桌面客户端中使用',
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
    state: async () => ({
      phase: 'unsupported' as const,
      currentVersion: '1.0.0',
      installMode: 'dev' as const,
      canAutoInstall: false,
      releaseUrl: '',
      canCheck: false,
    }),
    check: notAvailable,
    download: notAvailable,
    install: notAvailable,
    openInstaller: async () => ({ ok: false, error: '浏览器预览模式不支持' }),
    openRelease: async () => false,
  },
  on: () => () => undefined,
};

export const isDesktop = typeof window !== 'undefined' && Boolean(window.zhimail);

export const api: ZhimailApi = isDesktop ? window.zhimail : mockApi;
