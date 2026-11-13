/**
 * AI 任务编排层。
 * 统一负责：从设置解析调用参数、控制上下文长度、分批压缩、结构化结果解析与降级。
 */

import { chat, AIError, mapLimit, parseJsonLoose } from './client';
import { store } from '../store';
import { groupThreads } from '../thread';
import {
  SYSTEM_MAIL_ANALYST,
  formatAddress,
  formatDate,
  promptBatchDigest,
  promptComposeAssist,
  promptExtractTodos,
  promptFinalDigest,
  promptPing,
  promptReplySuggestions,
  promptSearchInterpret,
  promptSummarizeMessage,
  promptSummarizeThread,
  promptTranslate,
  promptTriage,
  truncate,
} from './prompts';
import type {
  AnalysisStats,
  AISettings,
  BriefKind,
  ComposeAssistParams,
  MessageMeta,
  RangeAnalysis,
  RangeAnalysisParams,
  ReplySuggestion,
  SearchInterpretation,
  TodoDraft,
  TriageResult,
} from '../types';
import { heuristicParse } from '../search';

/** 单批上下文预算（字符数），超出即分批压缩 */
const BATCH_CHARS = 9000;
const MAX_BATCHES = 12;

export function resolveOptions(override?: Partial<AISettings>) {
  const settings = { ...store.getSettings().ai, ...(override ?? {}) };
  const apiKey = store.getAIKey();
  return {
    settings,
    options: {
      baseUrl: settings.baseUrl,
      apiKey,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      timeoutMs: settings.timeoutMs,
    },
  };
}

function requireKey(settings: AISettings): void {
  if (!settings.model?.trim()) throw new AIError('config', '尚未配置模型名称，请到「设置 → AI 助手」中选择模型');
  if (!store.getAIKey() && settings.provider !== 'ollama') {
    throw new AIError('config', '尚未配置 API Key，请到「设置 → AI 助手」中填写');
  }
}

/** 邮件正文压缩为适合上下文的文本 */
function bodyForAI(meta: MessageMeta, htmlText?: string, text?: string): string {
  const settings = store.getSettings().ai;
  if (settings.metadataOnly) {
    return `（已开启隐私模式，不发送正文）主题：${meta.subject}；发件人：${formatAddress(meta.from)}`;
  }
  const content = text || htmlText || meta.snippet || '';
  return truncate(content.replace(/\n{3,}/g, '\n\n').trim(), 12000);
}

function loadBody(messageId: string): { text?: string; html?: string } {
  const meta = store.getMessageMeta(messageId);
  if (!meta) return {};
  const body = store.getMessageBody(meta.accountId, meta.folderId, meta.uid);
  return { text: body?.text, html: body?.html };
}

/* ------------------------------ 连接测试 ------------------------------ */

export async function testAIConnection(override?: Partial<AISettings> & { apiKey?: string }) {
  const settings = { ...store.getSettings().ai, ...(override ?? {}) };
  const apiKey = override?.apiKey || store.getAIKey();
  if (!apiKey && settings.provider !== 'ollama') {
    throw new AIError('config', '请先填写 API Key');
  }
  const response = await chat(
    [
      { role: 'system', content: '你是一个连通性测试助手。' },
      { role: 'user', content: promptPing() },
    ],
    {
      baseUrl: settings.baseUrl,
      apiKey,
      model: settings.model,
      temperature: 0,
      maxTokens: 64,
      timeoutMs: Math.min(settings.timeoutMs, 45000),
    },
  );
  return { ok: true, reply: response.content.trim(), model: response.model };
}

/* ------------------------------ 单封摘要 ------------------------------ */

export async function summarizeMessage(messageId: string): Promise<string> {
  const meta = store.getMessageMeta(messageId);
  if (!meta) throw new AIError('config', '找不到这封邮件');
  const { settings, options } = resolveOptions();
  requireKey(settings);
  const body = loadBody(messageId);
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_MAIL_ANALYST },
      {
        role: 'user',
        content: promptSummarizeMessage(
          meta,
          bodyForAI(meta, body.html, body.text),
          meta.hasAttachments,
        ),
      },
    ],
    options,
  );
  return response.content.trim();
}

/* ------------------------------ 会话摘要 ------------------------------ */

