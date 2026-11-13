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
      result = {
        ok: false,
        supported: false,
        provider: settings.provider,
        error: '该服务商暂不支持余额查询',
        fetchedAt: Date.now(),
      };
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
