/** 设置：邮箱账户、AI 模型接入、自动简报、关于与快捷键 */

import { SKINS } from '@/lib/skin';
import { useEffect, useState } from 'react';
import { SystemSettingsPage } from '@/features/settings/SystemSettingsPage';
import { useAppStore } from '@/store/useAppStore';
import { Icon, type IconName } from '@/components/Icon';
import { api } from '@/lib/api';
import type { AccountInput, AppSettings, BackupOverview, BriefKind, BriefSchedule } from '@/types/zhimail';
import { fileSize } from '@/lib/format';
import {
  DEFAULT_READER_ACTIONS,
  READER_ACTIONS,
  READER_ACTION_GROUPS,
  READER_ACTION_LIMIT_MAX,
  READER_ACTION_LIMIT_MIN,
  READER_ACTION_VISIBLE_LIMIT,
} from '@/lib/readerActions';
import { DEFAULT_TOOLBAR_ACTIONS, TOOLBAR_ACTION_GROUPS, TOOLBAR_ACTIONS } from '@/lib/toolbarActions';

type TabId = 'account' | 'ai' | 'ui' | 'brief' | 'data' | 'update' | 'about' | 'app';

/** 常用 GitHub 加速镜像：均为第三方服务，仅作为快捷填入 */

/** 字节数转可读容量 */
function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 更新源展示文案：能识别常见镜像，否则显示主机名 */
function describeSource(url: string): string {
  if (!url) return '自定义地址（未填写）';
  const mirror = UPDATE_MIRRORS.find((item) => item.url === url);
  if (mirror) return `镜像 ${mirror.label}`;
  try {
    return `自定义地址 ${new URL(url).host}`;
  } catch {
    return '自定义地址';
  }
}

const UPDATE_MIRRORS = [
  {
    label: 'ghproxy.net',
    url: 'https://ghproxy.net/https://github.com/f891127/zhimail/releases/latest/download',
  },
  {
    label: 'gh-proxy.com',
    url: 'https://gh-proxy.com/https://github.com/f891127/zhimail/releases/latest/download',
  },
  {
    label: 'ghfast.top',
    url: 'https://ghfast.top/https://github.com/f891127/zhimail/releases/latest/download',
  },
  {
    label: 'GitHub 直连（不走 API）',
    url: 'https://github.com/f891127/zhimail/releases/latest/download',
  },
];

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'account', label: '邮箱账户', icon: 'user' },
  { id: 'ai', label: 'AI 助手', icon: 'sparkles' },
  { id: 'app', label: '系统设置', icon: 'settings' },
  { id: 'ui', label: '界面', icon: 'panel' },
  { id: 'brief', label: '自动简报', icon: 'calendar' },
  { id: 'data', label: '数据与备份', icon: 'archive' },
  { id: 'update', label: '在线更新', icon: 'refresh' },
  { id: 'about', label: '关于', icon: 'info' },
];

/** 简报周期选项 */
const BRIEF_FREQUENCY_OPTIONS: { value: BriefKind; label: string }[] = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'custom', label: '自定义（每 N 天）' },
];

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function describeSchedule(schedule: BriefSchedule): string {
  switch (schedule.frequency) {
    case 'daily':
      return `每天 ${schedule.time}`;
    case 'weekly':
      return `每${WEEKDAY_LABELS[schedule.weekday - 1] ?? '周一'} ${schedule.time}`;
    case 'monthly':
      return `每月 ${schedule.dayOfMonth} 日 ${schedule.time}`;
    case 'yearly':
      return `每年 ${schedule.month} 月 ${schedule.dayOfMonth} 日 ${schedule.time}`;
    default:
      return `每 ${schedule.days} 天 ${schedule.time}`;
  }
}

/** 「恢复默认」用的四组模板 */
const DEFAULT_SCHEDULE_TEMPLATE: BriefSchedule[] = [
  {
    id: 'schedule-daily',
    name: '日报',
    enabled: true,
    frequency: 'daily',
    time: '08:30',
    weekday: 1,
    dayOfMonth: 1,
    month: 1,
    days: 1,
    scope: 'all',
    anchorAt: 0,
    lastRun: {},
  },
  {
    id: 'schedule-weekly',
    name: '周报',
    enabled: true,
    frequency: 'weekly',
    time: '08:30',
    weekday: 1,
    dayOfMonth: 1,
    month: 1,
    days: 7,
    scope: 'all',
    anchorAt: 0,
    lastRun: {},
  },
  {
    id: 'schedule-monthly',
    name: '月报',
    enabled: true,
    frequency: 'monthly',
    time: '08:30',
    weekday: 1,
    dayOfMonth: 1,
    month: 1,
    days: 30,
    scope: 'all',
    anchorAt: 0,
    lastRun: {},
  },
  {
    id: 'schedule-yearly',
    name: '年报',
    enabled: false,
    frequency: 'yearly',
    time: '08:30',
    weekday: 1,
    dayOfMonth: 1,
    month: 1,
    days: 365,
    scope: 'all',
    anchorAt: 0,
    lastRun: {},
  },
];

function newBriefSchedule(): BriefSchedule {
  const now = Date.now();
  return {
    id: `schedule-${now.toString(36)}`,
    name: '自定义简报',
    enabled: true,
    frequency: 'custom',
    time: '08:30',
    weekday: 1,
    dayOfMonth: 1,
    month: 1,
    days: 7,
    scope: 'all',
    anchorAt: now,
    lastRun: {},
  };
}

interface AccountForm {
  id?: string;
  name: string;
  email: string;
  displayName: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  user: string;
  password: string;
  syncDays: number;
}

const emptyForm: AccountForm = {
  name: '',
  email: '',
  displayName: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  user: '',
  password: '',
  syncDays: 30,
};

