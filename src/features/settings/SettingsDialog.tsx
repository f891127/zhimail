/** 设置：邮箱账户、AI 模型接入、自动简报、关于与快捷键 */

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import type { AccountInput } from '@/types/zhimail';

type TabId = 'account' | 'ai' | 'brief' | 'update' | 'about';

const TABS: { id: TabId; label: string; icon: 'user' | 'sparkles' | 'calendar' | 'refresh' | 'info' }[] = [
  { id: 'account', label: '邮箱账户', icon: 'user' },
  { id: 'ai', label: 'AI 助手', icon: 'sparkles' },
  { id: 'brief', label: '自动简报', icon: 'calendar' },
  { id: 'update', label: '在线更新', icon: 'refresh' },
  { id: 'about', label: '关于', icon: 'info' },
];

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
  const [tab, setTab] = useState<TabId>('account');
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [testResult, setTestResult] = useState<{ imap: { ok: boolean; message: string }; smtp: { ok: boolean; message: string } } | null>(null);
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
    await store.saveAccount(buildInput());
    setForm(emptyForm);
    setTestResult(null);
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
                      <input type="number" value={form.syncDays} onChange={(e) => setForm({ ...form, syncDays: Number(e.target.value) })} className="field" />
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
                      QQ / 163 等邮箱需使用「客户端授权码」，不是登录密码
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

                <div className="flex items-center gap-1.5">
                  <button type="button" className="ghost-btn" disabled={aiTesting} onClick={() => void testAI()}>
                    {aiTesting ? '测试中…' : '测试连接'}
                  </button>
                  <button type="button" className="primary-btn" onClick={() => void saveAI()}>
                    保存 AI 设置
                  </button>
                  <span className="ml-auto text-[10px] text-shell-faint">
                    兼容 OpenAI Chat Completions 协议的服务均可接入
                  </span>
                </div>
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
                  <span className="ml-auto text-[10px] text-shell-faint">应用运行时按设定时间自动生成</span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label">生成频率</label>
                    <select
                      value={settings.brief.frequency}
                      onChange={(e) => void saveBrief({ frequency: e.target.value })}
                      className="field"
                    >
                      <option value="daily">每日</option>
                      <option value="weekly">每周</option>
                      <option value="monthly">每月</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">执行时间</label>
                    <input
                      type="time"
                      value={settings.brief.time}
                      onChange={(e) => void saveBrief({ time: e.target.value })}
                      className="field"
                    />
                  </div>
                  {settings.brief.frequency === 'weekly' && (
                    <div>
                      <label className="field-label">每周执行日</label>
                      <select
                        value={settings.brief.weekday}
                        onChange={(e) => void saveBrief({ weekday: Number(e.target.value) })}
                        className="field"
                      >
                        {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => (
                          <option key={label} value={index + 1}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {settings.brief.frequency === 'monthly' && (
                    <div>
                      <label className="field-label">每月执行日（1-28）</label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={settings.brief.dayOfMonth}
                        onChange={(e) => void saveBrief({ dayOfMonth: Number(e.target.value) })}
                        className="field"
                      />
                    </div>
                  )}
                  <div>
                    <label className="field-label">统计范围</label>
                    <select
                      value={settings.brief.scope}
                      onChange={(e) => void saveBrief({ scope: e.target.value })}
                      className="field"
                    >
                      <option value="inbox">全部账户收件箱</option>
                      <option value="all">全部邮件（含已发送）</option>
                    </select>
                  </div>
                </div>

                <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                  <Icon name="alert" size={11} className="mr-1 inline" />
                  自动简报依赖应用处于运行状态（桌面端不注册系统级服务）。若在设定时间应用未启动，将在下次启动后的第一次检查中补生成最近一个周期的简报，同一周期不会重复生成。
                </div>

                <div className="text-[11px] text-shell-sub">
                  已记录的周期：
                  {Object.keys(settings.brief.lastRun ?? {}).length === 0
                    ? '暂无'
                    : Object.entries(settings.brief.lastRun)
                        .slice(-4)
                        .map(([key, value]) => `${key}（${new Date(value).toLocaleString('zh-CN')}）`)
                        .join('、')}
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
                  {updateState?.phase === 'downloaded' && (
                    <button type="button" className="ghost-btn" onClick={() => void store.installUpdate()}>
                      <Icon name="check-circle" size={12} />
                      立即重启安装
                    </button>
                  )}
                </div>

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

                <p className="text-[11px] leading-5 text-shell-faint">
                  更新包发布在 GitHub Releases（f891127/zhimail）。客户端通过 latest.yml 比对版本，仅下载差异部分；
                  内网环境可在「关于」中查看数据目录，手动替换安装包。
                </p>
              </div>
            )}
            {tab === 'about' && (
              <div className="space-y-3 text-xs leading-6 text-shell-text">
                <div>
                  <div className="text-base font-semibold text-brand-800">知邮 ZhiMail v{info?.version ?? '1.0.0'}</div>
                  <div className="text-[11px] text-shell-sub">
                    Foxmail 风格的桌面邮件客户端，内置 AI 汇总、简报与待办能力。
                  </div>
                </div>

                <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-3 py-2 text-[11px] leading-5">
                  <div>数据目录：{info?.dataDir}</div>
                  <div>
                    凭据保护：{info?.strongEncryption ? '已使用系统密钥（Windows DPAPI）加密' : '当前系统不支持密钥环，使用本地编码存储'}
                  </div>
                  <div>平台：{info?.platform}</div>
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
