/**
 * OpenAI 兼容 Chat Completions 客户端。
 * 支持：普通调用、流式调用、超时、错误归类、宽松 JSON 解析、分批并发控制。
 */

import type { ChatMessage } from '../types';

export interface ChatOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  model: string;
}

export class AIError extends Error {
  readonly kind: 'config' | 'auth' | 'network' | 'timeout' | 'server' | 'empty' | 'aborted';
  readonly status?: number;

  constructor(
    kind: AIError['kind'],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'AIError';
    this.kind = kind;
    this.status = status;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new AIError('config', '未配置 AI 接口地址（Base URL）');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new AIError('config', 'Base URL 需要以 http:// 或 https:// 开头');
  }
  return trimmed;
}

function describeError(status: number, body: string): AIError {
  const snippet = body.slice(0, 400);
  if (status === 401 || status === 403) {
    return new AIError('auth', `鉴权失败（HTTP ${status}），请检查 API Key 是否正确或已过期。${snippet}`, status);
  }
  if (status === 404) {
    return new AIError('config', `接口不存在（HTTP 404），请确认 Base URL 与模型名。${snippet}`, status);
  }
  if (status === 429) {
    return new AIError('server', `请求过于频繁或额度不足（HTTP 429）。${snippet}`, status);
  }
  if (status >= 500) {
    return new AIError('server', `模型服务端错误（HTTP ${status}）。${snippet}`, status);
  }
  return new AIError('server', `请求失败（HTTP ${status}）。${snippet}`, status);
}

function extractContent(payload: any): { content: string; usage?: ChatResponse['usage'] } {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text ?? '';
  const usage = payload?.usage
    ? {
        promptTokens: payload.usage.prompt_tokens,
        completionTokens: payload.usage.completion_tokens,
      }
    : undefined;
  return { content: typeof content === 'string' ? content : '', usage };
}

/** 一次性完成调用 */
export async function chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.3,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;
    if (options.jsonMode) body.response_format = { type: 'json_object' };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) throw describeError(response.status, raw);

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new AIError('server', `返回内容不是合法 JSON：${raw.slice(0, 200)}`);
    }
    if (payload?.error) {
      throw new AIError('server', payload.error.message ?? '模型返回错误');
    }
    const { content, usage } = extractContent(payload);
    if (!content.trim()) {
      throw new AIError('empty', '模型未返回内容，请更换模型或稍后重试');
    }
    return { content, usage, model: payload?.model ?? options.model };
  } catch (error) {
    if (error instanceof AIError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new AIError('timeout', 'AI 请求超时或被取消');
    }
    throw new AIError('network', `无法连接 AI 服务：${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** 流式调用，逐段回调增量文本 */
export async function chatStream(
  messages: ChatMessage[],
  options: ChatOptions,
  onDelta: (delta: string) => void,
): Promise<ChatResponse> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 180000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.3,
      stream: true,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      throw describeError(response.status, raw);
    }
    if (!response.body) throw new AIError('server', '流式响应体为空');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let model = options.model;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed?.model) model = parsed.model;
          const delta: string = parsed?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            content += delta;
            onDelta(delta);
          }
        } catch {
          /* 忽略不完整的 SSE 分片 */
        }
      }
    }

    if (!content.trim()) throw new AIError('empty', '模型未返回内容');
    return { content, model };
  } catch (error) {
    if (error instanceof AIError) throw error;
    if ((error as Error).name === 'AbortError') throw new AIError('timeout', 'AI 请求超时或被取消');
    throw new AIError('network', `无法连接 AI 服务：${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** 宽松解析模型返回的 JSON（容忍 Markdown 代码围栏与前后缀文本） */
export function parseJsonLoose<T>(text: string): T | undefined {
  if (!text) return undefined;
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    /* 继续尝试截取最外层对象 */
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** 有界并发映射，避免对模型接口造成突发压力 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
