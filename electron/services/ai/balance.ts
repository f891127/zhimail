/**
 * 大模型账户余额查询：按服务商提供各自的余额接口，状态栏右下角展示。
 * 余额接口并非统一标准，未支持的服务商会返回 supported=false 并给出说明。
 */
import { store } from '../store';

export interface BalanceInfo {
  ok: boolean;
  /** 是否支持查询余额 */
  supported: boolean;
  /** 展示用服务商名 */
  provider: string;
  /** 直接可显示的余额文本，如「¥12.34」 */
  label?: string;
  currency?: string;
  /** 可用余额 */
  total?: number;
  /** 已用金额（部分服务商提供） */
  used?: number;
  /** 赠送 / 充值拆分（部分服务商提供） */
  granted?: number;
  toppedUp?: number;
  error?: string;
  fetchedAt: number;
}

const CACHE_TTL = 60_000;
let cache: { at: number; value: BalanceInfo } | null = null;

function fail(provider: string, error: string): BalanceInfo {
  return { ok: false, supported: true, provider, error, fetchedAt: Date.now() };
}

function currencySymbol(currency?: string): string {
  const value = (currency ?? '').toUpperCase();
  if (value === 'CNY' || value === 'RMB') return '¥';
  if (value === 'USD') return '$';
  return '';
}

function formatAmount(amount: number, currency?: string): string {
  return `${currencySymbol(currency)}${amount.toFixed(2)}`;
}

async function getJson(url: string, apiKey: string): Promise<{ status: number; data: unknown }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  const text = await response.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function pickNumber(source: unknown, keys: string[]): number | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

/** 余额返回值的统一解析器 */
type BalanceParser = (data: unknown) => {
  total?: number;
  granted?: number;
  toppedUp?: number;
  used?: number;
  currency?: string;
} | null;

const deepseekParse: BalanceParser = (data) => {
  const infos = (data as { balance_infos?: Record<string, unknown>[] })?.balance_infos ?? [];
  const info = infos[0];
  if (!info) return null;
  const total = pickNumber(info, ['total_balance']);
  if (total === undefined) return null;
  return {
    total,
    granted: pickNumber(info, ['granted_balance']),
    toppedUp: pickNumber(info, ['topped_up_balance']),
    currency: String(info.currency ?? 'CNY'),
  };
};

const moonshotParse: BalanceParser = (data) => {
  const info = (data as { data?: Record<string, unknown> })?.data ?? {};
  const total = pickNumber(info, ['available_balance']);
  if (total === undefined) return null;
  return {
    total,
    granted: pickNumber(info, ['voucher_balance']),
    toppedUp: pickNumber(info, ['cash_balance']),
    currency: 'CNY',
  };
};

const siliconflowParse: BalanceParser = (data) => {
  const info = (data as { data?: Record<string, unknown> })?.data ?? {};
  const total = pickNumber(info, ['totalBalance', 'balance']);
  if (total === undefined) return null;
  return {
    total,
    granted: pickNumber(info, ['balance']),
    toppedUp: pickNumber(info, ['chargeBalance']),
    currency: 'CNY',
  };
};

const openrouterParse: BalanceParser = (data) => {
  const info = (data as { data?: Record<string, unknown> })?.data ?? {};
  const credits = pickNumber(info, ['total_credits']);
  const usage = pickNumber(info, ['total_usage']) ?? 0;
  if (credits === undefined) return null;
  return { total: Math.max(0, credits - usage), used: usage, currency: 'USD' };
};

/** 常见余额接口的相对路径与解析方式（顺序即优先级） */
const BALANCE_ENDPOINTS: { path: string; parse: BalanceParser }[] = [
  { path: 'user/balance', parse: deepseekParse },
  { path: 'users/me/balance', parse: moonshotParse },
  { path: 'user/info', parse: siliconflowParse },
  { path: 'credits', parse: openrouterParse },
];

/** 预置服务商对应的官方余额地址，自定义中转地址查询不到时用它兜底 */
const PRESET_BALANCE: Record<string, { url: string; parse: BalanceParser; name: string }> = {
  deepseek: { url: 'https://api.deepseek.com/user/balance', parse: deepseekParse, name: 'DeepSeek' },
  moonshot: { url: 'https://api.moonshot.cn/v1/users/me/balance', parse: moonshotParse, name: 'Moonshot' },
  siliconflow: { url: 'https://api.siliconflow.cn/v1/user/info', parse: siliconflowParse, name: 'SiliconFlow' },
  openrouter: { url: 'https://openrouter.ai/api/v1/credits', parse: openrouterParse, name: 'OpenRouter' },
};