export async function summarizeThread(threadId: string): Promise<{ markdown: string; count: number }> {
  const metas = store.queryMessages({ threadId, limit: 200, sortDir: 'asc' }).items;
  if (!metas.length) throw new AIError('config', '找不到这个会话的邮件');
  const { settings, options } = resolveOptions();
  requireKey(settings);

  const lines = metas
    .map((meta, index) => {
      const body = loadBody(meta.id);
      const content = bodyForAI(meta, body.html, body.text);
      return `【第 ${index + 1} 封】${formatDate(meta.date)}｜${formatAddress(meta.from)}｜${meta.subject}\n${truncate(content, 2600)}`;
    })
    .join('\n\n');

  const response = await chat(
    [
      { role: 'system', content: SYSTEM_MAIL_ANALYST },
      {
        role: 'user',
        content: promptSummarizeThread(
          truncate(lines, 24000),
          metas[metas.length - 1].subject,
          metas.length,
        ),
      },
    ],
    options,
  );
  return { markdown: response.content.trim(), count: metas.length };
}

/* ------------------------------ 区间汇总 ------------------------------ */

function buildStats(messages: MessageMeta[]): AnalysisStats {
  const senderMap = new Map<string, number>();
  const dayMap = new Map<string, number>();
  let unread = 0;
  let withAttachment = 0;
  for (const meta of messages) {
    if (!meta.flags.includes('\\Seen')) unread += 1;
    if (meta.hasAttachments) withAttachment += 1;
    const name = meta.from[0]?.name || meta.from[0]?.address || '未知发件人';
    senderMap.set(name, (senderMap.get(name) ?? 0) + 1);
    const day = formatDate(meta.date).slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const senders = [...senderMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const busiest = [...dayMap.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    total: messages.length,
    unread,
    withAttachment,
    senders,
    busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : { day: '-', count: 0 },
  };
}

function compactLine(meta: MessageMeta, maxBody: number): string {
  const body = loadBody(meta.id);
  const content = bodyForAI(meta, body.html, body.text).replace(/\s+/g, ' ').slice(0, maxBody);
  return `- [${formatDate(meta.date)}] ${formatAddress(meta.from)}｜${meta.subject}${meta.hasAttachments ? '（含附件）' : ''}\n  ${content}`;
}

function rangeLabel(start: number, end: number): string {
  return `${formatDate(start)} 至 ${formatDate(end)}`;
}

function scopeLabel(params: RangeAnalysisParams): string {
  switch (params.scope) {
    case 'folder': {
      const folder = params.folderId ? store.getFolder(params.folderId) : undefined;
      return folder ? `文件夹「${folder.name}」` : '指定文件夹';
    }
    case 'inbox':
      return '全部账户收件箱';
    case 'filtered':
      return `筛选条件（${[params.from ? `发件人含「${params.from}」` : '', params.keyword ? `关键词「${params.keyword}」` : '']
        .filter(Boolean)
        .join('，')}）`;
    default:
      return '全部邮件';
  }
}

export function collectRangeMessages(params: RangeAnalysisParams): MessageMeta[] {
  const options: Parameters<typeof store.listMessagesInRange>[2] = {};
  if (params.scope === 'folder' && params.folderId) options.folderId = params.folderId;
  if (params.scope === 'account' && params.accountId) options.accountId = params.accountId;
  if (params.scope === 'filtered') {
    if (params.from) options.from = params.from;
    if (params.keyword) options.keyword = params.keyword;
  }
  const messages = store.listMessagesInRange(params.rangeStart, params.rangeEnd, options);
  // 收件箱范围默认排除已删除与草稿
  if (params.scope === 'inbox' || params.scope === 'all' || params.scope === 'account') {
    return messages.filter((meta) => {
      const folder = store.getFolder(meta.folderId);
      return folder ? !['trash', 'draft'].includes(folder.kind) : true;
    });
  }
  return messages;
}

/** 本地统计版简报：不调用大模型，只用邮件元数据生成结构化汇总 */
function localAnalysis(
  params: RangeAnalysisParams,
  messages: MessageMeta[],
  stats: ReturnType<typeof buildStats>,
): RangeAnalysis {
  const range = rangeLabel(params.rangeStart, params.rangeEnd);
  const unread = messages.filter((meta) => !meta.flags.includes('\\Seen'));
  const withAttachment = messages.filter((meta) => meta.hasAttachments);
  const urgent = messages.filter((meta) =>
    /(请|审批|确认|回复|截止|紧急|待办|期限|提醒)/.test(meta.subject),
  );
  const lines: string[] = [];
  lines.push(`## 一、总体概况`);
  lines.push(
    `- 时间范围：${range}`,
    `- 邮件总数：${stats.total} 封（未读 ${stats.unread} 封，含附件 ${stats.withAttachment} 封）`,
    `- 邮件最多的一天：${stats.busiestDay.day}（${stats.busiestDay.count} 封）`,
    `- 说明：本简报由本地统计生成（未配置 AI Key），只统计元数据，不解析正文。`,
  );
  lines.push(`\n## 二、发件人分布`);
  lines.push(stats.senders.map((item) => `- ${item.name}：${item.count} 封`).join('\n') || '- 无');
  lines.push(`\n## 三、需要优先查看（${Math.min(urgent.length, 12)} 条）`);
  lines.push(
    urgent
      .slice(0, 12)
      .map((meta) => `- ${formatDate(meta.date).slice(0, 10)}｜${formatAddress(meta.from)}｜${meta.subject}`)
      .join('\n') || '- 无',
  );
  lines.push(`\n## 四、未读邮件（${Math.min(unread.length, 12)} 条）`);
  lines.push(
    unread
      .slice(0, 12)
      .map((meta) => `- ${formatDate(meta.date).slice(0, 10)}｜${formatAddress(meta.from)}｜${meta.subject}`)
      .join('\n') || '- 无',
  );
  lines.push(`\n## 五、附件清单（${Math.min(withAttachment.length, 12)} 条）`);
  lines.push(
    withAttachment
      .slice(0, 12)
      .map((meta) => `- ${meta.subject}（${formatAddress(meta.from)}）`)
      .join('\n') || '- 无',
  );
  lines.push(
    `\n> 想要 AI 写的结论、风险判断与待办拆解，请到「设置 → AI 助手」填写 API Key 后重新生成。`,
  );

  const todos: TodoDraft[] = urgent.slice(0, 8).map((meta) => ({
    title: meta.subject.slice(0, 60),
    detail: `${formatAddress(meta.from)}｜${formatDate(meta.date).slice(0, 10)}`,
    priority: meta.flags.includes('\\Seen') ? 'medium' : 'high',
    sourceMessageId: meta.id,
  }));

  return {
    markdown: lines.join('\n'),
    stats,
    messageIds: messages.map((meta) => meta.id),
    todos,
    batches: 0,
    model: '本地统计',
    provider: 'local',
  };
}

export async function analyzeRange(
  params: RangeAnalysisParams,
  hooks?: { onProgress?: (message: string) => void },
): Promise<RangeAnalysis> {
  const { settings, options } = resolveOptions();

  const messages = collectRangeMessages(params).sort((a, b) => b.date - a.date);
  if (!messages.length) {
    throw new AIError('empty', '所选时间范围内没有邮件，请调整时间范围或分析范围');
  }
  const stats = buildStats(messages);

  // 未配置大模型时不再直接失败，改为生成「统计版简报」：邮件量、发件人、待关注邮件都在本地算
  if (!settings.model?.trim() || (!options.apiKey && settings.provider !== 'ollama')) {
    hooks?.onProgress?.('未配置 AI Key，已改为本地统计版简报');
    return localAnalysis(params, messages, stats);
  }
  requireKey(settings);
  const scope = scopeLabel(params);
  const range = rangeLabel(params.rangeStart, params.rangeEnd);
  const statsLine = `共 ${stats.total} 封（未读 ${stats.unread} 封，含附件 ${stats.withAttachment} 封）；邮件量最高的一天：${stats.busiestDay.day}（${stats.busiestDay.count} 封）；主要发件人：${stats.senders
    .map((s) => `${s.name}(${s.count})`)
    .join('、')}`;

  // 组装批次
  const perMessageBudget = messages.length > 120 ? 260 : messages.length > 60 ? 400 : 700;
  const blocks = messages.map((meta) => compactLine(meta, perMessageBudget));
  const batches: string[][] = [];
  let current: string[] = [];
  let currentSize = 0;
  for (const block of blocks) {
    if (currentSize + block.length > BATCH_CHARS && current.length) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(block);
    currentSize += block.length;
  }
  if (current.length) batches.push(current);

  const limitedBatches = batches.slice(0, MAX_BATCHES);
  const truncatedNotice =
    batches.length > MAX_BATCHES
      ? `\n\n> 说明：本次共 ${batches.length} 批邮件，已分析最新的 ${MAX_BATCHES} 批（约 ${limitedBatches.reduce(
          (sum, b) => sum + b.length,
          0,
        )} 封），其余邮件未纳入本次汇总。`
      : '';

  let material: string;
  if (limitedBatches.length === 1) {
    material = limitedBatches[0].join('\n');
    hooks?.onProgress?.(`正在分析 ${messages.length} 封邮件…`);
  } else {
    hooks?.onProgress?.(`邮件较多，正在分 ${limitedBatches.length} 批压缩…`);
    const digests = await mapLimit(limitedBatches, 3, async (batch, index) => {
      hooks?.onProgress?.(`正在处理第 ${index + 1}/${limitedBatches.length} 批…`);
      const response = await chat(
        [
          { role: 'system', content: SYSTEM_MAIL_ANALYST },
          {
            role: 'user',
            content: promptBatchDigest(
              `第 ${index + 1} 批，共 ${batch.length} 封`,
              batch.join('\n'),
            ),
          },
        ],
        options,
      );
      return `#### 批次 ${index + 1}（${batch.length} 封）\n${response.content.trim()}`;
    });
    material = digests.join('\n\n');
  }

  hooks?.onProgress?.('正在生成汇总报告…');
  const finalResponse = await chat(
    [
      { role: 'system', content: SYSTEM_MAIL_ANALYST },
      {
        role: 'user',
        content: promptFinalDigest(range, scope, statsLine, truncate(material, 30000)),
      },
    ],
    options,
  );

  const markdown = `${finalResponse.content.trim()}${truncatedNotice}`;

  hooks?.onProgress?.('正在提取待办事项…');
  let todos: TodoDraft[] = [];
  try {
    todos = await extractTodos(`${statsLine}\n\n${truncate(material, 20000)}`);
  } catch (error) {
    console.warn('[ai] 待办抽取失败，跳过', (error as Error).message);
  }

  return {
    markdown,
    stats,
    messageIds: messages.map((m) => m.id),
    todos,
    batches: limitedBatches.length,
    model: settings.model,
    provider: settings.provider,
  };
}

/* ------------------------------ 待办抽取 ------------------------------ */

export async function extractTodos(material: string): Promise<TodoDraft[]> {
  const { settings, options } = resolveOptions();
  requireKey(settings);
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_MAIL_ANALYST },
      { role: 'user', content: promptExtractTodos(material) },
    ],
    { ...options, jsonMode: true, maxTokens: Math.min(options.maxTokens, 2000) },
  );
  const parsed = parseJsonLoose<{ todos?: TodoDraft[] }>(response.content);
  if (!parsed?.todos) return [];
  return parsed.todos
    .filter((todo) => todo?.title)
    .slice(0, 30)
    .map((todo) => ({
      title: String(todo.title).slice(0, 120),
      detail: todo.detail ? String(todo.detail).slice(0, 300) : undefined,
      due: todo.due && /^\d{4}-\d{2}-\d{2}/.test(todo.due) ? todo.due : null,
      priority:
        todo.priority === 'high' || todo.priority === 'low' ? todo.priority : ('medium' as const),
      sourceSubject: todo.sourceSubject,
    }));
}

