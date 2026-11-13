/** 智邮 ZhiYou —— 渲染进程全局状态与业务动作 */

import { create } from 'zustand';
import { resolveLocale, translate, type Locale } from '@/lib/i18n';
import { api } from '@/lib/api';
import { htmlToPlain } from '@/lib/markdown';
import { dateOnly, fullTime } from '@/lib/format';
import { applySkin } from '@/lib/skin';
import type {
  Account,
  AccountInput,
  AnalysisStats,
  AppInfo,
  AppSettings,
  Brief,
  Folder,
  MessageFull,
  MessageMeta,
  MessageQuery,
  RangeAnalysisParams,
  ReplySuggestion,
  SyncProgress,
  ThreadSummary,
  TodoItem,
  TodoStats,
  TriageResult,
  BalanceInfo,
} from '@/types/zhimail';
import type { UpdateState } from '@/types/zhimail';

export type MainView = 'mail' | 'briefs' | 'todos' | 'analysis';
export type AITab = 'analysis' | 'summary' | 'brief' | 'assist' | 'todo';

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'error';
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
}

export interface ComposeState {
  open: boolean;
  mode: 'new' | 'reply' | 'replyAll' | 'forward';
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string[];
  draftId?: string;
  quoteHtml?: string;
  assistOpen: boolean;
  attachments?: string[];
}

export interface AIOutputs {
  message: { id: string; markdown: string } | null;
  thread: { id: string; markdown: string; count: number } | null;
  analysis: { markdown: string; stats: AnalysisStats; messageIds: string[]; batches: number } | null;
  translate: {
    id: string;
    text: string;
    subject: string;
    engine: 'llm' | 'builtin';
    target: '中文' | 'English';
  } | null;
  triage: { id: string; result: TriageResult } | null;
  replies: { id: string; suggestions: ReplySuggestion[] } | null;
}

interface State {
  ready: boolean;
  info: AppInfo | null;
  accounts: Account[];
  folders: Folder[];
  settings: AppSettings | null;
  /** 按设置与系统语言解析出的界面语言 */
  locale: Locale;
  expandedAccounts: Record<string, boolean>;

  view: MainView;
  selectedFolderId: string | null;
  selectedAccountId: string | null;
  messages: MessageMeta[];
  messageTotal: number;
  selectedMessageId: string | null;
  selectedMessage: MessageFull | null;
  loadingMessages: boolean;

  threadMode: boolean;
  threads: ThreadSummary[];
  expandedThreadIds: string[];

  filters: {
    unreadOnly: boolean;
    flaggedOnly: boolean;
    hasAttachment: boolean;
    sortBy: 'date' | 'from' | 'subject' | 'size';
    sortDir: 'asc' | 'desc';
  };
  searchKeyword: string;
  searchActive: boolean;
  searchExplain: string | null;

  aiPanelOpen: boolean;
  aiTab: AITab;
  aiBusy: boolean;
  aiProgress: string | null;
  aiOutputs: AIOutputs;
  translationVisible: boolean;
  updateState: UpdateState | null;

  analysisParams: RangeAnalysisParams;

  briefs: Brief[];
  briefGroup: string;
  selectedBriefId: string | null;

  todos: TodoItem[];
  todoStats: TodoStats;

  syncProgress: SyncProgress | null;
  /** 发信阶段：connecting / sent / failed */
  sendProgress: { stage: string; detail?: string } | null;
  toasts: Toast[];
  settingsOpen: boolean;
  changelogOpen: boolean;
  changelogAuto: boolean;
  changelogHighlight: string | null;
  settingsTab: 'account' | 'ai' | 'ui' | 'brief' | 'data' | 'update' | 'about';
  /** AI 助手面板是否最大化（最大化时其它区域暂时隐藏） */
  aiPanelMaximized: boolean;
  /** 模型账户余额（状态栏展示） */
  balance: BalanceInfo | null;
  balanceLoading: boolean;
  compose: ComposeState;