/** 用给定的基础地址逐个试探常见余额接口 */
async function probeEndpoints(
  roots: string[],
  apiKey: string,
  providerName: string,
): Promise<BalanceInfo | null> {
  for (const root of roots) {
    for (const endpoint of BALANCE_ENDPOINTS) {
      try {
        const { status, data } = await getJson(`${root}/${endpoint.path}`, apiKey);
        if (status >= 400) continue;
        const parsed = endpoint.parse(data);
        if (!parsed || parsed.total === undefined) continue;
        const currency = parsed.currency ?? 'CNY';
        return {
          ok: true,
          supported: true,
          provider: providerName,
          currency,
          total: parsed.total,
          granted: parsed.granted,
          toppedUp: parsed.toppedUp,
          used: parsed.used,
          label: formatAmount(parsed.total, currency),
          fetchedAt: Date.now(),
        };
      } catch {
        /* 继续尝试下一个接口 */
      }
    }
  }
  return null;
}

/** 查询当前配置的模型服务商余额 */
export async function fetchBalance(force = false): Promise<BalanceInfo> {
  const settings = store.getSettings().ai;
  const apiKey = store.getAIKey();
  const baseUrl = (settings.baseUrl ?? '').trim();

  if (!apiKey) {
    return { ok: false, supported: false, provider: settings.provider, error: '未配置 API Key', fetchedAt: Date.now() };
  }
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.value;

  const host = (() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return baseUrl;
    }
  })();

  let result: BalanceInfo;
  try {
    if (host.includes('deepseek')) {
      const { status, data } = await getJson('https://api.deepseek.com/user/balance', apiKey);
      if (status >= 400) {
        result = fail('DeepSeek', `接口返回 ${status}`);
      } else {
        const infos = (data as { balance_infos?: Record<string, unknown>[] })?.balance_infos ?? [];
        const info = infos[0] ?? {};
        const currency = String(info.currency ?? 'CNY');
        const total = pickNumber(info, ['total_balance']) ?? 0;
        result = {
          ok: true,
          supported: true,
          provider: 'DeepSeek',
          currency,
          total,
          granted: pickNumber(info, ['granted_balance']),
          toppedUp: pickNumber(info, ['topped_up_balance']),
          label: formatAmount(total, currency),
          fetchedAt: Date.now(),
        };
      }
    } else if (host.includes('moonshot')) {
      const { status, data } = await getJson('https://api.moonshot.cn/v1/users/me/balance', apiKey);
      if (status >= 400) {
        result = fail('Moonshot', `接口返回 ${status}`);
      } else {
        const info = (data as { data?: Record<string, unknown> })?.data ?? {};
        const total = pickNumber(info, ['available_balance']) ?? 0;
        result = {
          ok: true,
          supported: true,
          provider: 'Moonshot',
          currency: 'CNY',
          total,
          granted: pickNumber(info, ['voucher_balance']),
          toppedUp: pickNumber(info, ['cash_balance']),
          label: formatAmount(total, 'CNY'),
          fetchedAt: Date.now(),
        };
      }
    } else if (host.includes('siliconflow')) {
      const { status, data } = await getJson('https://api.siliconflow.cn/v1/user/info', apiKey);
      if (status >= 400) {
        result = fail('SiliconFlow', `接口返回 ${status}`);
      } else {
        const info = (data as { data?: Record<string, unknown> })?.data ?? {};
        const total = pickNumber(info, ['totalBalance', 'balance']) ?? 0;
        result = {
          ok: true,
          supported: true,
          provider: 'SiliconFlow',
          currency: 'CNY',
          total,
          granted: pickNumber(info, ['balance']),
          toppedUp: pickNumber(info, ['chargeBalance']),
          label: formatAmount(total, 'CNY'),
          fetchedAt: Date.now(),
        };
      }
    } else if (host.includes('openrouter')) {
      const { status, data } = await getJson('https://openrouter.ai/api/v1/credits', apiKey);
      if (status >= 400) {
        result = fail('OpenRouter', `接口返回 ${status}`);
      } else {
        const info = (data as { data?: Record<string, unknown> })?.data ?? {};
        const credits = pickNumber(info, ['total_credits']) ?? 0;
        const usage = pickNumber(info, ['total_usage']) ?? 0;
        result = {
          ok: true,
          supported: true,
          provider: 'OpenRouter',
          currency: 'USD',
          total: Math.max(0, credits - usage),
          used: usage,
          label: formatAmount(Math.max(0, credits - usage), 'USD'),
          fetchedAt: Date.now(),
        };
      }
    } else if (host.includes('api.openai.com')) {
      result = {
        ok: false,
        supported: false,
        provider: 'OpenAI',
        error: 'OpenAI 官方未提供余额查询接口，可在控制台查看用量',
        fetchedAt: Date.now(),
      };
    } else {
      // 自定义中转地址：先试探当前地址，再尝试预置服务商的官方地址
      const roots = [baseUrl.replace(/\/+$/, '')];
      const preset = PRESET_BALANCE[settings.provider];
      if (preset) roots.push(preset.url.replace(/\/[^/]*$/, ''));

      const probed = await probeEndpoints(roots, apiKey, preset?.name ?? settings.provider);
      if (probed) {
        result = probed;
      } else if (preset) {
        const { status, data } = await getJson(preset.url, apiKey);
        const parsed = status < 400 ? preset.parse(data) : null;
        if (parsed && parsed.total !== undefined) {
          const currency = parsed.currency ?? 'CNY';
          result = {
            ok: true,
            supported: true,
            provider: preset.name,
            currency,
            total: parsed.total,
            granted: parsed.granted,
            toppedUp: parsed.toppedUp,
            used: parsed.used,
            label: formatAmount(parsed.total, currency),
            fetchedAt: Date.now(),
          };
        } else {
          result = {
            ok: false,
            supported: false,
            provider: preset.name,
            error: `未能从 ${new URL(preset.url).host} 读取余额，可能需要在浏览器中登录官方控制台查看`,
            fetchedAt: Date.now(),
          };
        }
      } else {
        result = {
          ok: false,
          supported: false,
          provider: settings.provider,
          error: '该服务商未提供公开的余额查询接口',
          fetchedAt: Date.now(),
        };
      }
    }
  } catch (error) {
    result = fail(settings.provider, (error as Error).message || '查询失败');
  }

  cache = { at: Date.now(), value: result };
  return result;
}