export function SettingsDialog() {
  const store = useAppStore();
  const { settingsOpen, settingsTab, accounts, settings, info, updateState } = store;

  const [backupInfo, setBackupInfo] = useState<BackupOverview | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState<string | null>(null);

  // 更新源本地状态：改动后点击「保存更新源」才写入设置
  const [customUrl, setCustomUrl] = useState(settings?.update?.customUrl ?? '');
  // 直接读取已保存的设置，保证选中状态持续显示
  const savedSource = settings?.update?.source ?? 'github';
  const savedUrl = (settings?.update?.customUrl ?? '').trim();
  // 「测试」结果：只反映最近一次探测，不写进设置
  const [sourceTest, setSourceTest] = useState<{
    ok: boolean;
    feedUrl: string;
    version?: string;
    latencyMs: number;
    installerOk?: boolean;
    error?: string;
    hint?: string;
  } | null>(null);
  const [testingSource, setTestingSource] = useState(false);

  useEffect(() => {
    setCustomUrl(settings?.update?.customUrl ?? '');
  }, [settings?.update?.customUrl]);

  /** 测试当前输入的更新源能否取到 latest.yml */
  const testUpdateSource = async () => {
    const target = (customUrl || savedUrl || '').trim();
    setTestingSource(true);
    setSourceTest(null);
    try {
      const result = await api.update.testSource(target);
      setSourceTest(result);
    } catch (error) {
      setSourceTest({
        ok: false,
        feedUrl: target,
        latencyMs: 0,
        error: (error as Error).message,
      });
    } finally {
      setTestingSource(false);
    }
  };

  /** 立即保存更新源（选中即生效，不用再点保存按钮） */
  const saveUpdateSource = async (
    next: { source: 'github' | 'custom'; customUrl?: string },
    hint?: string,
  ) => {
    const url = (next.customUrl ?? customUrl).trim();
    const downloading = updateState?.phase === 'downloading';
    await store.updateSettings({
      update: { ...(settings?.update ?? {}), source: next.source, customUrl: url },
    });
    if (downloading) {
      store.pushToast({
        type: 'info',
        title: '更新源已记录',
        message: '当前正在下载更新，新源会在这次下载结束后生效（下载不会被打断）。',
      });
    }
    if (next.customUrl !== undefined) setCustomUrl(url);
    store.pushToast({
      type: 'success',
      title: '更新源已保存',
      message: hint ?? (next.source === 'custom' ? '已切换为镜像 / 自定义地址' : '已切换为 GitHub 官方源'),
    });
  };

  /** 选择镜像：填入地址并立即保存 */
  const chooseMirror = async (mirror: { label: string; url: string }) => {
    setCustomUrl(mirror.url);
    await saveUpdateSource({ source: 'custom', customUrl: mirror.url }, `已切换到镜像 ${mirror.label}`);
  };

  // 数据目录占用
  const [dataSize, setDataSize] = useState<{ bytes: number; files: number; partial?: boolean } | null>(null);
  const [sizeLoading, setSizeLoading] = useState(false);
  const loadDataSize = async (force = false) => {
    setSizeLoading(true);
    try {
      // 主进程最多算 4 秒就会返回部分结果；这里再兜一层，避免异常时界面永远停在「统计中」
      const result = await Promise.race([
        api.app.dataSize(force ? { force: true } : undefined),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('统计超时，请点「刷新」重试')), 12_000)),
      ]);
      setDataSize({ bytes: result.bytes, files: result.files, partial: result.partial });
    } catch (error) {
      setDataSize((current) => current ?? { bytes: 0, files: 0, partial: true });
      store.pushToast({ type: 'error', title: '统计占用空间失败', message: (error as Error).message });
    } finally {
      setSizeLoading(false);
    }
  };
  const activeTab = store.settingsTab;
  useEffect(() => {
    if (store.settingsOpen && activeTab === 'data') void loadDataSize();
  }, [store.settingsOpen, activeTab]);

  // 运行日志位置（白屏 / 闪退排查用）
  const [logPath, setLogPath] = useState('');
  useEffect(() => {
    if (!store.settingsOpen) return;
    void api.app
      .logPath()
      .then((value) => setLogPath(value))
      .catch(() => setLogPath(''));
  }, [store.settingsOpen]);

  // 数据存储位置
  const changeDataDir = async () => {
    const result = await api.app.chooseDataDir();
    if (result.canceled) return;
    if (result.error) {
      store.pushToast({ type: 'error', title: '更改数据位置失败', message: result.error });
      return;
    }
    const size = ((result.bytes ?? 0) / 1048576).toFixed(1);
    store.pushToast({
      type: 'success',
      title: '数据已复制到新位置',
      message: `共 ${result.files ?? 0} 个文件、${size}MB`,
    });
    const restart = window.confirm(
      `数据已复制到：\n${result.dataDir}\n\n共 ${result.files ?? 0} 个文件、${size}MB；原目录内容保留，确认无误后可自行删除。\n\n需要现在重启应用使其生效吗？`,
    );
    if (restart) await api.app.relaunch();
  };

  const resetDataDir = async () => {
    if (!window.confirm('恢复为默认数据位置？现有数据不会被删除，重启后应用将读取默认目录。')) return;
    await api.app.resetDataDir();
    await api.app.relaunch();
  };
  const [tab, setTab] = useState<TabId>('account');
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [testResult, setTestResult] = useState<{ imap: { ok: boolean; message: string }; smtp: { ok: boolean; message: string } } | null>(null);
  /** 余额查询自检结果 */
  const [balanceTest, setBalanceTest] = useState<Awaited<ReturnType<typeof api.ai.testBalance>> | null>(null);
  const [balanceTesting, setBalanceTesting] = useState(false);
  const [testing, setTesting] = useState(false);

  // AI 表单
  const [aiForm, setAiForm] = useState({ provider: 'deepseek', baseUrl: '', model: '', temperature: 0.3, maxTokens: 3000, timeoutMs: 120000, metadataOnly: false });
  const [apiKey, setApiKey] = useState('');
  const [aiTest, setAiTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiTesting, setAiTesting] = useState(false);

  useEffect(() => {
    if (settingsOpen) setTab(settingsTab as TabId);
  }, [settingsOpen, settingsTab]);

  useEffect(() => {
    if (!settings) return;
    setAiForm({
      provider: settings.ai.provider,
      baseUrl: settings.ai.baseUrl,
      model: settings.ai.model,
      temperature: settings.ai.temperature,
      maxTokens: settings.ai.maxTokens,
      timeoutMs: settings.ai.timeoutMs,
      metadataOnly: settings.ai.metadataOnly,
    });
  }, [settings]);

  // 打开「数据与备份」页时读取备份概览（必须放在提前返回之前，避免 hooks 顺序变化）
  useEffect(() => {
    if (settingsOpen && settingsTab === 'data') void loadBackupInfo();
  }, [settingsOpen, settingsTab]);

  if (!settingsOpen) return null;

  const providers = info?.aiProviders ?? [];
  const presets = info?.mailPresets ?? [];

  const applyPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setForm((current) => ({
      ...current,
      imapHost: preset.imap.host,
      imapPort: preset.imap.port,
      imapSecure: preset.imap.secure,
      smtpHost: preset.smtp.host,
      smtpPort: preset.smtp.port,
      smtpSecure: preset.smtp.secure,
    }));
  };

  const buildInput = (): AccountInput => ({
    id: form.id,
    name: form.name || form.email,
    email: form.email,
    displayName: form.displayName || form.name || form.email.split('@')[0],
    imap: { host: form.imapHost, port: Number(form.imapPort), secure: form.imapSecure, user: form.user || form.email },
    smtp: { host: form.smtpHost, port: Number(form.smtpPort), secure: form.smtpSecure, user: form.user || form.email },
    syncDays: Number(form.syncDays),
    imapPassword: form.password || undefined,
    smtpPassword: form.password || undefined,
  });

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await store.testAccount(buildInput());
      setTestResult(result);
    } catch (error) {
      setTestResult({
        imap: { ok: false, message: (error as Error).message },
        smtp: { ok: false, message: (error as Error).message },
      });
    } finally {
      setTesting(false);
    }
  };

  const saveAccount = async () => {
    if (!form.email.trim() || !form.imapHost.trim() || !form.smtpHost.trim()) {
      store.pushToast({ type: 'error', title: '请填写邮箱地址与服务器地址' });
      return;
    }
    const isNew = !form.id;
    const saved = await store.saveAccount(buildInput());
    setForm(emptyForm);
    setTestResult(null);
    if (isNew) {
      // 新建账户后立刻收取一次，免得用户还要手动点同步
      const accountId = saved ?? store.accounts.find((item) => item.email === form.email.trim())?.id;
      store.pushToast({ type: 'info', title: '账户已保存', message: '正在收取该账户的邮件…' });
      if (accountId) void store.syncNow(accountId);
    }
  };

  const editAccount = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    if (!account) return;
    setForm({
      id: account.id,
      name: account.name,
      email: account.email,
      displayName: account.displayName,
      imapHost: account.imap.host,
      imapPort: account.imap.port,
      imapSecure: account.imap.secure,
      smtpHost: account.smtp.host,
      smtpPort: account.smtp.port,
      smtpSecure: account.smtp.secure,
      user: account.imap.user,
      password: '',
      syncDays: account.syncDays,
    });
    setTestResult(null);
  };

  const changeProvider = (providerId: string) => {
    const provider = providers.find((item) => item.id === providerId);
    setAiForm((current) => ({
      ...current,
      provider: providerId,
      baseUrl: provider?.baseUrl ?? current.baseUrl,
      model: provider?.defaultModel || current.model,
    }));
  };

  const saveAI = async () => {
    await store.updateSettings({
      ai: {
        provider: aiForm.provider,
        baseUrl: aiForm.baseUrl.trim(),
        model: aiForm.model.trim(),
        temperature: Number(aiForm.temperature),
        maxTokens: Number(aiForm.maxTokens),
        timeoutMs: Number(aiForm.timeoutMs),
        metadataOnly: aiForm.metadataOnly,
      },
      ...(apiKey.trim() ? { aiApiKey: apiKey.trim() } : {}),
    });
    setApiKey('');
    store.pushToast({ type: 'success', title: 'AI 设置已保存' });
  };

  const testAI = async () => {
    setAiTesting(true);
    setAiTest(null);
    try {
      const result = await api.ai.test({ ...aiForm, apiKey: apiKey.trim() || undefined });
      setAiTest({
        ok: result.ok,
        message: result.ok ? `连接成功，模型返回：${result.reply}` : result.error ?? '未知错误',
      });
    } catch (error) {
      setAiTest({ ok: false, message: (error as Error).message });
    } finally {
      setAiTesting(false);
    }
  };

  const saveBrief = async (patch: Record<string, unknown>) => {
    if (!settings) return;
    await store.updateSettings({ brief: { ...settings.brief, ...patch } });
  };

  /* ------------------------ 自动简报：多组排程 ------------------------ */

  const saveSchedules = async (schedules: BriefSchedule[]) => {
    await saveBrief({ schedules });
  };

  const addSchedule = async () => {
    await saveSchedules([...(settings?.brief.schedules ?? []), newBriefSchedule()]);
  };

  const patchSchedule = async (id: string, patch: Partial<BriefSchedule>) => {
    const next = (settings?.brief.schedules ?? []).map((schedule) =>
      schedule.id === id ? { ...schedule, ...patch } : schedule,
    );
    await saveSchedules(next);
  };

  const removeSchedule = async (id: string) => {
    if (!window.confirm('删除这组简报设置？已生成的简报不会被删除。')) return;
    await saveSchedules((settings?.brief.schedules ?? []).filter((schedule) => schedule.id !== id));
  };

  const runScheduleNow = async (schedule: BriefSchedule) => {
    setScheduleBusy(schedule.id);
    try {
      const result = await api.brief.runSchedule(schedule.id);
      if (result.error) {
        store.pushToast({ type: 'error', title: '生成失败', message: result.error });
        return;
      }
      store.pushToast({
        type: 'success',
        title: `已生成「${result.scheduleName}」`,
        message: result.brief?.title,
      });
      await store.reloadBriefs();
    } finally {
      setScheduleBusy(null);
    }
  };

  /* ------------------------ 界面设置 ------------------------ */

  /** 调整操作条顺序：只影响展示顺序，不改勾选状态 */
  const moveReaderAction = async (id: string, delta: number) => {
    if (!settings) return;
    const list = [...(settings.ui.readerActions ?? [])];
    const index = list.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    await store.updateSettings({ ui: { ...settings.ui, readerActions: list } });
  };

  /** 调整顶部工具栏顺序 */
  const moveToolbarAction = async (id: string, delta: number) => {
    if (!settings) return;
    const list = [...(settings.ui.toolbarActions ?? [])];
    const index = list.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    await store.updateSettings({ ui: { ...settings.ui, toolbarActions: list } });
  };

  /** 测试余额查询：把每个尝试过的地址与返回都列出来 */
  const runBalanceTest = async () => {
    setBalanceTesting(true);
    setBalanceTest(null);
    try {
      const result = await api.ai.testBalance();
      setBalanceTest(result);
      if (result.ok) await store.refreshBalance(true);
    } finally {
      setBalanceTesting(false);
    }
  };

  const saveUISettings = async (patch: Partial<AppSettings['ui']>, hint = '设置已保存并即时生效') => {
    if (!settings) return;
    await store.updateSettings({ ui: { ...settings.ui, ...patch } });
    store.pushToast({ type: 'success', title: hint, message: '无需点击保存，阅读窗格操作条已同步更新' });
  };

  /* ------------------------ 备份与恢复 ------------------------ */

  const loadBackupInfo = async () => {
    setBackupInfo(await api.backup.overview());
  };

  const exportBackup = async () => {
    const result = await api.backup.export({ includeSecrets: settings?.backup.includeSecrets ?? true });
    if (result.canceled) return;
    if (result.error) {
      store.pushToast({ type: 'error', title: '导出失败', message: result.error });
      return;
    }
    store.pushToast({
      type: 'success',
      title: '备份已导出',
      message: `${result.path}（${result.files ?? 0} 个文件）`,
    });
    await loadBackupInfo();
  };

  const backupNow = async () => {
    const result = await api.backup.autoRun();
    if (!result.created) {
      store.pushToast({ type: 'info', title: '未执行备份', message: result.reason ?? '已有今日备份' });
      return;
    }
    store.pushToast({ type: 'success', title: '已备份到备份目录', message: result.path });
    await loadBackupInfo();
  };

  const importBackup = async () => {
    const picked = await api.backup.inspect();
    if (picked.canceled || !picked.path) return;
    const inspection = picked.inspection;
    if (!inspection?.valid) {
      store.pushToast({ type: 'error', title: '备份包不可用', message: inspection?.error ?? '无法识别该文件' });
      return;
    }
    const manifest = inspection.manifest;
    const detail = manifest
      ? `导出时间：${new Date(manifest.exportedAt).toLocaleString('zh-CN')}\n版本：${manifest.version}\n内容：${manifest.counts.messages} 封邮件、${manifest.counts.briefs} 份简报、${manifest.counts.todos} 条待办`
      : `${inspection.entries} 个文件`;
    if (!window.confirm(`导入备份将覆盖当前数据（现有数据会另存为一份 .before-restore-* 目录）：\n\n${detail}\n\n继续导入吗？`)) {
      return;
    }
    const result = await api.backup.import(picked.path);
    if (!result.ok) {
      store.pushToast({ type: 'error', title: '导入失败', message: result.error });
      return;
    }
    store.pushToast({
      type: 'success',
      title: '备份已恢复',
      message: `共恢复 ${result.restoredFiles ?? 0} 个文件，原数据已另存`,
    });
    if (window.confirm('导入完成，需要现在重启应用以加载恢复后的数据吗？')) {
      await api.app.relaunch();
    }
  };

  const restoreFrom = async (filePath: string) => {
    if (!window.confirm('用这份备份覆盖当前数据？现有数据会另存为 .before-restore-* 目录。')) return;
    const result = await api.backup.import(filePath);
    if (!result.ok) {
      store.pushToast({ type: 'error', title: '恢复失败', message: result.error });
      return;
    }
    store.pushToast({ type: 'success', title: '已恢复备份', message: `共恢复 ${result.restoredFiles ?? 0} 个文件` });
    if (window.confirm('恢复完成，需要现在重启应用吗？')) await api.app.relaunch();
  };

  const removeBackup = async (filePath: string) => {
    if (!window.confirm('删除这份备份包？此操作不可撤销。')) return;
    const result = await api.backup.remove(filePath);
    if (!result.ok) {
      store.pushToast({ type: 'error', title: '删除失败', message: result.error });
      return;
    }
    await loadBackupInfo();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6">
      <div className="flex h-[min(680px,92vh)] w-[min(940px,94vw)] animate-rise-in overflow-hidden rounded-lg border border-shell-line bg-white shadow-[0_16px_48px_rgba(16,24,40,0.22)]">
        <div className="flex w-[168px] shrink-0 flex-col border-r border-shell-line bg-shell-bg py-2">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-shell-faint">设置</div>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 px-3 py-[7px] text-left text-xs transition-colors duration-120 ${
                tab === item.id ? 'bg-brand-500 text-white' : 'text-shell-text hover:bg-black/[0.045]'
              }`}
            >
              <Icon name={item.icon} size={13} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center border-b border-shell-line px-4">
            <span className="text-xs font-semibold text-shell-text">
              {TABS.find((item) => item.id === tab)?.label}
            </span>
            <button
              type="button"
              className="ml-auto rounded p-1 text-shell-faint hover:bg-black/5 hover:text-shell-text"
              onClick={() => store.closeSettings()}
            >
              <Icon name="close" size={13} />
            </button>
          </div>

          <div className="scroll-area flex-1 px-4 py-3">
            {tab === 'account' && (
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-shell-sub">已添加的账户</div>
                  <div className="space-y-1">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center gap-2 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-brand-500 text-[10px] font-bold text-white">
                          {account.displayName.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-shell-text">
                            {account.name}
                            {account.demo && (
                              <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">演示</span>
                            )}
                          </div>
                          <div className="truncate text-[10px] text-shell-faint">
                            {account.email} · IMAP {account.imap.host}:{account.imap.port} · SMTP {account.smtp.host}:
                            {account.smtp.port}
                          </div>
                        </div>
                        <button type="button" className="ghost-btn" onClick={() => editAccount(account.id)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          className="tool-btn text-accent-600"
                          onClick={() => void store.removeAccount(account.id)}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    ))}
                    {accounts.length === 0 && <p className="text-[11px] text-shell-faint">尚未添加账户</p>}
                  </div>
                </div>

                <div className="rounded border border-shell-lineSoft p-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-shell-text">
                      {form.id ? '编辑账户' : '添加邮箱账户'}
                    </span>
                    <select
                      className="field ml-auto w-[180px] py-1"
                      defaultValue=""
                      onChange={(event) => applyPreset(event.target.value)}
                    >
                      <option value="">选择邮箱服务商预设…</option>
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {form.id && (
                      <button type="button" className="ghost-btn" onClick={() => setForm(emptyForm)}>
                        新建
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="field-label">账户名称</label>
                      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：工作邮箱" className="field" />
                    </div>
                    <div>
                      <label className="field-label">邮箱地址</label>
                      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" className="field" />
                    </div>
                    <div>
                      <label className="field-label">发件人显示名</label>
                      <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="房秀杰" className="field" />
                    </div>
                    <div>
                      <label className="field-label">用户名（留空同邮箱地址）</label>
                      <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className="field" />
                    </div>
                    <div>
                      <label className="field-label">IMAP 服务器</label>
                      <input value={form.imapHost} onChange={(e) => setForm({ ...form, imapHost: e.target.value })} placeholder="imap.example.com" className="field" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="field-label">IMAP 端口</label>
                        <input type="number" value={form.imapPort} onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) })} className="field" />
                      </div>
                      <div>
                        <label className="field-label">加密</label>
                        <select value={form.imapSecure ? 'ssl' : 'starttls'} onChange={(e) => setForm({ ...form, imapSecure: e.target.value === 'ssl' })} className="field">
                          <option value="ssl">SSL/TLS</option>
                          <option value="starttls">STARTTLS</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="field-label">SMTP 服务器</label>
                      <input value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} placeholder="smtp.example.com" className="field" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="field-label">SMTP 端口</label>
                        <input type="number" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} className="field" />
                      </div>
                      <div>
                        <label className="field-label">加密</label>
                        <select value={form.smtpSecure ? 'ssl' : 'starttls'} onChange={(e) => setForm({ ...form, smtpSecure: e.target.value === 'ssl' })} className="field">
                          <option value="ssl">SSL/TLS</option>
                          <option value="starttls">STARTTLS</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="field-label">授权码 / 密码</label>
                      {form.password.length > 0 && form.password.length < 12 && (
                        <span className="mb-1 block text-[10px] leading-4 text-amber-600">
                          腾讯企业邮 / QQ 邮箱的客户端专用密码一般为 16 位；若填写的是网页登录密码，登录会失败。
                        </span>
                      )}
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder={form.id ? '留空表示不修改已保存的凭据' : '请输入客户端授权码'}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="field-label">同步最近天数</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={form.syncDays === 0 ? '' : String(form.syncDays)}
                          onChange={(e) => {
                            // 允许自由输入（含清空），不在这里做数值限制，避免打字被打断
                            const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                            setForm({ ...form, syncDays: raw === '' ? 0 : Number(raw) });
                          }}
                          onBlur={() => {
                            const days = Math.min(3650, Math.max(1, Number(form.syncDays) || 30));
                            setForm({ ...form, syncDays: days });
                          }}
                          className="field w-24"
                          placeholder="30"
                        />
                        <span className="text-[11px] text-shell-sub">天</span>
                        <div className="ml-1 flex flex-wrap gap-1">
                          {[7, 30, 90, 180, 365].map((days) => (
                            <button
                              key={days}
                              type="button"
                              className={Number(form.syncDays) === days ? 'primary-btn px-2 py-[3px]' : 'ghost-btn px-2 py-[3px]'}
                              onClick={() => setForm({ ...form, syncDays: days })}
                            >
                              {days}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-shell-faint">可直接输入 1–3650 的任意天数</p>
                    </div>
                  </div>

                  {testResult && (
                    <div className="mt-2 space-y-1 text-[11px]">
                      <div className={testResult.imap.ok ? 'text-emerald-700' : 'text-rose-600'}>
                        IMAP：{testResult.imap.message}
                      </div>
                      <div className={testResult.smtp.ok ? 'text-emerald-700' : 'text-rose-600'}>
                        SMTP：{testResult.smtp.message}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-1.5">
                    <button type="button" className="ghost-btn" disabled={testing} onClick={() => void runTest()}>
                      {testing ? '测试中…' : '测试连接'}
                    </button>
                    <button type="button" className="primary-btn" onClick={() => void saveAccount()}>
                      保存账户
                    </button>
                    <span className="ml-auto text-[10px] text-shell-faint">
                      QQ / 163 / 腾讯企业邮需使用「客户端授权码 / 专用密码」，不是登录密码；企业邮还需管理员开启客户端（IMAP/SMTP）权限
                    </span>
                  </div>
                </div>
              </div>
            )}

            {tab === 'ai' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label">服务商预设</label>
                    <select value={aiForm.provider} onChange={(e) => changeProvider(e.target.value)} className="field">
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">模型名称</label>
                    <input
                      value={aiForm.model}
                      onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                      list="model-options"
                      className="field"
                    />
                    <datalist id="model-options">
                      {(providers.find((item) => item.id === aiForm.provider)?.models ?? []).map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="field-label">Base URL（OpenAI 兼容接口，需包含 /v1）</label>
                  <input
                    value={aiForm.baseUrl}
                    onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                    placeholder="https://api.deepseek.com/v1"
                    className="field"
                  />
                </div>

                <div>
                  <label className="field-label">
                    API Key {settings?.ai.hasApiKey && <span className="text-emerald-600">（已保存，留空则不修改）</span>}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={settings?.ai.hasApiKey ? '••••••••••••••••' : 'sk-...'}
                    className="field"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="field-label">温度</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={aiForm.temperature}
                      onChange={(e) => setAiForm({ ...aiForm, temperature: Number(e.target.value) })}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="field-label">最大输出 tokens</label>
                    <input
                      type="number"
                      value={aiForm.maxTokens}
                      onChange={(e) => setAiForm({ ...aiForm, maxTokens: Number(e.target.value) })}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="field-label">超时（毫秒）</label>
                    <input
                      type="number"
                      value={aiForm.timeoutMs}
                      onChange={(e) => setAiForm({ ...aiForm, timeoutMs: Number(e.target.value) })}
                      className="field"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={aiForm.metadataOnly}
                    onChange={(e) => setAiForm({ ...aiForm, metadataOnly: e.target.checked })}
                    className="mt-[2px] h-3.5 w-3.5 accent-brand-500"
                  />
                  <span className="text-[11px] leading-4 text-shell-text">
                    隐私模式：仅发送主题与元数据，不发送正文
                    <span className="block text-[10px] text-shell-faint">
                      开启后摘要质量会下降，但邮件正文不会离开本机。
                    </span>
                  </span>
                </label>

                {aiTest && (
                  <div
                    className={`rounded px-2.5 py-2 text-[11px] leading-4 ${
                      aiTest.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {aiTest.message}
                  </div>
                )}

                <div>
                  <label className="field-label">一键翻译使用的引擎</label>
                  <select
                    value={settings?.translate?.engine ?? 'auto'}
                    onChange={(event) => void store.updateSettings({ translate: { engine: event.target.value } })}
                    className="field"
                  >
                    <option value="auto">自动（有 API Key 用大模型，否则用内置免费引擎）</option>
                    <option value="llm">始终使用大模型翻译</option>
                    <option value="builtin">始终使用内置免费翻译（不消耗 token）</option>
                  </select>
                  <p className="mt-1 text-[10px] leading-4 text-shell-faint">
                    内置引擎无需 API Key，通过公共翻译接口逐段翻译；大模型翻译对专业术语与句式更准确。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" className="ghost-btn" disabled={aiTesting} onClick={() => void testAI()}>
                    {aiTesting ? '测试中…' : '测试连接'}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={balanceTesting}
                    onClick={() => void runBalanceTest()}
                    title="按当前 Base URL 与 API Key 逐个试探余额接口，并列出每个地址的返回"
                  >
                    <Icon name="chart" size={12} />
                    {balanceTesting ? '查询中…' : '测试余额查询'}
                  </button>
                  <button type="button" className="primary-btn" onClick={() => void saveAI()}>
                    保存 AI 设置
                  </button>
                  <span className="ml-auto text-[10px] text-shell-faint">
                    兼容 OpenAI Chat Completions 协议的服务均可接入
                  </span>
                </div>

                {balanceTest && (
                  <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-2 text-[11px] leading-4">
                    <div className={balanceTest.ok ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>
                      {balanceTest.ok ? `余额 ${balanceTest.label}` : '未查询到余额'}
                      <span className="ml-1 font-normal text-shell-faint">（{balanceTest.provider}）</span>
                    </div>
                    <div className="mt-1 text-shell-sub">{balanceTest.message}</div>
                    {balanceTest.steps.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {balanceTest.steps.map((step) => (
                          <div key={step.url} className="flex items-start gap-1.5 text-[10px] leading-4">
                            <span className={step.ok ? 'text-emerald-600' : 'text-rose-500'}>
                              {step.ok ? '✓' : '✕'}
                            </span>
                            <span className="min-w-0 flex-1 break-all text-shell-sub">{step.url}</span>
                            <span className={step.ok ? 'text-emerald-700' : 'text-shell-faint'}>
                              {step.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!balanceTest.hasKey && (
                      <div className="mt-1 text-[10px] text-rose-500">未检测到已保存的 API Key，请先保存设置。</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'brief' && settings && (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={settings.brief.autoEnabled}
                    onChange={(e) => void saveBrief({ autoEnabled: e.target.checked })}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                  <span className="text-xs font-medium text-shell-text">启用自动简报</span>
                  <span className="ml-auto text-[10px] text-shell-faint">
                    应用运行时按各组设定时间自动生成
                  </span>
                </label>

                {(settings.brief.schedules ?? []).length === 0 && (
                  <div className="rounded border border-shell-lineSoft bg-white px-3 py-6 text-center text-[11px] text-shell-faint">
                    还没有简报组，点击下方「新建简报组」添加日报、周报、月报或自定义周期。
                  </div>
                )}

                {(settings.brief.schedules ?? []).map((schedule) => (
                  <div key={schedule.id} className="rounded border border-shell-lineSoft bg-white px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={schedule.enabled}
                        title="启用这组简报"
                        onChange={(e) => void patchSchedule(schedule.id, { enabled: e.target.checked })}
                        className="h-3.5 w-3.5 accent-brand-500"
                      />
                      <input
                        value={schedule.name}
                        onChange={(e) => void patchSchedule(schedule.id, { name: e.target.value })}
                        className="w-28 rounded border border-shell-line bg-white px-1.5 py-0.5 text-xs font-medium text-shell-text outline-none focus:border-brand-400"
                      />
                      <span className="rounded bg-brand-50 px-1.5 py-[1px] text-[10px] text-brand-700">
                        {BRIEF_FREQUENCY_OPTIONS.find((item) => item.value === schedule.frequency)?.label}
                      </span>
                      <span className="text-[10px] text-shell-faint">{describeSchedule(schedule)}</span>
                      <div className="ml-auto flex gap-1.5">
                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={scheduleBusy === schedule.id}
                          onClick={() => void runScheduleNow(schedule)}
                        >
                          <Icon name="sparkles" size={11} />
                          {scheduleBusy === schedule.id ? '生成中…' : '立即生成'}
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => void removeSchedule(schedule.id)}>
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div>
                        <label className="field-label">生成频率</label>
                        <select
                          value={schedule.frequency}
                          onChange={(e) => void patchSchedule(schedule.id, { frequency: e.target.value as BriefKind })}
                          className="field"
                        >
                          {BRIEF_FREQUENCY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">执行时间</label>
                        <input
                          type="time"
                          value={schedule.time}
                          onChange={(e) => void patchSchedule(schedule.id, { time: e.target.value })}
                          className="field"
                        />
                      </div>
                      <div>
                        <label className="field-label">统计范围</label>
                        <select
                          value={schedule.scope}
                          onChange={(e) => void patchSchedule(schedule.id, { scope: e.target.value as 'inbox' | 'all' })}
                          className="field"
                        >
                          <option value="inbox">全部账户收件箱</option>
                          <option value="all">全部邮件（含已发送）</option>
                        </select>
                      </div>

                      {schedule.frequency === 'weekly' && (
                        <div>
                          <label className="field-label">每周执行日</label>
                          <select
                            value={schedule.weekday}
                            onChange={(e) => void patchSchedule(schedule.id, { weekday: Number(e.target.value) })}
                            className="field"
                          >
                            {WEEKDAY_LABELS.map((label, index) => (
                              <option key={label} value={index + 1}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {(schedule.frequency === 'monthly' || schedule.frequency === 'yearly') && (
                        <div>
                          <label className="field-label">执行日（1-28）</label>
                          <input
                            type="number"
                            min={1}
                            max={28}
                            value={schedule.dayOfMonth}
                            onChange={(e) => void patchSchedule(schedule.id, { dayOfMonth: Number(e.target.value) })}
                            className="field"
                          />
                        </div>
                      )}

                      {schedule.frequency === 'yearly' && (
                        <div>
                          <label className="field-label">执行月份</label>
                          <select
                            value={schedule.month}
                            onChange={(e) => void patchSchedule(schedule.id, { month: Number(e.target.value) })}
                            className="field"
                          >
                            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                              <option key={month} value={month}>
                                {month} 月
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {schedule.frequency === 'custom' && (
                        <div>
                          <label className="field-label">每 N 天（1-365）</label>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={schedule.days}
                            onChange={(e) => void patchSchedule(schedule.id, { days: Number(e.target.value) })}
                            className="field"
                          />
                        </div>
                      )}
                    </div>

                    <div className="mt-1.5 text-[10px] text-shell-faint">
                      {Object.keys(schedule.lastRun ?? {}).length === 0
                        ? '尚未生成过'
                        : `上次生成：${new Date(Math.max(...Object.values(schedule.lastRun))).toLocaleString('zh-CN')}`}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" className="ghost-btn" onClick={() => void addSchedule()}>
                    <Icon name="plus" size={11} />
                    新建简报组
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void saveSchedules(DEFAULT_SCHEDULE_TEMPLATE.map((item) => ({ ...item, anchorAt: Date.now() })))}
                  >
                    恢复默认（日报 / 周报 / 月报 / 年报）
                  </button>
                </div>

                <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                  <Icon name="alert" size={11} className="mr-1 inline" />
                  自动简报依赖应用处于运行状态（桌面端不注册系统级服务）。若在设定时间应用未启动，将在下次启动后的第一次检查中补生成最近一个周期的简报，同一周期不会重复生成。
                </div>
              </div>
            )}

            {tab === 'app' && <SystemSettingsPage />}

            {tab === 'ui' && settings && (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-shell-sub">界面皮肤</div>
                  <div className="flex flex-wrap gap-1.5">
                    {SKINS.map((skin) => {
                      const active = (settings.ui?.skin ?? 'default') === skin.id;
                      return (
                        <button
                          key={skin.id}
                          type="button"
                          className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors duration-120 ${
                            active
                              ? 'border-brand-400 bg-brand-50 text-brand-700'
                              : 'border-shell-line text-shell-sub hover:border-brand-200 hover:bg-black/[0.02]'
                          }`}
                          onClick={() => void store.updateSettings({ ui: { ...(settings.ui ?? {}), skin: skin.id } } as never)}
                        >
                          <span className="flex overflow-hidden rounded-sm border border-black/10">
                            {skin.swatch.map((color, index) => (
                              <span key={color} style={{ background: color, width: index === 2 ? 12 : 7, height: 16 }} />
                            ))}
                          </span>
                          {skin.name}
                          {active && <Icon name="check" size={10} />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-shell-faint">
                    皮肤会立即生效并自动保存；也可以在工具栏右上角的「皮肤」按钮里切换。
                  </p>
                </div>

                <div className="text-[11px] leading-5 text-shell-sub">
                  顶部工具栏（写邮件右侧、搜索框右侧那一排）显示哪些按钮由此决定，勾选顺序即展示顺序；
                  未勾选的按钮不会出现在工具栏上，功能仍可通过「工具」菜单使用。
                  <span className="ml-1 text-brand-600">勾选即时生效并自动保存。</span>
                </div>

                {TOOLBAR_ACTION_GROUPS.map((group) => (
                  <div key={group} className="rounded border border-shell-lineSoft bg-white px-3 py-2.5">
                    <div className="mb-1.5 text-[11px] font-semibold text-shell-sub">{group}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {TOOLBAR_ACTIONS.filter((action) => action.group === group).map((action) => {
                        const list = settings.ui.toolbarActions ?? DEFAULT_TOOLBAR_ACTIONS;
                        const selected = list.includes(action.id);
                        return (
                          <div key={action.id} className="flex items-center gap-2 text-[11px] text-shell-text">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  void saveUISettings({
                                    toolbarActions: selected
                                      ? list.filter((id) => id !== action.id)
                                      : [...list, action.id],
                                  })
                                }
                                className="h-3.5 w-3.5 accent-brand-500"
                              />
                              <Icon name={action.icon} size={12} className={action.brand ? 'text-brand-500' : 'text-shell-sub'} />
                              <span>{action.label}</span>
                              <span className="truncate text-[10px] text-shell-faint">{action.title}</span>
                            </label>
                            {selected && (
                              <span className="flex shrink-0 items-center">
                                <button
                                  type="button"
                                  className="rounded px-0.5 text-shell-faint hover:bg-black/[0.06] hover:text-brand-600"
                                  title="往前挪"
                                  onClick={() => void moveToolbarAction(action.id, -1)}
                                >
                                  <Icon name="chevron-right" size={11} className="rotate-180" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded px-0.5 text-shell-faint hover:bg-black/[0.06] hover:text-brand-600"
                                  title="往后挪"
                                  onClick={() => void moveToolbarAction(action.id, 1)}
                                >
                                  <Icon name="chevron-right" size={11} />
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-shell-faint">
                    当前已选 {(settings.ui.toolbarActions ?? DEFAULT_TOOLBAR_ACTIONS).length} 项；「写邮件」按钮固定显示在最左
                  </span>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void saveUISettings({ toolbarActions: [...DEFAULT_TOOLBAR_ACTIONS] })}
                  >
                    恢复默认工具栏
                  </button>
                </div>

                <div className="text-[11px] leading-5 text-shell-sub">
                  勾选后这些操作会出现在阅读窗格邮件标题下方的操作条上，勾选顺序即展示顺序；未勾选的操作不会显示。
                  超过上限（默认 7 个）的部分收进「更多」菜单，与「工具」菜单中的功能一一对应。
                  <span className="ml-1 text-brand-600">勾选即时生效并自动保存，无需点击保存按钮。</span>
                </div>

                {READER_ACTION_GROUPS.map((group) => (
                  <div key={group} className="rounded border border-shell-lineSoft bg-white px-3 py-2.5">
                    <div className="mb-1.5 text-[11px] font-semibold text-shell-sub">{group}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {READER_ACTIONS.filter((action) => action.group === group).map((action) => {
                        const selected = (settings.ui.readerActions ?? []).includes(action.id);
                        return (
                          <div
                            key={action.id}
                            className="flex items-center gap-2 text-[11px] text-shell-text"
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  void saveUISettings({
                                    readerActions: selected
                                      ? (settings.ui.readerActions ?? []).filter((id) => id !== action.id)
                                      : [...(settings.ui.readerActions ?? []), action.id],
                                  })
                                }
                                className="h-3.5 w-3.5 accent-brand-500"
                              />
                              <Icon name={action.icon} size={12} className={action.brand ? 'text-brand-500' : 'text-shell-sub'} />
                              <span>{action.label}</span>
                              <span className="truncate text-[10px] text-shell-faint">{action.title}</span>
                            </label>
                            {selected && (
                              <span className="flex shrink-0 items-center">
                                <button
                                  type="button"
                                  className="rounded px-0.5 text-shell-faint hover:bg-black/[0.06] hover:text-brand-600"
                                  title="在操作条上往前挪"
                                  onClick={() => void moveReaderAction(action.id, -1)}
                                >
                                  <Icon name="chevron-right" size={11} className="rotate-180" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded px-0.5 text-shell-faint hover:bg-black/[0.06] hover:text-brand-600"
                                  title="在操作条上往后挪"
                                  onClick={() => void moveReaderAction(action.id, 1)}
                                >
                                  <Icon name="chevron-right" size={11} />
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="field-label mb-0">操作条最多显示</label>
                  <select
                    value={settings.ui.readerActionLimit ?? READER_ACTION_VISIBLE_LIMIT}
                    onChange={(event) => void saveUISettings({ readerActionLimit: Number(event.target.value) })}
                    className="field w-[86px]"
                  >
                    {Array.from(
                      { length: READER_ACTION_LIMIT_MAX - READER_ACTION_LIMIT_MIN + 1 },
                      (_, index) => READER_ACTION_LIMIT_MIN + index,
                    ).map((count) => (
                      <option key={count} value={count}>
                        {count} 项
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-shell-faint">
                    超出的收进「更多」；当前已选 {(settings.ui.readerActions ?? []).length} 项
                  </span>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() =>
                      void saveUISettings({
                        readerActions: [...DEFAULT_READER_ACTIONS],
                        readerActionLimit: READER_ACTION_VISIBLE_LIMIT,
                      })
                    }
                  >
                    恢复默认
                  </button>
                </div>
              </div>
            )}

            {tab === 'data' && (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-shell-sub">数据存储位置</div>
                  <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2 text-[11px] leading-5">
                    <div className="break-all">
                      当前目录：{info?.dataDir}
                      <span className="ml-1 text-shell-faint">{info?.dataDirCustom ? '（自定义）' : '（默认）'}</span>
                    </div>
                    <div className="text-shell-faint">
                      邮件、附件、简报、待办与全部设置都保存在这里；更改位置会把现有数据复制过去，重启后生效，原目录内容保留。
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-shell-lineSoft pt-1.5">
                      <span className="text-shell-sub">
                        已占用：
                        <span className="font-medium tabular-nums text-shell-text">
                          {dataSize ? formatBytes(dataSize.bytes) : '统计中…'}
                          {dataSize?.partial && (
                            <span className="ml-1 text-[11px] text-amber-700">（部分，目录较大，点刷新继续统计）</span>
                          )}
                        </span>
                      </span>
                      {dataSize && <span className="text-shell-faint">{dataSize.files} 个文件</span>}
                      <button
                        type="button"
                        className="ml-auto text-[11px] text-brand-600 hover:underline"
                        onClick={() => void loadDataSize(true)}
                      >
                        {sizeLoading ? '统计中…' : '刷新'}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button type="button" className="ghost-btn" onClick={() => void changeDataDir()}>
                        更改位置…
                      </button>
                      {info?.dataDirCustom && (
                        <button type="button" className="ghost-btn" onClick={() => void resetDataDir()}>
                          恢复默认位置
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void api.system.openPath(info?.dataDir ?? '')}
                      >
                        打开目录
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold text-shell-sub">备份与恢复</div>
                  <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2 text-[11px] leading-5">
                    <div>
                      当前数据：{backupInfo?.counts.accounts ?? 0} 个账户 · {backupInfo?.counts.messages ?? 0} 封邮件 ·{' '}
                      {backupInfo?.counts.briefs ?? 0} 份简报 · {backupInfo?.counts.todos ?? 0} 条待办
                    </div>
                    <div className="break-all text-shell-faint">备份目录：{backupInfo?.backupDir}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button type="button" className="primary-btn" onClick={() => void exportBackup()}>
                        <Icon name="download" size={12} />
                        导出备份…
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => void importBackup()}>
                        <Icon name="archive" size={12} />
                        导入备份…
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => void backupNow()}>
                        备份到备份目录
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => void api.backup.openDir()}>
                        打开备份目录
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings?.backup.autoEnabled ?? false}
                      onChange={(e) => void store.updateSettings({ backup: { ...settings?.backup, autoEnabled: e.target.checked } })}
                      className="h-3.5 w-3.5 accent-brand-500"
                    />
                    <span className="text-[11px] font-medium text-shell-text">每天首次启动自动备份</span>
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="field-label">保留份数</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={settings?.backup.keep ?? 7}
                        onChange={(e) => void store.updateSettings({ backup: { ...settings?.backup, keep: Number(e.target.value) } })}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="field-label">备份目录（留空用默认）</label>
                      <input
                        value={settings?.backup.directory ?? ''}
                        placeholder={backupInfo?.backupDir ?? ''}
                        onChange={(e) => void store.updateSettings({ backup: { ...settings?.backup, directory: e.target.value } })}
                        className="field"
                      />
                    </div>
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings?.backup.includeSecrets ?? true}
                      onChange={(e) => void store.updateSettings({ backup: { ...settings?.backup, includeSecrets: e.target.checked } })}
                      className="h-3.5 w-3.5 accent-brand-500"
                    />
                    <span className="text-[11px] text-shell-text">
                      备份包含凭据（邮箱密码与 AI Key，仍为系统加密存储；不含则导入后需重新填写）
                    </span>
                  </label>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-shell-sub">
                      备份目录中的备份包（{backupInfo?.backups.length ?? 0}）
                    </span>
                    <button type="button" className="ghost-btn" onClick={() => void loadBackupInfo()}>
                      <Icon name="refresh" size={11} />
                      刷新
                    </button>
                  </div>
                  <div className="max-h-[160px] overflow-auto rounded border border-shell-lineSoft bg-white">
                    {(backupInfo?.backups ?? []).length === 0 && (
                      <div className="px-3 py-3 text-center text-[11px] text-shell-faint">暂无备份包</div>
                    )}
                    {(backupInfo?.backups ?? []).map((entry) => (
                      <div key={entry.path} className="flex items-center gap-2 border-b border-shell-lineSoft px-3 py-1.5 text-[11px] last:border-b-0">
                        <Icon name="archive" size={12} className="text-shell-sub" />
                        <span className="truncate text-shell-text">{entry.name}</span>
                        <span className="text-shell-faint">{fileSize(entry.size)}</span>
                        <span className="text-shell-faint">{new Date(entry.time).toLocaleString('zh-CN')}</span>
                        <div className="ml-auto flex gap-1.5">
                          <button type="button" className="ghost-btn" onClick={() => void restoreFrom(entry.path)}>
                            恢复
                          </button>
                          <button type="button" className="ghost-btn" onClick={() => void removeBackup(entry.path)}>
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                  <Icon name="alert" size={11} className="mr-1 inline" />
                  导入备份会覆盖当前数据：应用会先把现有数据目录整体另存为一份
                  <code className="mx-1 rounded bg-white/70 px-1">.before-restore-*</code>
                  目录，再写入备份内容，因此可以回退。
                </div>
              </div>
            )}

            {tab === 'update' && (
              <div className="space-y-3">
                <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-shell-text">
                      当前版本 v{updateState?.currentVersion ?? info?.version ?? '1.0.0'}
                    </span>
                    <span
                      className={`rounded px-1.5 py-[1px] text-[10px] ${
                        updateState?.phase === 'available'
                          ? 'bg-brand-100 text-brand-700'
                          : updateState?.phase === 'downloaded'
                            ? 'bg-emerald-100 text-emerald-700'
                            : updateState?.phase === 'error'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-shell-chrome text-shell-sub'
                      }`}
                    >
                      {
                        {
                          idle: '未检查',
                          checking: '正在检查…',
                          available: `发现新版本 v${updateState?.version ?? ''}`,
                          'not-available': '已是最新版本',
                          downloading: `正在下载 ${updateState?.percent ?? 0}%`,
                          downloaded: '下载完成，可重启安装',
                          installing: '正在安装并重启…',
                          error: '检查失败',
                          unsupported: '开发模式不可用',
                        }[updateState?.phase ?? 'idle']
                      }
                    </span>
                  </div>

                  {updateState?.phase === 'downloading' && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-shell-lineSoft">
                      <div
                        className="h-full bg-brand-500 transition-all duration-200"
                        style={{ width: `${updateState.percent ?? 0}%` }}
                      />
                    </div>
                  )}

                  {updateState?.phase === 'downloading' && updateState?.fullDownloadFallback && (
                    <p className="mt-1.5 text-[11px] leading-4 text-amber-700">
                      差分校验未通过（本地没有可比的旧安装包），已自动改为整包下载，进度会从头计算。
                    </p>
                  )}

                  {updateState?.error && (
                    <p className="mt-1.5 text-[11px] leading-4 text-rose-600">{updateState.error}</p>
                  )}

                  {updateState?.releaseNotes && (
                    <pre className="mt-2 max-h-[120px] overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-[11px] leading-4 text-shell-sub">
                      {updateState.releaseNotes}
                    </pre>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" className="primary-btn" onClick={() => void store.checkUpdate()}>
                    <Icon name="refresh" size={12} />
                    检查更新
                  </button>
                  {updateState?.phase === 'available' && (
                    <button type="button" className="ghost-btn" onClick={() => void store.downloadUpdate()}>
                      <Icon name="download" size={12} />
                      下载更新
                    </button>
                  )}
                  {updateState?.phase === 'downloading' && (
                    <button type="button" className="ghost-btn" disabled>
                      <Icon name="download" size={12} className="animate-pulse" />
                      下载中 {Math.floor(updateState.percent ?? 0)}%
                    </button>
                  )}
                  {updateState?.phase === 'downloaded' && updateState.canAutoInstall && (
                    <button type="button" className="primary-btn" onClick={() => void store.installUpdate()}>
                      <Icon name="check-circle" size={12} />
                      立即重启并安装
                    </button>
                  )}
                  {updateState?.phase === 'downloaded' && updateState.canAutoInstall && updateState.error && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void store.openDownloadedInstaller()}
                      title="用安装向导手动完成升级，安装过程有完整进度"
                    >
                      <Icon name="external" size={12} />
                      手动运行安装包
                    </button>
                  )}
                  {updateState?.phase === 'downloaded' && !updateState.canAutoInstall && (
                    <button type="button" className="ghost-btn" onClick={() => void api.update.openRelease()}>
                      <Icon name="external" size={12} />
                      打开发布页下载新版
                    </button>
                  )}
                  {updateState?.phase === 'installing' && (
                    <span className="flex items-center gap-1 text-[11px] text-brand-600">
                      <Icon name="refresh" size={12} className="animate-spin" />
                      正在退出并安装，安装完成后会自动重启
                    </span>
                  )}
                </div>

                {updateState?.phase === 'downloaded' && !updateState.canAutoInstall && (
                  <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                    <Icon name="alert" size={11} className="mr-1 inline" />
                    当前运行的是<strong>免安装便携版</strong>，更新程序无法替换正在运行的程序文件，因此不会自动安装。
                    请下载新版便携包解压覆盖原目录（数据在数据目录中，不会丢失）；若希望以后一键自动更新，请改用安装版。
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2 rounded border border-shell-lineSoft px-2.5 py-2">
                    <input
                      type="checkbox"
                      checked={settings?.update?.autoCheck ?? true}
                      onChange={(event) =>
                        void store.updateSettings({ update: { ...settings?.update, autoCheck: event.target.checked } })
                      }
                      className="h-3.5 w-3.5 accent-brand-500"
                    />
                    <span className="text-[11px] text-shell-text">启动后自动检查新版本</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded border border-shell-lineSoft px-2.5 py-2">
                    <input
                      type="checkbox"
                      checked={settings?.update?.autoDownload ?? false}
                      onChange={(event) =>
                        void store.updateSettings({
                          update: { ...settings?.update, autoDownload: event.target.checked },
                        })
                      }
                      className="h-3.5 w-3.5 accent-brand-500"
                    />
                    <span className="text-[11px] text-shell-text">发现新版本后自动下载（安装前仍会提示）</span>
                  </label>
                </div>

                <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2.5">
                  <div className="mb-1.5 text-xs font-semibold text-shell-text">更新源</div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={savedSource === 'github' ? 'primary-btn' : 'ghost-btn'}
                      onClick={() => void saveUpdateSource({ source: 'github' })}
                    >
                      {savedSource === 'github' && <Icon name="check" size={12} />}
                      GitHub 官方
                    </button>
                    <button
                      type="button"
                      className={savedSource === 'custom' ? 'primary-btn' : 'ghost-btn'}
                      onClick={() => void saveUpdateSource({ source: 'custom' })}
                    >
                      {savedSource === 'custom' && <Icon name="check" size={12} />}
                      镜像 / 自定义地址
                    </button>
                  </div>
                  {savedSource === 'custom' && (
                    <div className="mt-2">
                      <input
                        value={customUrl}
                        onChange={(event) => setCustomUrl(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveUpdateSource({ source: 'custom' });
                        }}
                        placeholder="https://ghproxy.net/https://github.com/f891127/zhimail/releases/latest/download"
                        className="w-full rounded border border-shell-line bg-white px-2 py-1 text-[11px] text-shell-text outline-none focus:border-brand-400"
                      />
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {UPDATE_MIRRORS.map((mirror) => {
                          const active = savedSource === 'custom' && savedUrl === mirror.url;
                          return (
                            <button
                              key={mirror.label}
                              type="button"
                              className={active ? 'primary-btn' : 'ghost-btn'}
                              onClick={() => void chooseMirror(mirror)}
                            >
                              {active && <Icon name="check" size={12} />}
                              {mirror.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-5 text-shell-faint">
                        点一下镜像即生效（会自动保存）；也可以手动填写地址后按回车或点「保存更新源」。该地址需要能直接访问到 latest.yml 与安装包，镜像站点为第三方服务，可用性可能变化，可先点「检查更新」验证。
                      </p>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button type="button" className="ghost-btn" onClick={() => void saveUpdateSource({ source: savedSource })}>
                      保存更新源
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={testingSource}
                      onClick={() => void testUpdateSource()}
                    >
                      {testingSource ? '测试中…' : '测试'}
                    </button>
                    <span className="text-[11px] text-shell-faint">
                      当前：{savedSource === 'custom' ? describeSource(savedUrl) : 'GitHub 官方'}
                    </span>
                  </div>
                  {sourceTest && (
                    <div
                      className={`mt-2 rounded border px-2.5 py-2 text-[11px] leading-5 ${
                        sourceTest.ok
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        <Icon name={sourceTest.ok ? 'check-circle' : 'alert'} size={12} className="mt-1 shrink-0" />
                        <div className="min-w-0">
                          {sourceTest.ok ? (
                            <>
                              可访问：最新版本 v{sourceTest.version}，耗时 {sourceTest.latencyMs} ms
                              {sourceTest.installerOk === false && '；安装包暂不可取（镜像可能未缓存）'}
                              {sourceTest.installerOk && '；安装包可下载'}
                            </>
                          ) : (
                            <>
                              无法使用：{sourceTest.error}
                              {sourceTest.hint ? ` —— ${sourceTest.hint}` : ''}
                            </>
                          )}
                          <div className="mt-0.5 break-all text-[10px] opacity-70">探测地址：{sourceTest.feedUrl}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] leading-5 text-shell-faint">
                  更新包发布在 GitHub Releases（f891127/zhimail）。客户端通过 latest.yml 比对版本后下载安装包。
                  若提示连接超时，通常是本机网络无法直连 GitHub，可切换到镜像地址后重试。
                </p>
              </div>
            )}
            {tab === 'about' && (
              <div className="space-y-3 text-xs leading-6 text-shell-text">
                <div>
                  <div className="text-base font-semibold text-brand-800">智邮 ZhiYou v{info?.version ?? '1.0.0'}</div>
                  <div className="text-[11px] text-shell-sub">
                    智能桌面邮件客户端，内置AI汇总、简报与待办能力。
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold text-shell-sub">数据存储位置</div>
                  <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2 text-[11px] leading-5">
                    <div className="break-all">
                      当前目录：{info?.dataDir}
                      <span className="ml-1 text-shell-faint">{info?.dataDirCustom ? '（自定义）' : '（默认）'}</span>
                    </div>
                    <div className="text-shell-faint">
                      邮件、附件、简报、待办与全部设置都保存在这里；更改位置会把现有数据复制过去，重启后生效，原目录内容保留。
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button type="button" className="ghost-btn" onClick={() => void changeDataDir()}>
                        更改位置…
                      </button>
                      {info?.dataDirCustom && (
                        <button type="button" className="ghost-btn" onClick={() => void resetDataDir()}>
                          恢复默认位置
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void api.system.openPath(info?.dataDir ?? '')}
                      >
                        打开目录
                      </button>
                    </div>
                  </div>
                </div>
                <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2 text-[11px] leading-5">
                  <div>数据目录：{info?.dataDir}</div>
                  <div>
                    凭据保护：{info?.strongEncryption ? '已使用系统密钥（Windows DPAPI）加密' : '当前系统不支持密钥环，使用本地编码存储'}
                  </div>
                  <div>平台：{info?.platform}</div>
                  <div>作者：fxj</div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold text-shell-sub">快捷键</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-shell-sub">
                    <span>Ctrl+N 写邮件</span>
                    <span>Ctrl+R 回复</span>
                    <span>Ctrl+F 聚焦搜索</span>
                    <span>Ctrl+Shift+A AI 助手</span>
                    <span>↑ / ↓ 切换邮件</span>
                    <span>Delete 删除邮件</span>
                    <span>F5 刷新 / 同步</span>
                    <span>Esc 关闭当前弹窗</span>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold text-shell-sub">隐私说明</div>
                  <p className="text-[11px] leading-5 text-shell-sub">
                    邮件正文仅在您主动触发 AI 功能时，按所选时间范围发送至您自己配置的大模型接口；应用不内置任何第三方分析服务。
                    可在「AI 助手」设置中开启隐私模式，只发送主题与元数据。
                  </p>
                </div>

                <div className="flex gap-1.5">
                  <button type="button" className="ghost-btn" onClick={() => store.openChangelog()}>
                    查看更新日志
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => void store.checkUpdate()}>
                    检查更新
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => void store.resetDemo()}>
                    重置演示数据
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void api.system.openPath(info?.dataDir ?? '')}
                  >
                    打开数据目录
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void api.system.openPath(logPath || info?.dataDir || '')}
                    title={logPath || '运行日志写入数据目录下的 logs 文件夹'}
                  >
                    打开运行日志
                  </button>
                </div>
                {logPath && (
                  <p className="text-[11px] leading-5 text-shell-faint">
                    运行日志：{logPath}（界面报错、更新异常都会记录在这里，反馈问题时可直接附上）
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
