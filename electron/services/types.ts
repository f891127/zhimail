/**
 * 知邮 ZhiMail —— 主进程共享数据类型
 * 主进程与渲染进程通过 preload 暴露的 IPC 契约交换这些结构。
 */

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
  | 'brief'
  /** 跨账户的虚拟视图（常用文件夹） */
  | 'virtual';

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
}

export interface Account {
  id: string;
  /** 显示名，例如「工作邮箱」 */
  name: string;
  /** 邮箱地址 */
  email: string;
  /** 发信时显示的发件人名称 */
  displayName: string;
  imap: ImapConfig;
  smtp: SmtpConfig;
  /** 同步最近多少天的邮件 */
  syncDays: number;
  /** 是否内置演示账户 */
  demo?: boolean;
  color?: string;
  createdAt: number;
  lastSyncAt?: number;
}

export interface AccountSecret {
  imapPassword?: string;
  smtpPassword?: string;
}

export interface AccountInput extends Omit<Account, 'createdAt' | 'lastSyncAt' | 'id'> {
  id?: string;
  imapPassword?: string;
  smtpPassword?: string;
}

export interface Folder {
  id: string;
  accountId: string;
  name: string;
  kind: FolderKind;
  /** 父文件夹 id，用于「邮件简报」下的分组 */
  parentId?: string;
  /** IMAP 服务器上的文件夹路径；本地文件夹为空 */
  remotePath?: string;
  /** 特殊用途标记（如 \Inbox），用于匹配服务器文件夹 */
  specialUse?: string;
  /** 是否允许删除/重命名 */
  deletable: boolean;
  /** 排序权重 */
  order: number;
  /** 演示或本地文件夹 */
  local?: boolean;
}

export interface FolderView extends Folder {
  unread: number;
  total: number;
}

export interface MessageMeta {
  /** 全局唯一：accountId/folderId/uid */
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
  /** AI 生成的标签建议（用户确认后写入） */
  labels?: string[];
  importance?: 'high' | 'normal' | 'low';
}

export interface AttachmentMeta {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  /** 附件在本地磁盘的绝对路径；未下载时为空 */
  localPath?: string;
  contentId?: string;
}

export interface MessageBody {
  text?: string;
  html?: string;
  attachments: AttachmentMeta[];
  /** 解析后的原始头，供高级功能使用 */
  rawHeaders?: Record<string, string>;
}

export interface MessageFull extends MessageMeta {
  body: MessageBody;
}

export interface MessageQuery {
  accountId?: string;
  folderId?: string;
  threadId?: string;
  /** 关键词，匹配主题、发件人、摘要 */
  keyword?: string;
  from?: string;
  /** 毫秒时间戳区间 */
  since?: number;
  until?: number;
  unreadOnly?: boolean;
  flaggedOnly?: boolean;
  hasAttachment?: boolean;
  /** 只返回带标签的邮件 */
  hasLabel?: boolean;
  /** 按 AI 重要度过滤 */
  importance?: 'high' | 'normal' | 'low';
  /** 排除指定类型的文件夹（如垃圾箱、已删除） */
  excludeKinds?: string[];
  /** 只返回这些邮件 id */
  messageIds?: string[];
  offset?: number;
  limit?: number;
  sortBy?: 'date' | 'from' | 'subject' | 'size';
  sortDir?: 'asc' | 'desc';
}