/** 清空缓存（切换模型或 API Key 后调用） */
export function resetBalanceCache(): void {
  cache = null;
}

export interface BalanceTestStep {
  url: string;
  ok: boolean;
  status?: number;
  message: string;
}

export interface BalanceTestResult {
  ok: boolean;
  provider: string;
  label?: string;
  hasKey: boolean;
  baseUrl: string;
  steps: BalanceTestStep[];
  message: string;
}

/**
 * 余额查询自检：把试过的每个地址与结果都列出来，方便判断是 Key 无效、地址不对，还是服务商不提供余额接口。
 */
export async function testBalance(): Promise<BalanceTestResult> {
  const settings = store.getSettings().ai;
  const apiKey = store.getAIKey();
  const baseUrl = (settings.baseUrl ?? '').trim().replace(/\/+$/, '');
  const steps: BalanceTestStep[] = [];
  const result: BalanceTestResult = {
    ok: false,
    provider: settings.provider,
    hasKey: Boolean(apiKey),
    baseUrl,
    steps,
    message: '',
  };
  if (!apiKey) {
    result.message = '尚未保存 API Key：请先填写并点击「保存 AI 设置」';
    return result;
  }
  if (!baseUrl) {
    result.message = '尚未填写 Base URL';
    return result;
  }

  const host = (() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return baseUrl;
    }
  })();
  const preset =
    PRESET_BALANCE[settings.provider] ??
    Object.entries(PRESET_BALANCE).find(([key]) => host.includes(key))?.[1];

  const roots = [baseUrl];
  if (preset) {
    try {
      const official = new URL(preset.url);
      const officialRoot = `${official.origin}${official.pathname.split('/').slice(0, -1).join('/')}`;
      if (!roots.includes(officialRoot)) roots.push(officialRoot);
    } catch {
      /* 忽略 */
    }
  }

  for (const root of roots) {
    for (const endpoint of BALANCE_ENDPOINTS) {
      const url = `${root}/${endpoint.path}`;
      try {
        const { status, data } = await getJson(url, apiKey);
        if (status >= 400) {
          steps.push({ url, ok: false, status, message: `HTTP ${status}` });
          continue;
        }
        const parsed = endpoint.parse(data);
        if (!parsed || parsed.total === undefined) {
          steps.push({ url, ok: false, status, message: '接口有响应，但未找到余额字段' });
          continue;
        }
        const currency = parsed.currency ?? 'CNY';
        const label = formatAmount(parsed.total, currency);
        steps.push({ url, ok: true, status, message: `解析成功：${label}` });
        result.ok = true;
        result.label = label;
        result.provider = preset?.name ?? settings.provider;
        result.message = `查询成功，当前余额 ${label}`;
        cache = {
          at: Date.now(),
          value: {
            ok: true,
            supported: true,
            provider: result.provider,
            currency,
            total: parsed.total,
            granted: parsed.granted,
            toppedUp: parsed.toppedUp,
            used: parsed.used,
            label,
            fetchedAt: Date.now(),
          },
        };
        return result;
      } catch (error) {
        steps.push({ url, ok: false, message: String((error as Error).message ?? error).slice(0, 160) });
      }
    }
  }

  result.message = '没有可用的余额接口。部分服务商（或第三方中转）不提供余额查询，这不影响正常对话使用。';
  return result;
}