export async function extractTodosFromMessage(messageId: string): Promise<TodoDraft[]> {
  const meta = store.getMessageMeta(messageId);
  if (!meta) throw new AIError('config', '找不到这封邮件');
  const body = loadBody(messageId);
  const content = `主题：${meta.subject}\n发件人：${formatAddress(meta.from)}\n时间：${formatDate(
    meta.date,
  )}\n\n${bodyForAI(meta, body.html, body.text)}`;
  const todos = await extractTodos(content);
  return todos.map((todo) => ({
    ...todo,
    sourceMessageId: meta.id,
    sourceSubject: meta.subject,
    sourceFrom: formatAddress(meta.from),
    sourceFolderId: meta.folderId,
  }));
}

/* ------------------------------ 回复建议 ------------------------------ */

export async function suggestReplies(messageId: string): Promise<ReplySuggestion[]> {
  const meta = store.getMessageMeta(messageId);
  if (!meta) throw new AIError('config', '找不到这封邮件');
  const { settings, options } = resolveOptions();
  requireKey(settings);
  const body = loadBody(messageId);
  const senderName = meta.from[0]?.name || meta.from[0]?.address?.split('@')[0] || '您好';

  const response = await chat(
    [
      { role: 'system', content: SYSTEM_MAIL_ANALYST },
      {
        role: 'user',
        content: promptReplySuggestions(meta, bodyForAI(meta, body.html, body.text), senderName),
      },
    ],
    { ...options, jsonMode: true },
  );

  const parsed = parseJsonLoose<{ suggestions?: { tone: string; body: string }[] }>(
    response.content,
  );
  const labels: Record<string, string> = { formal: '正式', concise: '简洁', friendly: '友好' };
  if (!parsed?.suggestions?.length) {
    // 结构化失败时把整段文本作为一条「AI 草稿」返回，避免功能不可用
    return [{ tone: 'formal', label: 'AI 草稿', body: response.content.trim() }];
  }
  return parsed.suggestions.slice(0, 3).map((item) => ({
    tone: (item.tone as ReplySuggestion['tone']) ?? 'formal',
    label: labels[item.tone] ?? '建议',
    body: String(item.body ?? '').trim(),
  }));
}