  /* 动作 */
  init: () => Promise<void>;
  reloadFolders: () => Promise<void>;
  reloadAccounts: () => Promise<void>;
  reloadBriefs: () => Promise<void>;
  reloadTodos: () => Promise<void>;
  selectFolder: (folderId: string) => Promise<void>;
  selectAccount: (accountId: string) => void;
  toggleAccount: (accountId: string) => void;
  loadMessages: () => Promise<void>;
  /** 选中邮件；按住 Shift 选连续区间，按住 Ctrl/⌘ 点选多封 */
  /** 正在重新解码正文 */
  redecoding: boolean;
  /** 正文版本号：每次重新解码 +1，用于强制刷新正文视图 */
  bodyVersion: number;
  /** 重新解码正文：不传 charset 时自动挑最优编码 */
  redecodeMessage: (id: string, charset?: string) => Promise<void>;
  /** 导出邮件原文（.eml） */
  exportSource: (id: string) => Promise<void>;
  /** 用本地 .eml 文件修复正文（服务器重取失败时的兜底） */
  importSource: (id: string) => Promise<void>;
  /** 从待办/简报等入口按邮件 id 直接打开（会自动切到所在账户与文件夹） */
  openMessageById: (id: string) => Promise<boolean>;
  selectMessage: (id: string, modifiers?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => Promise<void>;
  /** 多选中的邮件 id（含当前选中那封） */
  selectedIds: string[];
  /** Shift 连选的起点 */
  selectionAnchor: string | null;
  clearSelection: () => void;
  selectAllVisible: () => void;
  toggleFlag: (ids: string[], flag: string, value: boolean) => Promise<void>;
  deleteMessages: (ids: string[]) => Promise<void>;
  moveMessages: (ids: string[], folderId: string) => Promise<void>;
  setFilters: (patch: Partial<State['filters']>) => void;
  setThreadMode: (value: boolean) => Promise<void>;
  toggleThreadExpanded: (threadId: string) => void;
  search: (keyword: string, useAI?: boolean) => Promise<void>;
  clearSearch: () => Promise<void>;

  syncNow: (accountId?: string) => Promise<void>;
  saveAccount: (input: AccountInput) => Promise<string | undefined>;
  removeAccount: (id: string) => Promise<void>;
  testAccount: (input: AccountInput) => Promise<{ imap: { ok: boolean; message: string }; smtp: { ok: boolean; message: string } }>;
  updateSettings: (patch: Record<string, unknown>) => Promise<void>;
  reloadSettings: () => Promise<void>;
  applySystemSettings: (patch: {
    app?: Partial<AppSettings['app']>;
    mail?: Partial<AppSettings['mail']>;
    locale?: AppSettings['locale'];
  }) => Promise<void>;
  setDefaultMailClient: (enabled: boolean) => Promise<void>;
  playNotifySound: () => void;
  resetDemo: () => Promise<void>;

  setView: (view: MainView) => void;
  setAIPanel: (open: boolean, tab?: AITab) => void;
  setAIOutput: <K extends keyof AIOutputs>(key: K, value: AIOutputs[K]) => void;
  setTranslationVisible: (visible: boolean) => void;
  checkUpdate: () => Promise<void>;
  /** 更新弹窗（帮助 → 检查更新 / 自动发现新版本时弹出） */
  updateDialogOpen: boolean;
  openUpdateDialog: () => void;
  closeUpdateDialog: () => void;
  /** 一键收取全部真实账户 */
  syncAll: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openDownloadedInstaller: () => Promise<void>;

  runSummarize: (messageId?: string) => Promise<void>;
  runThreadSummary: (threadId?: string) => Promise<void>;
  runAnalysis: (params?: Partial<RangeAnalysisParams>) => Promise<void>;
  generateBriefFromAnalysis: (kind: 'daily' | 'weekly' | 'monthly' | 'custom', title?: string) => Promise<void>;
  generateBriefDirect: (params: RangeAnalysisParams, kind: 'daily' | 'weekly' | 'monthly' | 'custom', title?: string) => Promise<void>;
  selectBrief: (id: string | null) => void;
  setBriefGroup: (group: string) => void;
  removeBrief: (id: string) => Promise<void>;
  exportBrief: (id: string, format: 'md' | 'html' | 'docx') => Promise<void>;
  runReplies: (messageId?: string) => Promise<void>;
  runTranslate: (messageId: string, target: '中文' | 'English') => Promise<void>;
  runTriage: (messageId: string) => Promise<void>;
  extractTodosFromMessage: (messageId: string) => Promise<void>;
  composeAssist: (action: string, text: string, extra?: { subject?: string; to?: string; targetLanguage?: string }) => Promise<string | null>;

  toggleTodo: (id: string, done: boolean) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  updateTodo: (id: string, patch: Record<string, unknown>) => Promise<void>;
  clearCompletedTodos: () => Promise<void>;

  openCompose: (options?: Partial<ComposeState>) => void;
  closeCompose: () => void;
  updateCompose: (patch: Partial<ComposeState>) => void;
  sendCompose: () => Promise<void>;
  saveComposeDraft: () => Promise<void>;
  replyToMessage: (mode: 'reply' | 'replyAll' | 'forward') => void;

  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setSyncProgress: (progress: SyncProgress | null) => void;
  openSettings: (tab?: State['settingsTab']) => void;
  toggleAIPanelMaximize: () => void;
  refreshBalance: (force?: boolean) => Promise<void>;
  openChangelog: (options?: { auto?: boolean; version?: string | null }) => void;
  closeChangelog: () => void;
  closeSettings: () => void;
}

/** 余额自动刷新的定时器与焦点监听只注册一次 */
let balanceTimer: number | null = null;
let focusBound = false;

const emptyCompose: ComposeState = {
  open: false,
  mode: 'new',
  accountId: '',
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  html: '',
  assistOpen: false,
};

const emptyOutputs: AIOutputs = {
  message: null,
  thread: null,
  analysis: null,
  translate: null,
  triage: null,
  replies: null,
};

function defaultRange(): RangeAnalysisParams {
  const end = Date.now();
  return {
    rangeStart: end - 7 * 86400000,
    rangeEnd: end,
    scope: 'inbox',
    briefKind: 'weekly',
  };
}

function toastId(): string {
  return `t-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

/** 已经自动尝试过修复的邮件，避免反复请求服务器 */
const autoHealed = new Set<string>();

/** 与主进程一致的乱码判定（轻量版） */
function looksGarbled(text: string): boolean {
  if (!text) return false;
  if (/[\uff61-\uff9f]/.test(text) || text.includes('\ufffd')) return true;
  if (/锟斤拷|烫烫烫|ï¿½/.test(text)) return true;
  const shapes = (text.match(/[\u25A0-\u25FF]/g) ?? []).length;
  return shapes >= 4 && shapes > text.length * 0.02;
}

export const useAppStore = create<State>((set, get) => ({
  ready: false,
  redecoding: false,
  bodyVersion: 0,
  info: null,
  accounts: [],
  folders: [],
  settings: null,
  locale: 'zh-CN' as Locale,
  expandedAccounts: {},

  view: 'mail',
  selectedFolderId: null,
  selectedAccountId: null,
  messages: [],
  messageTotal: 0,
  selectedMessageId: null,
  selectedIds: [],
  selectionAnchor: null,
  selectedMessage: null,
  loadingMessages: false,

  threadMode: false,
  threads: [],
  expandedThreadIds: [],

  filters: { unreadOnly: false, flaggedOnly: false, hasAttachment: false, sortBy: 'date', sortDir: 'desc' },
  searchKeyword: '',
  searchActive: false,
  searchExplain: null,

  aiPanelOpen: false,
  aiTab: 'analysis',
  aiBusy: false,
  aiProgress: null,
  aiOutputs: emptyOutputs,
  translationVisible: false,
  updateState: null,
  updateDialogOpen: false,

  analysisParams: defaultRange(),

  briefs: [],
  briefGroup: '',
  selectedBriefId: null,

  todos: [],
  todoStats: { total: 0, pending: 0, done: 0, overdue: 0, high: 0 },

  syncProgress: null,
  sendProgress: null,
  toasts: [],
  settingsOpen: false,
  changelogOpen: false,
  changelogAuto: false,
  changelogHighlight: null,
  settingsTab: 'account',
  aiPanelMaximized: false,
  balance: null,
  balanceLoading: false,
  compose: emptyCompose,

  /* ------------------------------ 初始化 ------------------------------ */

  init: async () => {
    // 状态栏余额：配置了 API Key 时后台拉取，不阻塞界面
    void get().refreshBalance();
    // 余额自动刷新：每 5 分钟一次；窗口重新获得焦点时也刷新一次（避免长期显示旧数字）
    if (!balanceTimer) {
      balanceTimer = window.setInterval(() => {
        if (get().settings?.ai.hasApiKey) void get().refreshBalance(true);
      }, 5 * 60_000);
    }
    if (!focusBound) {
      focusBound = true;
      window.addEventListener('focus', () => {
        if (get().settings?.ai.hasApiKey) void get().refreshBalance(true);
      });
    }
    const [info, accounts, folders, settings] = await Promise.all([
      api.app.info(),
      api.accounts.list(),
      api.folders.list(),
      api.settings.get(),
    ]);
    const firstAccount = accounts.find((account) => !account.demo) ?? accounts[0];
    const inbox =
      folders.find((folder) => folder.accountId === firstAccount?.id && folder.kind === 'inbox') ??
      folders.find((folder) => folder.kind === 'inbox');

    set({
      info,
      accounts,
      folders,
      settings,
      locale: resolveLocale(settings.locale, navigator.language),
      threadMode: (settings.mail?.listMode ?? 'conversation') === 'conversation',
      ready: true,
      selectedAccountId: firstAccount?.id ?? null,
      selectedFolderId: inbox?.id ?? null,
      expandedAccounts: accounts.reduce<Record<string, boolean>>((acc, account) => {
        acc[account.id] = true;
        return acc;
      }, {}),
    });

    await Promise.all([get().reloadBriefs(), get().reloadTodos()]);
    if (inbox) await get().loadMessages();

    // 事件订阅
    api.on('sync:progress', (payload) => set({ syncProgress: payload as SyncProgress }));
    api.on('send:progress', (payload) => set({ sendProgress: payload as { stage: string; detail?: string } }));
    api.on('ai:progress', (payload) => set({ aiProgress: (payload as { message: string }).message }));
    api.on('brief:generated', (payload) => {
      const brief = payload as Brief;
      void get().reloadBriefs();
      get().pushToast({
        type: 'success',
        title: '简报已生成',
        message: `${brief.title}（${brief.messageCount} 封邮件 / ${brief.todoCount} 条待办）`,
        action: {
          label: '查看',
          run: () => {
            set({ view: 'briefs', selectedBriefId: brief.id, briefGroup: brief.group });
          },
        },
      });
    });
    api.on('brief:error', (payload) => {
      get().pushToast({ type: 'error', title: '自动简报失败', message: (payload as { message: string }).message });
    });
    api.on('mail:new', (payload) => {
      const { accountId } = payload as { accountId: string };
      get().playNotifySound();
      get().pushToast({ type: 'info', title: '收到新邮件', message: '正在同步最新邮件…' });
      void get().syncNow(accountId);
    });
    // 点击系统通知后定位到该邮件
    api.on('mail:open', (payload) => {
      const { id } = payload as { id: string };
      void (async () => {
        await get().reloadFolders();
        await get().loadMessages();
        const target = get().messages.find((message) => message.id === id);
        if (target) await get().selectMessage(id);
      })();
    });
    api.on('mail:changed', () => {
      void get().reloadFolders();
      void get().loadMessages();
    });
    api.on('update:status', (payload) => {
      const state = payload as UpdateState;
      set({
        updateState: state,
        // 发现新版本或下载完成时直接把弹窗推到最前面，不用用户再去菜单里找
        updateDialogOpen: state.phase === 'available' || state.phase === 'downloaded' ? true : get().updateDialogOpen,
      });
    });
    void api.update.state().then((state) => set({ updateState: state }));

    // 截图与调试钩子
    window.__zhimailDev = {
      showMail: () => {
        // 截图时固定回默认皮肤，避免上一次视图切换留下的皮肤影响主界面
        const settings = get().settings;
        if (settings && settings.ui.skin !== 'default') {
          // 先同步切回默认皮肤（本地状态 + DOM 立即生效），再持久化，避免截图抓到上一个皮肤
          const nextUi = { ...settings.ui, skin: 'default' as const };
          set({ settings: { ...settings, ui: nextUi } });
          applySkin('default');
          void get().updateSettings({ ui: nextUi });
        }
        set({ view: 'mail', aiPanelOpen: false });
      },
      showAI: () => {
        set({ view: 'mail', aiPanelOpen: true, aiTab: 'analysis' });
        void (async () => {
          if (!get().messages.length) await get().loadMessages();
          const target = get().selectedMessageId ?? get().messages[0]?.id;
          if (!target) return;
          await get().selectMessage(target);
          if (!get().aiOutputs.message) await get().runSummarize(target);
        })();
      },
      showBriefs: () => {
        set({ view: 'briefs', briefGroup: '', aiPanelOpen: false });
        const first = get().briefs[0];
        if (first) set({ selectedBriefId: first.id });
      },
      showTodos: () => set({ view: 'todos', aiPanelOpen: false }),
      /** 截图用：按主题关键词选中一封邮件 */
      selectBySubject: (keyword: string) => {
        void (async () => {
          if (!get().messages.length) await get().loadMessages();
          const hit = get().messages.find((item) => (item.subject || '').includes(keyword));
          if (!hit) return;
          set({ view: 'mail', aiPanelOpen: false });
          await get().selectMessage(hit.id);
        })();
      },
      /** 截图用：选中前 N 封，验证多选样式 */
      selectMulti: (count = 3) => {
        void (async () => {
          if (!get().messages.length) await get().loadMessages();
          const ids = get().messages.slice(0, count).map((item) => item.id);
          set({
            view: 'mail',
            aiPanelOpen: false,
            selectedIds: ids,
            selectedMessageId: ids[0] ?? null,
            selectionAnchor: ids[0] ?? null,
          });
        })();
      },
      showUpdateDialog: () => {
        set({ updateDialogOpen: true });
        void get().checkUpdate();
      },
      /** 截图用：切到指定皮肤（直接改 <html data-skin>，不写设置） */
      setSkin: (id: string) => {
        void import('@/lib/skin').then((mod) => mod.lockSkin(id));
      },
      showSettings: (tab?: string) =>
        set({ settingsOpen: true, settingsTab: (tab as State['settingsTab']) ?? 'ai' }),
      maximizeAIPanel: () => set({ aiPanelOpen: true, aiPanelMaximized: true }),
      showCommon: (id: string) => void get().selectFolder(id),
      selectSubject: (text: string) => {
        const target = get().messages.find((message) => message.subject.includes(text));
        if (target) void get().selectMessage(target.id);
      },
    };
  },

  reloadFolders: async () => set({ folders: await api.folders.list() }),
  reloadAccounts: async () => set({ accounts: await api.accounts.list() }),
  reloadBriefs: async () => set({ briefs: await api.brief.list() }),
  reloadTodos: async () => {
    const result = await api.todos.list();
    set({ todos: result.items, todoStats: result.stats });
  },

  /* ------------------------------ 文件夹与邮件 ------------------------------ */

  selectFolder: async (folderId: string) => {
    if (folderId.startsWith('briefs')) {
      set({ selectedFolderId: folderId, view: 'briefs', briefGroup: '', selectedBriefId: null });
      await get().reloadBriefs();
      return;
    }
    const folder = get().folders.find((item) => item.id === folderId);
    set({
      selectedFolderId: folderId,
      selectedAccountId: folder?.accountId ?? get().selectedAccountId,
      view: 'mail',
      searchActive: false,
      searchKeyword: '',
      searchExplain: null,
      selectedMessageId: null,
      selectedMessage: null,
    });
    await get().loadMessages();
  },

  selectAccount: (accountId: string) => set({ selectedAccountId: accountId }),

  toggleAccount: (accountId: string) =>
    set((state) => ({
      expandedAccounts: { ...state.expandedAccounts, [accountId]: !state.expandedAccounts[accountId] },
    })),

  loadMessages: async () => {
    const { selectedFolderId, filters, searchKeyword, searchActive, threadMode } = get();
    if (!selectedFolderId || selectedFolderId.startsWith('briefs')) return;
    set({ loadingMessages: true });
    try {
      const query: MessageQuery = {
        folderId: selectedFolderId,
        keyword: searchActive ? searchKeyword : undefined,
        unreadOnly: filters.unreadOnly,
        flaggedOnly: filters.flaggedOnly,
        hasAttachment: filters.hasAttachment,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        limit: 400,
      };
      if (threadMode) {
        const result = await api.messages.threads(query);
        set({ threads: result.items, messageTotal: result.total, messages: result.items.flatMap((t) => t.messages) });
      } else {
        const result = await api.messages.list(query);
        set({ messages: result.items, messageTotal: result.total, threads: [] });
      }
    } finally {
      set({ loadingMessages: false });
    }
  },

  redecodeMessage: async (id, charset) => {
    set({ redecoding: true });
    try {
      const result = await api.messages.redecode({ messageId: id, charset });
      if (!result.ok || !result.body) {
        get().pushToast({ type: 'error', title: '重新解码失败', message: result.error });
        return;
      }
      const body = result.body;
      set((state) => ({
        bodyVersion: state.bodyVersion + 1,
        selectedMessage:
          state.selectedMessage && state.selectedMessage.id === id
            ? { ...state.selectedMessage, body }
            : state.selectedMessage,
        messages: state.messages.map((item) =>
          item.id === id
            ? { ...item, snippet: (body.text ?? item.snippet ?? '').replace(/\s+/g, ' ').slice(0, 120) }
            : item,
        ),
      }));
      if (result.stillBroken) {
        // 原文里已经是 ◆ 之类的替换字符，本地任何解码都还原不了
        get().pushToast({
          type: 'error',
          title: '原文本身已损坏，无法还原',
          message: '服务器上的这封邮件正文已含替换字符（发件方编码转换时丢失），可用「导出原文」核对，或让发件人重发、用网页版查看。',
        });
      } else {
        get().pushToast({ type: 'info', title: `已重新解码（${result.charset ?? '自动'}）` });
      }
    } catch (error) {
      get().pushToast({ type: 'error', title: '重新解码失败', message: (error as Error).message });
    } finally {
      set({ redecoding: false });
    }
  },

  importSource: async (id: string) => {
    try {
      const result = await api.messages.importSource(id);
      if (result.canceled) return;
      if (!result.ok || !result.body) {
        get().pushToast({ type: 'error', title: '用 .eml 修复失败', message: result.error });
        return;
      }
      const body = result.body;
      set((state) => ({
        bodyVersion: state.bodyVersion + 1,
        selectedMessage:
          state.selectedMessage && state.selectedMessage.id === id
            ? { ...state.selectedMessage, body }
            : state.selectedMessage,
        messages: state.messages.map((item) =>
          item.id === id ? { ...item, snippet: (body.text ?? '').replace(/\s+/g, ' ').slice(0, 120) } : item,
        ),
      }));
      get().pushToast({ type: 'info', title: '已用 .eml 修复正文', message: `解码方式：${result.charset ?? '自动'}` });
    } catch (error) {
      get().pushToast({ type: 'error', title: '用 .eml 修复失败', message: (error as Error).message });
    }
  },

  exportSource: async (id: string) => {
    try {
      const result = await api.messages.exportSource(id);
      if (result.canceled) return;
      if (!result.ok) {
        get().pushToast({ type: 'error', title: '导出原文失败', message: result.error });
        return;
      }
      get().pushToast({ type: 'info', title: '已导出邮件原文', message: result.path });
    } catch (error) {
      get().pushToast({ type: 'error', title: '导出原文失败', message: (error as Error).message });
    }
  },

  openMessageById: async (id: string) => {
    const target = await api.messages.get(id);
    if (!target) {
      get().pushToast({
        type: 'error',
        title: '来源邮件已不存在',
        message: '可能已被删除或未同步到本地',
      });
      return false;
    }
    if (get().selectedAccountId !== target.accountId) set({ selectedAccountId: target.accountId });
    if (get().selectedFolderId !== target.folderId) await get().selectFolder(target.folderId);
    set({ view: 'mail', searchKeyword: '', searchActive: false });
    await get().selectMessage(id);
    return true;
  },
  selectMessage: async (id, modifiers) => {
    const cachedTranslation = get().aiOutputs.translate;
    const state = get();
    const conversation = (state.settings?.mail?.listMode ?? 'conversation') === 'conversation';
    const order =
      conversation && state.threads.length
        ? state.threads.map((thread) => thread.messages[thread.messages.length - 1]?.id).filter(Boolean)
        : state.messages.map((item) => item.id);
    const additive = Boolean(modifiers?.ctrlKey || modifiers?.metaKey);
    let ids: string[];
    if (modifiers?.shiftKey && state.selectionAnchor) {
      const from = order.indexOf(state.selectionAnchor);
      const to = order.indexOf(id);
      ids = from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
    } else if (additive) {
      ids = state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id];
    } else {
      ids = [id];
    }
    set({
      selectedMessageId: id,
      selectedIds: ids,
      selectionAnchor: modifiers?.shiftKey ? state.selectionAnchor : id,
      selectedMessage: null,
      translationVisible: Boolean(cachedTranslation && cachedTranslation.id === id),
    });
    const message = await api.messages.get(id);
    set({ selectedMessage: message ?? null });
    // 正文疑似乱码（多为旧版本缓存下来的坏数据）时，自动重新解码一次，每封只尝试一次
    if (message && !autoHealed.has(id)) {
      const raw = message.body.text ?? message.body.html ?? '';
      if (looksGarbled(raw)) {
        autoHealed.add(id);
        void get().redecodeMessage(id);
      }
    }
    if (message && !message.flags.includes('\\Seen')) {
      const folders = await api.messages.setFlags({ ids: [id], flag: '\\Seen', value: true });
      set((state) => ({
        folders,
        messages: state.messages.map((item) =>
          item.id === id ? { ...item, flags: [...new Set([...item.flags, '\\Seen'])] } : item,
        ),
        threads: state.threads.map((thread) => ({
          ...thread,
          messages: thread.messages.map((item) =>
            item.id === id ? { ...item, flags: [...new Set([...item.flags, '\\Seen'])] } : item,
          ),
        })),
      }));
    }
  },

  clearSelection: () => set({ selectedIds: [], selectionAnchor: null, selectedMessageId: null, selectedMessage: null }),
  selectAllVisible: () => {
    const ids = get().messages.map((item) => item.id);
    set({ selectedIds: ids, selectedMessageId: ids[0] ?? null, selectionAnchor: ids[0] ?? null });
  },
  toggleFlag: async (ids, flag, value) => {
    const folders = await api.messages.setFlags({ ids, flag, value });
    set((state) => ({
      folders,
      messages: state.messages.map((item) =>
        ids.includes(item.id)
          ? { ...item, flags: value ? [...new Set([...item.flags, flag])] : item.flags.filter((f) => f !== flag) }
          : item,
      ),
      selectedMessage:
        state.selectedMessage && ids.includes(state.selectedMessage.id)
          ? {
              ...state.selectedMessage,
              flags: value
                ? [...new Set([...state.selectedMessage.flags, flag])]
                : state.selectedMessage.flags.filter((f) => f !== flag),
            }
          : state.selectedMessage,
    }));
  },

  deleteMessages: async (rawIds) => {
    // 会话模式下选中的是「会话行」，删除时展开成整串邮件
    const threads = get().threads;
    const ids = Array.from(
      new Set(
        rawIds.flatMap((id) => {
          const thread = threads.find((item) => item.messages[item.messages.length - 1]?.id === id);
          return thread ? thread.messages.map((message) => message.id) : [id];
        }),
      ),
    );
    // 先乐观更新界面（立刻消失），再等服务器确认，避免点删除后卡住几秒
    set((state) => ({
      messages: state.messages.filter((item) => !ids.includes(item.id)),
      messageTotal: Math.max(0, state.messageTotal - ids.filter((id) => state.messages.some((item) => item.id === id)).length),
      // 会话视图也要同步剔除，否则会话模式下删除后列表不刷新
      threads: state.threads
        .map((thread) => ({
          ...thread,
          messages: thread.messages.filter((item) => !ids.includes(item.id)),
        }))
        .filter((thread) => thread.messages.length > 0),
      selectedMessageId: ids.includes(state.selectedMessageId ?? '') ? null : state.selectedMessageId,
      selectedMessage: ids.includes(state.selectedMessageId ?? '') ? null : state.selectedMessage,
      selectedIds: state.selectedIds.filter((item) => !ids.includes(item)),
    }));
    get().pushToast({ type: 'info', title: `已删除 ${ids.length} 封邮件` });
    try {
      const folders = await api.messages.remove(ids);
      if (Array.isArray(folders)) set({ folders });
    } catch (error) {
      get().pushToast({ type: 'error', title: '删除同步失败', message: (error as Error).message });
      await get().loadMessages();
    }
  },

  moveMessages: async (ids, folderId) => {
    const folders = await api.messages.move({ ids, folderId });
    const target = (folders ?? []).find((folder) => folder.id === folderId);
    set((state) => ({
      folders: Array.isArray(folders) ? folders : state.folders,
      messages: state.messages.filter((item) => !ids.includes(item.id)),
      selectedMessageId: ids.includes(state.selectedMessageId ?? '') ? null : state.selectedMessageId,
      selectedMessage: ids.includes(state.selectedMessageId ?? '') ? null : state.selectedMessage,
      threads: state.threads
        .map((thread) => ({
          ...thread,
          messages: thread.messages.filter((item) => !ids.includes(item.id)),
        }))
        .filter((thread) => thread.messages.length > 0),
      selectedIds: state.selectedIds.filter((item) => !ids.includes(item)),
    }));
    await get().loadMessages();
    get().pushToast({ type: 'info', title: `已移动 ${ids.length} 封邮件到「${target?.name ?? '目标文件夹'}」` });
  },

  setFilters: (patch) => {
    set((state) => ({ filters: { ...state.filters, ...patch } }));
    void get().loadMessages();
  },

  setThreadMode: async (value) => {
    set({ threadMode: value });
    await get().loadMessages();
  },

  toggleThreadExpanded: (threadId) =>
    set((state) => ({
      expandedThreadIds: state.expandedThreadIds.includes(threadId)
        ? state.expandedThreadIds.filter((id) => id !== threadId)
        : [...state.expandedThreadIds, threadId],
    })),

  search: async (keyword, useAI = false) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      await get().clearSearch();
      return;
    }
    set({ searchKeyword: trimmed, searchActive: true, loadingMessages: true });
    try {
      if (useAI) {
        const result = await api.search.ai(trimmed);
        set({
          messages: result.items,
          messageTotal: result.items.length,
          searchExplain: `${result.usedAI ? 'AI 解析' : '本地解析'}：${result.explanation}${
            result.fallbackReason ? `（AI 不可用：${result.fallbackReason}）` : ''
          }`,
          threadMode: false,
        });
      } else {
        const items = await api.search.run({ text: trimmed } as MessageQuery & { text: string });
        set({ messages: items, messageTotal: items.length, searchExplain: `关键词检索：${trimmed}`, threadMode: false });
      }
    } finally {
      set({ loadingMessages: false });
    }
  },

  clearSearch: async () => {
    // 搜索时临时关掉了会话模式，清空搜索后要按设置恢复，否则列表按会话渲染却拿到空数组
    const threadMode = (get().settings?.mail?.listMode ?? 'conversation') === 'conversation';
    set({ searchActive: false, searchKeyword: '', searchExplain: null, threadMode });
    await get().loadMessages();
  },

  /* ------------------------------ 同步与账户 ------------------------------ */

  syncNow: async (accountId) => {
    const target = accountId ?? get().selectedAccountId ?? get().accounts.find((a) => !a.demo)?.id;
    if (!target) {
      get().pushToast({ type: 'error', title: '没有可同步的账户', message: '请先在设置中添加邮箱账户' });
      return;
    }
    const account = get().accounts.find((item) => item.id === target);
    const result = await api.sync.start(target);
    if (!result.ok) {
      get().pushToast({ type: 'error', title: '同步失败', message: result.error ?? '未知错误' });
      return;
    }
    if (result.errors?.length) {
      get().pushToast({
        type: 'error',
        title: '部分文件夹同步失败',
        message: result.errors.slice(0, 2).join('；'),
      });
    }
    await Promise.all([get().reloadFolders(), get().loadMessages()]);
    get().pushToast({
      type: 'success',
      title: `${account?.name ?? '邮箱'}同步完成`,
      message: `更新 ${result.fetched ?? 0} 封邮件`,
    });
  },

  saveAccount: async (input) => {
    const accounts = await api.accounts.save(input);
    set({ accounts });
    await get().reloadFolders();
    get().pushToast({ type: 'success', title: '账户已保存', message: input.email });
    // 返回账户 id，便于调用方新建账户后立即收取一次
    return accounts.find((account) => account.email === input.email)?.id ?? input.id;
  },

  removeAccount: async (id) => {
    const accounts = await api.accounts.remove(id);
    set({ accounts });
    await get().reloadFolders();
    get().pushToast({ type: 'info', title: '账户已移除' });
  },

  testAccount: async (input) => api.accounts.test(input),

  /** 应用程序行为设置（开机自启、任务栏、关闭行为、字体大小、语言等） */
  applySystemSettings: async (patch) => {
    await api.app.setSystem(patch);
    await get().reloadSettings();
    await get().loadMessages();
  },

  setDefaultMailClient: async (enabled) => {
    const result = await api.app.setDefaultMailClient(enabled);
    if (!result.ok) {
      get().pushToast({ type: 'error', title: '注册默认邮件客户端失败', message: result.error ?? '未知错误' });
      return;
    }
    get().pushToast({
      type: 'success',
      title: enabled ? '已注册为默认邮件客户端' : '已取消默认邮件客户端',
      message: enabled ? '系统打开 mailto: 链接时会启动智邮' : '已移除相关注册表项',
    });
    await get().reloadSettings();
  },

  /** 新邮件提醒声音：用 Web Audio 生成短提示音，避免额外音频资源 */
  playNotifySound: () => {
    if (!(get().settings?.mail?.notifySound ?? false)) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(1174, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.32);
      oscillator.onended = () => void context.close();
    } catch {
      /* 忽略音频异常 */
    }
  },

  updateSettings: async (patch) => {
    const settings = await api.settings.update(patch);
    // 改了 AI 配置（Key / 地址 / 服务商）后立刻重新查一次余额
    if ('ai' in patch || 'aiApiKey' in (patch as Record<string, unknown>)) {
      void get().refreshBalance(true);
    }
    set({
      settings,
      locale: resolveLocale(settings.locale, navigator.language),
      threadMode: (settings.mail?.listMode ?? 'conversation') === 'conversation',
    });
    await get().loadMessages();
  },
  reloadSettings: async () => {
    const settings = await api.settings.get();
    set({
      settings,
      locale: resolveLocale(settings.locale, navigator.language),
      threadMode: (settings.mail?.listMode ?? 'conversation') === 'conversation',
    });
  },

  resetDemo: async () => {
    await api.demo.reset();
    await Promise.all([get().reloadFolders(), get().reloadBriefs(), get().reloadTodos()]);
    await get().loadMessages();
    get().pushToast({ type: 'success', title: '演示数据已重置' });
  },

  /* ------------------------------ 界面状态 ------------------------------ */

  setView: (view) => set({ view }),
  setAIPanel: (open, tab) =>
    set({
      aiPanelOpen: open,
      aiTab: tab ?? get().aiTab,
      // 关闭面板时同时退出最大化，避免其它区域一直被隐藏
      aiPanelMaximized: open ? get().aiPanelMaximized : false,
    }),
  setAIOutput: (key, value) => set((state) => ({ aiOutputs: { ...state.aiOutputs, [key]: value } })),

  /* ------------------------------ AI 动作 ------------------------------ */

  runSummarize: async (messageId) => {
    const id = messageId ?? get().selectedMessageId;
    if (!id) return;
    // 摘要只针对当前这封邮件，切到「邮件摘要」页签，不再弹出时间范围选择
    set({ aiBusy: true, aiProgress: '正在读取当前邮件并生成摘要…', aiPanelOpen: true, aiTab: 'summary' });
    try {
      const result = await api.ai.summarize(id);
      if (result.ok && result.markdown) {
        get().setAIOutput('message', { id, markdown: result.markdown });
      } else {
        get().pushToast({ type: 'error', title: '摘要失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  runThreadSummary: async (threadId) => {
    const meta = get().messages.find((item) => item.id === get().selectedMessageId);
    const id = threadId ?? meta?.threadId;
    if (!id) {
      get().pushToast({ type: 'info', title: '这封邮件暂无会话串', message: '会话串依据 References 与主题归并' });
      return;
    }
    // 会话摘要同样放在「邮件摘要」页签，点开即自动生成
    set({ aiBusy: true, aiProgress: '正在整理会话串…', aiPanelOpen: true, aiTab: 'summary' });
    try {
      const result = await api.ai.summarizeThread(id);
      if (result.ok && result.markdown) {
        get().setAIOutput('thread', { id, markdown: result.markdown, count: result.count ?? 0 });
      } else {
        get().pushToast({ type: 'error', title: '会话摘要失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  runAnalysis: async (params) => {
    const merged: RangeAnalysisParams = { ...get().analysisParams, ...(params ?? {}) };
    set({ analysisParams: merged, aiBusy: true, aiProgress: '正在收集邮件…', aiPanelOpen: true, aiTab: 'analysis' });
    try {
      const result = await api.ai.analyze(merged);
      if (result.ok && result.result) {
        get().setAIOutput('analysis', {
          markdown: result.result.markdown,
          stats: result.result.stats,
          messageIds: result.result.messageIds,
          batches: result.result.batches,
        });
        // 主进程已经把这次分析存成简报并写入待办，这里同步刷新列表
        await get().reloadBriefs();
        await get().reloadTodos();
        if (result.brief) {
          get().pushToast({
            type: 'success',
            title: `已存入「邮件简报」${result.todoCount ? `，生成 ${result.todoCount} 条待办` : ''}`,
            message: result.brief.title,
          });
        }
      } else {
        get().pushToast({ type: 'error', title: '汇总分析失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  generateBriefFromAnalysis: async (kind, title) => {
    const params = get().analysisParams;
    await get().generateBriefDirect(params, kind, title);
  },

  generateBriefDirect: async (params, kind, title) => {
    set({ aiBusy: true, aiProgress: '正在生成简报…' });
    try {
      const result = await api.brief.generate({ ...params, briefKind: kind, title });
      if (result.ok && result.brief) {
        await get().reloadBriefs();
        await get().reloadTodos();
        set({ view: 'briefs', selectedBriefId: result.brief.id, briefGroup: result.brief.group });
        get().pushToast({
          type: 'success',
          title: '简报已生成并存入「邮件简报」文件夹',
          message: result.brief.title,
        });
      } else {
        get().pushToast({ type: 'error', title: '简报生成失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  selectBrief: (id) => set({ selectedBriefId: id }),
  setBriefGroup: (group) => set({ briefGroup: group, selectedBriefId: null }),

  removeBrief: async (id) => {
    const briefs = await api.brief.remove(id);
    set((state) => ({
      briefs,
      selectedBriefId: state.selectedBriefId === id ? null : state.selectedBriefId,
    }));
    await get().reloadFolders();
  },

  exportBrief: async (id, format) => {
    const result = await api.brief.export({ id, format });
    if (result.ok && result.path) {
      get().pushToast({
        type: 'success',
        title: `已导出 ${format.toUpperCase()} 文件`,
        message: result.path,
        action: { label: '打开所在文件夹', run: () => void api.system.revealFile(result.path as string) },
      });
    } else {
      get().pushToast({ type: 'error', title: '导出失败', message: result.error ?? '未知错误' });
    }
  },

  runReplies: async (messageId) => {
    const id = messageId ?? get().selectedMessageId;
    if (!id) return;
    set({ aiBusy: true, aiProgress: '正在生成回复建议…', aiPanelOpen: true, aiTab: 'assist' });
    try {
      const result = await api.ai.replies(id);
      if (result.ok && result.suggestions) {
        get().setAIOutput('replies', { id, suggestions: result.suggestions });
      } else {
        get().pushToast({ type: 'error', title: '回复建议失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  runTranslate: async (messageId, target) => {
    const cached = get().aiOutputs.translate;
    if (cached && cached.id === messageId && cached.target === target) {
      set({ translationVisible: true });
      return;
    }
    set({ aiBusy: true, aiProgress: `正在翻译为${target}…`, aiTab: 'assist' });
    try {
      const result = await api.ai.translate({ messageId, target });
      if (result.ok && result.text) {
        get().setAIOutput('translate', {
          id: messageId,
          text: result.text,
          subject: result.subject ?? '',
          engine: result.engine ?? 'llm',
          target,
        });
        set({ translationVisible: true });
        get().pushToast({
          type: 'success',
          title: `已翻译为${target}`,
          message: result.engine === 'builtin' ? '使用内置免费翻译引擎' : '使用大模型翻译',
        });
      } else {
        get().pushToast({ type: 'error', title: '翻译失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  setTranslationVisible: (visible) => set({ translationVisible: visible }),

  openUpdateDialog: () => set({ updateDialogOpen: true }),
  closeUpdateDialog: () => set({ updateDialogOpen: false }),
  syncAll: async () => {
    const accounts = get().accounts.filter((account) => !account.demo);
    if (!accounts.length) {
      get().pushToast({ type: 'error', title: '没有可收取的账户', message: '请先在设置中添加邮箱账户' });
      return;
    }
    for (const account of accounts) {
      await get().syncNow(account.id);
    }
  },
  checkUpdate: async () => {
    const phase = get().updateState?.phase;
    // 正在下载/已下载/安装中：只把进度窗口打开，不再发起新的检查（否则点了没反应）
    if (phase === 'downloading' || phase === 'downloaded' || phase === 'installing') {
      const { settingsOpen, settingsTab } = get();
      // 设置里已经停在「在线更新」页时不弹窗，进度在那一页看
      if (!(settingsOpen && settingsTab === 'update')) get().openUpdateDialog();
      return;
    }
    const state = await api.update.check();
    set({ updateState: state });
    if (state.phase === 'not-available') {
      get().pushToast({ type: 'success', title: '已是最新版本', message: `当前版本 v${state.currentVersion}` });
    } else if (state.phase === 'available') {
      get().pushToast({
        type: 'info',
        title: `发现新版本 v${state.version}`,
        message: '可在「设置 → 在线更新」中下载安装',
      });
    } else if (state.phase === 'error') {
      get().pushToast({ type: 'error', title: '检查更新失败', message: state.error });
    } else if (state.phase === 'unsupported') {
      get().pushToast({ type: 'info', title: '当前为开发模式', message: state.error });
    }
  },

  downloadUpdate: async () => {
    const state = await api.update.download();
    set({ updateState: state });
  },

  installUpdate: async () => {
    // 先在本地切到「安装中」，避免主进程退出过快导致遮罩来不及显示
    const current = get().updateState;
    if (current) set({ updateState: { ...current, phase: 'installing', error: undefined } });
    const result = await api.update.install();
    if (!result.ok) {
      set({ updateState: current ?? null });
      get().pushToast({
        type: 'error',
        title: '无法自动安装更新',
        message: result.error ?? '请使用「手动运行安装包」完成升级',
      });
    }
  },

  /** 手动运行已下载的安装包（自动安装失败时的兜底） */
  openDownloadedInstaller: async () => {
    const result = await api.update.openInstaller();
    get().pushToast({
      type: result.ok ? 'info' : 'error',
      title: result.ok ? '已启动安装向导' : '未找到安装包',
      message: result.ok ? '按向导完成后会自动打开新版本' : (result.error ?? '请先下载更新'),
    });
  },

  runTriage: async (messageId) => {
    // 重要度结果直接显示在阅读窗格的提示条里，不需要切换侧栏页签
    set({ aiBusy: true, aiProgress: '正在判断重要度…' });
    try {
      const result = await api.ai.triage(messageId);
      if (result.ok && result.result) {
        get().setAIOutput('triage', { id: messageId, result: result.result });
      } else {
        get().pushToast({ type: 'error', title: '重要度判断失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  extractTodosFromMessage: async (messageId) => {
    set({ aiBusy: true, aiProgress: '正在提取待办事项…' });
    try {
      const result = await api.ai.todos(messageId);
      if (result.ok) {
        await get().reloadTodos();
        get().pushToast({
          type: 'success',
          title: `已提取 ${result.items?.length ?? 0} 条待办`,
          message: '可在「待办事项」中查看',
        });
      } else {
        get().pushToast({ type: 'error', title: '待办提取失败', message: result.error ?? '未知错误' });
      }
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  composeAssist: async (action, text, extra) => {
    set({ aiBusy: true, aiProgress: '正在生成…' });
    try {
      const result = await api.ai.compose({
        action: action as never,
        text,
        subject: extra?.subject,
        to: extra?.to,
        targetLanguage: extra?.targetLanguage,
      });
      if (result.ok && result.text) return result.text;
      get().pushToast({ type: 'error', title: '写作辅助失败', message: result.error ?? '未知错误' });
      return null;
    } finally {
      set({ aiBusy: false, aiProgress: null });
      void get().refreshBalance(true);
    }
  },

  /* ------------------------------ 待办 ------------------------------ */

  toggleTodo: async (id, done) => {
    const result = await api.todos.toggle({ id, done });
    set({ todos: result.items, todoStats: result.stats });
  },

  removeTodo: async (id) => {
    const result = await api.todos.remove(id);
    set({ todos: result.items, todoStats: result.stats });
  },

  updateTodo: async (id, patch) => {
    const result = await api.todos.update({ id, patch });
    set({ todos: result.items, todoStats: result.stats });
  },

  clearCompletedTodos: async () => {
    const result = await api.todos.clearCompleted();
    set({ todos: result.items, todoStats: result.stats });
  },

  /* ------------------------------ 写信 ------------------------------ */

  openCompose: (options) => {
    const accountId = options?.accountId ?? get().selectedAccountId ?? get().accounts[0]?.id ?? '';
    set({ compose: { ...emptyCompose, open: true, accountId, ...options } });
  },

  closeCompose: () => set((state) => ({ compose: { ...state.compose, open: false } })),

  updateCompose: (patch) => set((state) => ({ compose: { ...state.compose, ...patch } })),

  sendCompose: async () => {
    const compose = get().compose;
    if (!compose.to.trim()) {
      get().pushToast({ type: 'error', title: '请填写收件人' });
      return;
    }
    set({ sendProgress: { stage: 'connecting', detail: '正在提交发送任务…' } });
    const result = await api.messages.send({
      accountId: compose.accountId,
      to: compose.to,
      cc: compose.cc,
      bcc: compose.bcc,
      subject: compose.subject,
      html: compose.html,
      text: htmlToPlain(compose.html),
      inReplyTo: compose.inReplyTo,
      references: compose.references,
      attachments: compose.attachments ?? [],
    });
    set({ sendProgress: null });
    if (result.ok) {
      set((state) => ({ compose: { ...state.compose, open: false } }));
      await get().reloadFolders();
      get().pushToast({ type: 'success', title: '邮件已发送', message: compose.subject || '(无主题)' });
    } else {
      get().pushToast({ type: 'error', title: '发送失败', message: result.error ?? '未知错误' });
    }
  },

  saveComposeDraft: async () => {
    const compose = get().compose;
    if (!compose.accountId) return;
    const result = await api.messages.saveDraft({
      accountId: compose.accountId,
      to: compose.to,
      cc: compose.cc,
      subject: compose.subject,
      html: compose.html,
      text: htmlToPlain(compose.html),
      draftId: compose.draftId,
    });
    if (result.ok && result.id) {
      set((state) => ({ compose: { ...state.compose, draftId: result.id } }));
      await get().reloadFolders();
    }
  },

  replyToMessage: (mode) => {
    const message = get().selectedMessage;
    if (!message) return;
    const accountId = message.accountId;
    const account = get().accounts.find((item) => item.id === accountId);
    const sender = message.from[0];
    const quote = `<br /><br /><blockquote style="border-left:2px solid #d9dde2;padding-left:10px;color:#5f6772;font-size:13px;">
      <div>----- 原始邮件 -----</div>
      <div>发件人：${sender?.name ?? ''} &lt;${sender?.address ?? ''}&gt;</div>
      <div>时间：${fullTime(message.date)}</div>
      <div>主题：${message.subject}</div>
      <br />${message.body.html ?? (message.body.text ?? '').replace(/\n/g, '<br />')}
    </blockquote>`;

    const replySubject = /^(re|回复|答复)\s*[:：]/i.test(message.subject)
      ? message.subject
      : `Re: ${message.subject}`;
    const forwardSubject = /^(fw|fwd|转发)\s*[:：]/i.test(message.subject)
      ? message.subject
      : `Fwd: ${message.subject}`;

    if (mode === 'forward') {
      get().openCompose({
        mode,
        accountId,
        subject: forwardSubject,
        html: `<br /><br />${quote}`,
        quoteHtml: quote,
      });
      return;
    }

    const to =
      mode === 'replyAll'
        ? [sender?.address, ...message.to.map((item) => item.address)]
            .filter((address): address is string => Boolean(address))
            .filter((address) => address !== account?.email)
            .filter((address, index, list) => list.indexOf(address) === index)
            .join(', ')
        : (sender?.address ?? '');

    const cc =
      mode === 'replyAll'
        ? message.cc
            .map((item) => item.address)
            .filter((address) => address !== account?.email)
            .join(', ')
        : '';

    get().openCompose({
      mode,
      accountId,
      to,
      cc,
      subject: replySubject,
      html: `<p></p><p></p>${quote}`,
      quoteHtml: quote,
      inReplyTo: message.messageId,
      references: [...(message.references ?? []), message.messageId].filter(Boolean) as string[],
    });
  },

  /* ------------------------------ 提示与面板 ------------------------------ */

  pushToast: (toast) => {
    const id = toastId();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), toast.type === 'error' ? 9000 : 5200);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  setSyncProgress: (progress) => set({ syncProgress: progress }),

  openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? 'account' }),
  toggleAIPanelMaximize: () =>
    set((state) => ({ aiPanelMaximized: !state.aiPanelMaximized, aiPanelOpen: true })),

  refreshBalance: async (force = false) => {
    if (!get().settings?.ai.hasApiKey) {
      set({ balance: null });
      return;
    }
    set({ balanceLoading: true });
    try {
      set({ balance: await api.ai.balance(force) });
    } catch (error) {
      set({
        balance: {
          ok: false,
          supported: false,
          provider: get().settings?.ai.provider ?? '',
          error: (error as Error).message,
          fetchedAt: Date.now(),
        },
      });
    } finally {
      set({ balanceLoading: false });
    }
  },
  openChangelog: (options) =>
    set({
      changelogOpen: true,
      changelogAuto: options?.auto ?? false,
      changelogHighlight: options?.version ?? null,
    }),
  closeChangelog: () => set({ changelogOpen: false, changelogAuto: false }),
  closeSettings: () => set({ settingsOpen: false }),
}));

/** 便于其他模块复用：判断是否为「邮件简报」虚拟文件夹 */
export function isBriefFolder(folderId: string | null | undefined): boolean {
  return Boolean(folderId && folderId.startsWith('briefs'));
}

/** 生成分析区间的人类可读标签 */
export function rangeLabel(start: number, end: number): string {
  return `${dateOnly(start)} 至 ${dateOnly(end)}`;
}
