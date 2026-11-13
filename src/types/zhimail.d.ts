/** 与 preload 暴露的 API 对应的渲染进程类型声明 */

export interface MailAddress {
  name?: string;
  address: string;
}

export type FolderKind =
  | 'inbox'
  | 'sent'
  | 'draft'
  | 'trash'
  | 'junk'
  | 'archive'
  | 'custom'
  | 'brief';

export interface Folder {
  id: string;
  accountId: string;
  name: string;
  kind: FolderKind;
  parentId?: string;
  remotePath?: string;
  specialUse?: string;
  deletable: boolean;
  order: number;
  local?: boolean;
  unread: number;
  total: number;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  displayName: string;
  imap: { host: string; port: number; secure: boolean; user: string };
  smtp: { host: string; port: number; secure: boolean; user: string };
  syncDays: number;
  demo?: boolean;
  color?: string;
  createdAt: number;
  lastSyncAt?: number;
  hasImapPassword: boolean;
  hasSmtpPassword: boolean;
}

export interface AccountInput {
  id?: string;
  name: string;
  email: string;
  displayName?: string;
  imap: { host: string; port: number; secure: boolean; user: string };
  smtp: { host: string; port: number; secure: boolean; user: string };
  syncDays?: number;
  imapPassword?: string;
  smtpPassword?: string;
}

export interface MessageMeta {
  id: string;
  accountId: string;
  folderId: string;
  uid: number;
  messageId?: string;
  threadId?: string;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  date: number;
  size: number;
  flags: string[];
  hasAttachments: boolean;
  snippet: string;
  inReplyTo?: string;
  references?: string[];
  labels?: string[];
  importance?: 'high' | 'normal' | 'low';
}

export interface AttachmentMeta {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  localPath?: string;
  contentId?: string;
}

export interface MessageFull extends MessageMeta {
  body: { text?: string; html?: string; attachments: AttachmentMeta[] };
}

export interface MessageQuery {
  accountId?: string;
  folderId?: string;
  threadId?: string;
  keyword?: string;
  from?: string;
  since?: number;
  until?: number;
  unreadOnly?: boolean;
  flaggedOnly?: boolean;
  hasAttachment?: boolean;
  offset?: number;
  limit?: number;
  sortBy?: 'date' | 'from' | 'subject' | 'size';
  sortDir?: 'asc' | 'desc';
}

export interface ThreadSummary {
  threadId: string;
  subject: string;
  messages: MessageMeta[];
  participants: MailAddress[];
  latestDate: number;
  count: number;
  unread: number;
  hasAttachments: boolean;
}

export interface SyncProgress {
  accountId: string;
  folderId?: string;
  folderName?: string;
  phase: 'idle' | 'connecting' | 'listing' | 'fetching' | 'done' | 'error' | 'cancelled';
  current: number;
  total: number;
  message?: string;
}

export interface AISettings {
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  metadataOnly: boolean;
  hasApiKey?: boolean;
}

export type BriefKind = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

/** 一组自动简报设置 */
export interface BriefSchedule {
  id: string;
  name: string;
  enabled: boolean;
  frequency: BriefKind;
  /** HH:mm */
  time: string;
  weekday: number;
  dayOfMonth: number;
  /** yearly 使用：1-12 */
  month: number;
  /** custom 使用：每 N 天 */
  days: number;
  scope: 'inbox' | 'all';
  anchorAt: number;
  lastRun: Record<string, number>;
}

export interface BriefScheduleSettings {
  /** 总开关 */
  autoEnabled: boolean;
  schedules: BriefSchedule[];
}

export interface AppSettings {
  ai: AISettings;
  brief: BriefScheduleSettings;
  ui: {
    readingPane: boolean;
    listDensity: 'compact' | 'cozy';
    showSnippet: boolean;
    pageSize: number;
    /** 阅读窗格操作条显示的操作 id 列表 */
    readerActions: string[];
  };
  backup: {
    autoEnabled: boolean;
    directory: string;
    keep: number;
    includeSecrets: boolean;
  };
  sync: { days: number; limit: number };
  translate: { engine: 'auto' | 'llm' | 'builtin' };
  update: {
    autoCheck: boolean;
    autoDownload: boolean;
    /** 更新源：github 使用 GitHub Releases，custom 使用自定义地址（可填镜像前缀） */
    source: 'github' | 'custom';
    customUrl: string;
  };
}

export interface BalanceInfo {
  ok: boolean;
  supported: boolean;
  provider: string;
  label?: string;
  currency?: string;
  total?: number;
  used?: number;
  granted?: number;
  toppedUp?: number;
  error?: string;
  fetchedAt: number;
}

export interface UpdateState {
  phase: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  currentVersion: string;
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  percent?: number;
  bytesPerSecond?: number;
  error?: string;
  canCheck: boolean;
}

export interface AnalysisStats {
  total: number;
  unread: number;
  withAttachment: number;
  senders: { name: string; count: number }[];
  busiestDay: { day: string; count: number };
}

