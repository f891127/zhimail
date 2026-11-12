/**
 * 翻译服务。
 * - builtin：内置免费引擎（Google 公共接口，失败时回退 MyMemory），无需任何 API Key；
 * - llm：使用已配置的大模型翻译，术语更贴合行业语境；
 * - auto：有可用模型时用大模型，否则用内置引擎。
 */

import { chat } from './ai/client';
import { store } from './store';

export type TranslateEngine = 'auto' | 'llm' | 'builtin';
export type TranslateTarget = '中文' | 'English';

export interface TranslateResult {
  text: string;
  engine: 'llm' | 'builtin';
  target: TranslateTarget;
}

const LANG_CODE: Record<TranslateTarget, { google: string; mymemory: string }> = {
  中文: { google: 'zh-CN', mymemory: 'zh-CN' },
  English: { google: 'en', mymemory: 'en' },
};

/** 按段落切分，保证单次请求长度可控且不破坏句子 */
function chunkText(text: string, maxLength = 1600): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((item) => item.trim());
  const chunks: string[] = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).length > maxLength && buffer) {
      chunks.push(buffer);
      buffer = paragraph;
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
    while (buffer.length > maxLength) {
      const slice = buffer.slice(0, maxLength);
      const cut = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
      const index = cut > maxLength * 0.5 ? cut + 1 : maxLength;
      chunks.push(buffer.slice(0, index));
      buffer = buffer.slice(index);
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.length ? chunks : [text];
}

async function googleTranslate(text: string, target: TranslateTarget): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=' +
    encodeURIComponent(LANG_CODE[target].google) +
    '&q=' +
    encodeURIComponent(text);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZhiMail/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`翻译服务返回 ${response.status}`);
  const payload = (await response.json()) as [Array<[string, string]>];
  const translated = (payload?.[0] ?? []).map((item) => item?.[0] ?? '').join('');
  if (!translated.trim()) throw new Error('翻译结果为空');
  return translated;
}

async function myMemoryTranslate(text: string, target: TranslateTarget): Promise<string> {
  const source = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en';
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text.slice(0, 480)) +
    '&langpair=' +
    encodeURIComponent(`${source}|${LANG_CODE[target].mymemory}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`备用翻译服务返回 ${response.status}`);
  const payload = (await response.json()) as { responseData?: { translatedText?: string } };
  const translated = payload.responseData?.translatedText ?? '';
  if (!translated.trim()) throw new Error('备用翻译结果为空');
  return translated;
}

/** 内置免费翻译：逐段翻译，Google 失败自动回退 MyMemory */
async function builtinTranslate(text: string, target: TranslateTarget): Promise<string> {
  const chunks = chunkText(text);
  const results: string[] = [];
  for (const chunk of chunks) {
    try {
      results.push(await googleTranslate(chunk, target));
    } catch (error) {
      console.warn('[translate] Google 失败，回退 MyMemory：', (error as Error).message);
      results.push(await myMemoryTranslate(chunk, target));
    }
  }
  return results.join('\n\n');
}

async function llmTranslate(text: string, target: TranslateTarget): Promise<string> {
  const settings = store.getSettings();
  if (!store.getAIKey() && settings.ai.provider !== 'ollama') {
    throw new Error('尚未配置大模型 API Key');
  }
  const chunks = chunkText(text, 3000);
  const results: string[] = [];
  for (const chunk of chunks) {
    const reply = await chat(
      [
        {
          role: 'system',
          content: `你是专业的技术文档翻译。请把用户给出的内容翻译为${target}，保持原文的段落结构、编号、单位与专有名词（如 GB 8599-2008、SAL、B-D 测试）不变。只输出译文，不要解释。`,
        },
        { role: 'user', content: chunk },
      ],
      {
        baseUrl: settings.ai.baseUrl,
        apiKey: store.getAIKey(),
        model: settings.ai.model,
        temperature: 0.1,
        maxTokens: settings.ai.maxTokens,
        timeoutMs: settings.ai.timeoutMs,
      },
    );
    results.push(reply.content.trim());
  }
  return results.join('\n\n');
}

export async function translateText(
  text: string,
  target: TranslateTarget,
  engine: TranslateEngine = 'auto',
): Promise<TranslateResult> {
  const content = (text ?? '').trim();
  if (!content) throw new Error('没有可翻译的内容');
  if (content.length > 20000) throw new Error('内容过长，请分段翻译');

  const hasKey = Boolean(store.getAIKey()) || store.getSettings().ai.provider === 'ollama';

  if (engine === 'llm' || (engine === 'auto' && hasKey)) {
    try {
      return { text: await llmTranslate(content, target), engine: 'llm', target };
    } catch (error) {
      if (engine === 'llm') throw error;
      console.warn('[translate] 大模型翻译失败，改用内置引擎：', (error as Error).message);
    }
  }
  return { text: await builtinTranslate(content, target), engine: 'builtin', target };
}

/** 检测文本主体语言，返回建议的目标语言 */
export function suggestTarget(text: string): TranslateTarget {
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return chinese >= latin ? 'English' : '中文';
}