export interface MessageListResult {
  total: number;
  items: MessageMeta[];
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

export interface DraftInput {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
  inReplyTo?: string;
  references?: string[];
  draftId?: string;
  attachments?: string[];
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/* ------------------------------- AI 相关 ------------------------------- */

export interface AISettings {
  /** 预设 id，见 ai/presets.ts */
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  /** 隐私开关：只发送主题与元数据，不发送正文 */
  metadataOnly: boolean;
  /** 是否已保存 API Key（不回传明文） */
  hasApiKey?: boolean;
}

export interface AIConfigInput extends Partial<AISettings> {
  apiKey?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResult<T = string> {
  ok: boolean;
  data?: T;
  error?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface RangeAnalysisParams {
  rangeStart: number;
  rangeEnd: number;
  /** 分析范围：当前文件夹 / 全部收件箱 / 自定义筛选 */
  scope: 'folder' | 'inbox' | 'all' | 'filtered' | 'account';
  folderId?: string;
  /** scope=account 时限定某个邮箱账户 */
  accountId?: string;
  from?: string;
  keyword?: string;
  /** 是否顺带生成简报 */
  makeBrief?: boolean;
  briefKind?: BriefKind;
}

export interface AnalysisStats {
  total: number;
  unread: number;
  withAttachment: number;
  senders: { name: string; count: number }[];
  busiestDay: { day: string; count: number };
}

export interface RangeAnalysis {
  markdown: string;
  stats: AnalysisStats;
  messageIds: string[];
  todos: TodoDraft[];
  batches: number;
  model: string;
  provider: string;
}

export interface TodoDraft {
  title: string;
  detail?: string;
  due?: string | null;
  priority?: 'high' | 'medium' | 'low';
  sourceMessageId?: string;
  sourceSubject?: string;
  sourceFrom?: string;
}

export interface TodoItem extends TodoDraft {
  id: string;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
  createdAt: number;
  doneAt?: number;
  briefId?: string;
  sourceSubject?: string;
  sourceFrom?: string;
  sourceFolderId?: string;
}

/* ------------------------------- 简报 ------------------------------- */

export type BriefKind = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface Brief {
  id: string;
  title: string;
  kind: BriefKind;
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
  /** 归属的「邮件简报」分组 id：daily / weekly / monthly / custom */
  group: string;
}

export interface BriefGenerateParams extends RangeAnalysisParams {
  title?: string;
  auto?: boolean;
}

/* ------------------------------- 设置 ------------------------------- */

/** 一组自动简报设置，可同时配置日报、周报、月报、年报与自定义周期 */
export interface BriefSchedule {
  id: string;
  /** 显示名，可自定义，如「客户项目周报」 */
  name: string;
  enabled: boolean;
  frequency: BriefKind;
  /** HH:mm */
  time: string;
  /** 1=周一 … 7=周日，weekly 使用 */
  weekday: number;
  /** monthly / yearly 使用 */
  dayOfMonth: number;
  /** yearly 使用：1-12 */
  month: number;
  /** custom 使用：每 N 天 */
  days: number;
  scope: 'inbox' | 'all';
  /** custom 周期锚点时间戳（首次创建时记录），0 表示按当年 1 月 1 日起算 */
  anchorAt: number;
  /** 各周期上次执行时间戳 */
  lastRun: Record<string, number>;
}

export interface BriefScheduleSettings {
  /** 自动简报总开关 */
  autoEnabled: boolean;
  /** 多组简报设置 */
  schedules: BriefSchedule[];
  /* 以下为旧版单组字段，仅用于迁移 */
  frequency?: 'daily' | 'weekly' | 'monthly';
  time?: string;
  weekday?: number;
  dayOfMonth?: number;
  scope?: 'inbox' | 'all';
  lastRun?: Record<string, number>;
}

export interface UISettings {
  readingPane: boolean;
  listDensity: 'compact' | 'cozy';
  showSnippet: boolean;
  pageSize: number;
  /** 阅读窗格操作条显示的操作 id 列表，顺序即展示顺序 */
  readerActions: string[];
  /** 阅读窗格操作条最多显示项数 */
  readerActionLimit: number;
  /** 皮肤 id：default / gmail / outlook / foxmail / filo / notion / neat */
  skin: string;
}

/** 备份设置 */
export interface BackupSettings {
  /** 启动时自动备份（每天首次启动执行一次） */
  autoEnabled: boolean;
  /** 备份目录；留空表示使用默认目录（数据目录同级的 zhimail-backups） */
  directory: string;
  /** 保留最近多少份自动备份 */
  keep: number;
  /** 备份中是否包含凭据（邮箱密码与 AI Key，仍为加密存储） */
  includeSecrets: boolean;
}

/** 界面语言：跟随系统 / 简体中文 / English / 繁體中文 */
export type AppLocale = 'system' | 'zh-CN' | 'en-US' | 'zh-TW';

export interface AppBehaviorSettings {
  /** 开机自动启动 */
  autoLaunch: boolean;
  /** 最小化时在任务栏显示 */
  showInTaskbar: boolean;
  /** 关闭主窗口时退出程序（否则最小化到托盘） */
  quitOnClose: boolean;
  /** 界面字体大小 */
  fontScale: 'small' | 'standard' | 'large';
  /** 是否已注册为系统默认邮件客户端（仅 Windows 有效） */
  defaultMailClient?: boolean;
}

export interface MailBehaviorSettings {
  /** 定时收取邮件 */
  autoReceive: boolean;
  /** 收取间隔（分钟），最小 1 */
  receiveIntervalMinutes: number;
  /** 新邮件提醒窗口（系统通知） */
  notify: boolean;
  /** 新邮件提醒声音 */
  notifySound: boolean;
  /** 附件预览 */
  attachmentPreview: boolean;
  /** 列表模式：普通 / 会话 / 相关邮件 */
  listMode: 'normal' | 'conversation' | 'related';
  /** 本地删除邮件时，是否同时删除服务器上的副本（false = 服务器保留） */
  deleteOnServer: boolean;
  /** 同步时是否跟随服务器删除（true = 服务器已删除的邮件本地也删除） */
  syncServerDeletes: boolean;
}

export interface AppSettings {
  ai: AISettings;
  brief: BriefScheduleSettings;
  ui: UISettings;
  sync: { days: number; limit: number };
  /** 翻译引擎：auto 优先大模型，builtin 使用内置免费引擎 */
  translate: { engine: 'auto' | 'llm' | 'builtin' };
  /** 备份与恢复 */
  backup: BackupSettings;
  /** 在线更新（GitHub Releases） */
  update: {
    autoCheck: boolean;
    autoDownload: boolean;
    /** 更新源：github 走 GitHub Releases；custom 走自定义地址（可填镜像前缀） */
    source: 'github' | 'custom';
    /** 自定义更新源基础地址，需能访问到 latest.yml 与其列出的安装包 */
    customUrl: string;
  };
  /** 程序行为（参照 Foxmail 系统设置） */
  app: AppBehaviorSettings;
  /** 邮件行为（参照 Foxmail 系统设置） */
  mail: MailBehaviorSettings;
  /** 界面语言 */
  locale: AppLocale;
  /** 是否已完成首次初始化（用于播种演示数据） */
  bootstrapped?: boolean;
}

/* ------------------------------- 搜索 ------------------------------- */

export interface SearchQuery {
  text: string;
  from?: string;
  since?: number;
  until?: number;
  hasAttachment?: boolean;
  folderId?: string;
  unreadOnly?: boolean;
}

export interface SearchInterpretation {
  explanation: string;
  query: SearchQuery;
  usedAI: boolean;
  fallbackReason?: string;
}

/* --------------------------- 写作辅助 / 回复 --------------------------- */

export type ComposeAssistAction =
  | 'continue'
  | 'polish'
  | 'formalize'
  | 'shorten'
  | 'expand'
  | 'bullets'
  | 'translate';

export interface ComposeAssistParams {
  action: ComposeAssistAction;
  text: string;
  subject?: string;
  to?: string;
  targetLanguage?: string;
  tone?: string;
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