export interface TodoItem {
  id: string;
  title: string;
  detail?: string;
  due?: string | null;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
  createdAt: number;
  doneAt?: number;
  briefId?: string;
  sourceMessageId?: string;
  sourceSubject?: string;
  sourceFrom?: string;
  sourceFolderId?: string;
}

export interface Brief {
  id: string;
  title: string;
  kind: 'daily' | 'weekly' | 'monthly' | 'custom';
  rangeStart: number;
  rangeEnd: number;
  createdAt: number;
  provider: string;
  model: string;
  scopeLabel: string;
  messageCount: number;
  todoCount: number;
  markdown: string;
  stats: AnalysisStats;
  messageIds: string[];
  auto: boolean;
  group: string;
}

export interface RangeAnalysisParams {
  rangeStart: number;
  rangeEnd: number;
  scope: 'folder' | 'inbox' | 'all' | 'filtered';
  folderId?: string;
  from?: string;
  keyword?: string;
  makeBrief?: boolean;
  briefKind?: 'daily' | 'weekly' | 'monthly' | 'custom';
}

export interface RangeAnalysis {
  markdown: string;
  stats: AnalysisStats;
  messageIds: string[];
  todos: { title: string; detail?: string; due?: string | null; priority?: string }[];
  batches: number;
  model: string;
  provider: string;
}

export interface ReplySuggestion {
  tone: 'formal' | 'concise' | 'friendly';
  label: string;
  body: string;
}

export interface TriageResult {
  importance: 'high' | 'normal' | 'low';
  urgency: 'high' | 'normal' | 'low';
  reason: string;
  labels: string[];
}

export interface BackupEntry {
  name: string;
  path: string;
  size: number;
  time: number;
}

export interface BackupOverview {
  dataDir: string;
  backupDir: string;
  backups: BackupEntry[];
  counts: { accounts: number; messages: number; briefs: number; todos: number };
}

export interface BackupInspection {
  entries: number;
  bytes: number;
  valid: boolean;
  error?: string;
  manifest?: {
    app: string;
    version: string;
    exportedAt: string;
    dataDir: string;
    includeSecrets: boolean;
    counts: { accounts: number; messages: number; briefs: number; todos: number };
  };
}

export interface AppInfo {
  version: string;
  platform: string;
  dataDir: string;
  /** 数据目录是否为用户自定义位置 */
  dataDirCustom?: boolean;
  /** 默认数据目录，用于恢复默认时展示 */
  defaultDataDir?: string;
  strongEncryption: boolean;
  mailPresets: {
    id: string;
    label: string;
    hint: string;
    imap: { host: string; port: number; secure: boolean };
    smtp: { host: string; port: number; secure: boolean };
    domains: string[];
  }[];
  aiProviders: {
    id: string;
    label: string;
    baseUrl: string;
    defaultModel: string;
    models: string[];
    requiresKey: boolean;
    note?: string;
  }[];
}

export interface ComposeAssistParams {
  action: 'continue' | 'polish' | 'formalize' | 'shorten' | 'expand' | 'bullets' | 'translate';
  text: string;
  subject?: string;
  to?: string;
  targetLanguage?: string;
  tone?: string;
}