/* ------------------------------ 写作辅助 ------------------------------ */

export async function composeAssist(params: ComposeAssistParams): Promise<string> {
  const { settings, options } = resolveOptions();
  requireKey(settings);
  if (!params.text?.trim() && params.action !== 'continue') {
    throw new AIError('config', '请先输入邮件内容，再使用写作辅助');
  }
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_MAIL_ANALYST },
      { role: 'user', content: promptComposeAssist(params) },
    ],
    { ...options, temperature: 0.5, maxTokens: Math.min(options.maxTokens, 1600) },
  );
  return response.content.trim();
}

/* ------------------------------ 翻译 ------------------------------ */

export async function translateMessage(
  messageId: string,
  targetLanguage: '中文' | 'English',
): Promise<{ subject: string; body: string; engine: 'llm' | 'builtin' }> {
  const meta = store.getMessageMeta(messageId);
  if (!meta) throw new AIError('config', '找不到这封邮件');
  const body = loadBody(messageId);
  const plain = bodyForAI(meta, body.html, body.text);
  const engine = store.getSettings().translate?.engine ?? 'auto';
  const result = await translateText(plain, targetLanguage, engine);
  const subject = meta.subject
    ? (await translateText(meta.subject, targetLanguage, engine)).text
    : '';
  return { subject, body: result.text, engine: result.engine };
}