export interface ZhimailApi {
  app: {
    info: () => Promise<AppInfo>;
    chooseDataDir: () => Promise<{
      canceled: boolean;
      dataDir?: string;
      files?: number;
      bytes?: number;
      error?: string;
    }>;
    resetDataDir: () => Promise<{ dataDir: string }>;
    relaunch: () => Promise<boolean>;
  };
  accounts: {
    list: () => Promise<Account[]>;
    save: (input: AccountInput) => Promise<Account[]>;
    remove: (id: string) => Promise<Account[]>;
    test: (input: AccountInput) => Promise<{
      imap: { ok: boolean; message: string };
      smtp: { ok: boolean; message: string };
    }>;
  };
  folders: {
    list: () => Promise<Folder[]>;
    create: (payload: { accountId: string; name: string }) => Promise<Folder[]>;
    remove: (id: string) => Promise<Folder[]>;
  };
  messages: {
    list: (query: MessageQuery) => Promise<{ total: number; items: MessageMeta[] }>;
    get: (id: string) => Promise<MessageFull | undefined>;
    thread: (threadId: string) => Promise<MessageMeta[]>;
    threads: (query: MessageQuery) => Promise<{ total: number; items: ThreadSummary[] }>;
    setFlags: (payload: { ids: string[]; flag: string; value: boolean }) => Promise<Folder[]>;
    move: (payload: { ids: string[]; folderId: string }) => Promise<Folder[]>;
    remove: (ids: string[]) => Promise<Folder[]>;
    send: (draft: unknown) => Promise<{ ok: boolean; messageId?: string; error?: string }>;
    saveDraft: (draft: unknown) => Promise<{ ok: boolean; id?: string; error?: string }>;
  };
  sync: {
    start: (accountId: string) => Promise<{ ok: boolean; fetched?: number; errors?: string[]; error?: string }>;
    cancel: (accountId: string) => Promise<{ ok: boolean }>;
    idle: (accountId: string) => Promise<{ ok: boolean; error?: string }>;
  };
  search: {
    run: (query: MessageQuery & { text?: string }) => Promise<MessageMeta[]>;
    ai: (text: string) => Promise<{
      explanation: string;
      usedAI: boolean;
      fallbackReason?: string;
      query: MessageQuery;
      items: MessageMeta[];
    }>;
  };
  ai: {
    test: (config: unknown) => Promise<{ ok: boolean; reply?: string; model?: string; error?: string }>;
    balance: (force?: boolean) => Promise<BalanceInfo>;
    summarize: (messageId: string) => Promise<{ ok: boolean; markdown?: string; error?: string }>;
    summarizeThread: (threadId: string) => Promise<{ ok: boolean; markdown?: string; count?: number; error?: string }>;
    analyze: (params: RangeAnalysisParams) => Promise<{ ok: boolean; result?: RangeAnalysis; error?: string }>;
    replies: (messageId: string) => Promise<{ ok: boolean; suggestions?: ReplySuggestion[]; error?: string }>;
    compose: (params: ComposeAssistParams) => Promise<{ ok: boolean; text?: string; error?: string }>;
    triage: (messageId: string) => Promise<{ ok: boolean; result?: TriageResult; error?: string }>;
    translate: (payload: { messageId: string; target: '中文' | 'English' }) => Promise<{
      ok: boolean;
      text?: string;
      subject?: string;
      engine?: 'llm' | 'builtin';
      error?: string;
    }>;
    todos: (messageId: string) => Promise<{ ok: boolean; items?: TodoItem[]; todos?: TodoItem[]; error?: string }>;
  };
  brief: {
    list: (groupId?: string) => Promise<Brief[]>;
    get: (id: string) => Promise<Brief | undefined>;
    generate: (params: unknown) => Promise<{ ok: boolean; brief?: Brief; error?: string }>;
    remove: (id: string) => Promise<Brief[]>;
    runSchedule: (scheduleId: string) => Promise<{
      scheduleId: string;
      scheduleName: string;
      brief?: Brief;
      error?: string;
    }>;
    export: (payload: { id: string; format: 'md' | 'html' | 'docx' }) => Promise<{
      ok: boolean;
      path?: string;
      filename?: string;
      error?: string;
    }>;
  };
  todos: {
    list: () => Promise<{ items: TodoItem[]; stats: TodoStats }>;
    toggle: (payload: { id: string; done: boolean }) => Promise<{ items: TodoItem[]; stats: TodoStats }>;
    update: (payload: { id: string; patch: Record<string, unknown> }) => Promise<{ items: TodoItem[]; stats: TodoStats }>;
    remove: (id: string) => Promise<{ items: TodoItem[]; stats: TodoStats }>;
    clearCompleted: () => Promise<{ items: TodoItem[]; stats: TodoStats }>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (patch: Record<string, unknown>) => Promise<AppSettings>;
  };
  demo: { reset: () => Promise<{ seeded: boolean; folders: Folder[] }> };
  backup: {
    overview: () => Promise<BackupOverview>;
    export: (options?: { includeSecrets?: boolean }) => Promise<{
      canceled: boolean;
      path?: string;
      files?: number;
      bytes?: number;
      error?: string;
    }>;
    inspect: () => Promise<{ canceled: boolean; path?: string; inspection?: BackupInspection }>;
    import: (filePath: string) => Promise<{
      ok: boolean;
      restoredFiles?: number;
      previousDataMovedTo?: string;
      error?: string;
    }>;
    autoRun: () => Promise<{ created: boolean; path?: string; reason?: string; pruned?: number }>;
    remove: (filePath: string) => Promise<{ ok: boolean; error?: string } & Partial<BackupOverview>>;
    openDir: () => Promise<{ ok: boolean; dir?: string; error?: string }>;
  };
  system: {
    openPath: (target: string) => Promise<{ ok: boolean; error?: string }>;
    revealFile: (target: string) => Promise<{ ok: boolean; error?: string }>;
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
    pickFiles: () => Promise<string[]>;
  };
  update: {
    state: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
    install: () => Promise<{ ok: boolean }>;
  };
  on: (channel: string, handler: (payload: unknown) => void) => () => void;
}

export interface TodoStats {
  total: number;
  pending: number;
  done: number;
  overdue: number;
  high: number;
}

declare global {
  interface Window {
    zhimail: ZhimailApi;
    __zhimailDev?: {
      showMail?: () => void;
      showSettings?: (tab?: string) => void;
      maximizeAIPanel?: () => void;
      showAI?: () => void;
      showBriefs?: () => void;
      showTodos?: () => void;
      showSettings?: () => void;
    };
  }
}