/* ------------------------------ 重要度判定 ------------------------------ */

export async function triageMessage(messageId: string): Promise<TriageResult> {
  const meta = store.getMessageMeta(messageId);
  if (!meta) throw new AIError('config', '找不到这封邮件');
  const { settings, options } = resolveOptions();
  requireKey(settings);
  const body = loadBody(messageId);
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_MAIL_ANALYST },
      { role: 'user', content: promptTriage(meta, bodyForAI(meta, body.html, body.text)) },
    ],
    { ...options, jsonMode: true, maxTokens: 500 },
  );
  const parsed = parseJsonLoose<TriageResult>(response.content);
  if (!parsed) throw new AIError('server', 'AI 返回的重要度判定无法解析');
  return {
    importance: parsed.importance ?? 'normal',
    urgency: parsed.urgency ?? 'normal',
    reason: parsed.reason ?? '',
    labels: Array.isArray(parsed.labels) ? parsed.labels.slice(0, 3) : [],
  };
}

/* ------------------------------ 智能搜索 ------------------------------ */

export async function interpretSearch(text: string): Promise<SearchInterpretation> {
  const fallback: SearchInterpretation = {
    explanation: '已按关键词与时间条件进行本地检索',
    query: heuristicParse(text),
    usedAI: false,
  };
  try {
    const { settings, options } = resolveOptions();
    requireKey(settings);
    const today = formatDate(Date.now()).slice(0, 10);
    const response = await chat(
      [
        { role: 'system', content: SYSTEM_MAIL_ANALYST },
        { role: 'user', content: promptSearchInterpret(text, today) },
      ],
      { ...options, jsonMode: true, maxTokens: 600, temperature: 0 },
    );
    const parsed = parseJsonLoose<{ query?: Record<string, unknown>; explanation?: string }>(
      response.content,
    );
    if (!parsed?.query) return fallback;
    const raw = parsed.query as Record<string, any>;
    return {
      explanation: parsed.explanation ?? 'AI 已解析检索条件',
      usedAI: true,
      query: {
        text: typeof raw.text === 'string' ? raw.text : '',
        from: typeof raw.from === 'string' && raw.from ? raw.from : undefined,
        since: typeof raw.since === 'number' && raw.since > 0 ? raw.since : undefined,
        until: typeof raw.until === 'number' && raw.until > 0 ? raw.until : undefined,
        hasAttachment: Boolean(raw.hasAttachment),
        unreadOnly: Boolean(raw.unreadOnly),
      },
    };
  } catch (error) {
    return { ...fallback, fallbackReason: (error as Error).message };
  }
}

/* ------------------------------ 会话聚合辅助 ------------------------------ */

export function threadsOf(messages: MessageMeta[]) {
  return groupThreads(messages);
}

export type { BriefKind };
import { translateText } from '../translate';
