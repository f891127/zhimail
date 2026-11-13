/**
 * 邮件简报：把「时间范围汇总分析」结果落库到独立的「邮件简报」文件夹，
 * 并支持导出 Markdown / HTML / Word（可编辑 docx）。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { store } from './store';
import { analyzeRange } from './ai/tasks';
import { createTodoItems } from './todo';
import { buildDocxBuffer } from './export/docx';
import { renderHtmlDocument } from './export/markdown';
import type { Brief, BriefGenerateParams, BriefKind, MessageMeta } from './types';

export const BRIEF_ROOT_ID = 'briefs';
export const BRIEF_GROUPS: { id: string; name: string; kind: BriefKind }[] = [
  { id: 'briefs/daily', name: '日报', kind: 'daily' },
  { id: 'briefs/weekly', name: '周报', kind: 'weekly' },
  { id: 'briefs/monthly', name: '月报', kind: 'monthly' },
  { id: 'briefs/yearly', name: '年报', kind: 'yearly' },
  { id: 'briefs/custom', name: '自定义简报', kind: 'custom' },
];

export function groupOf(kind: BriefKind): string {
  return `briefs/${kind}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultTitle(kind: BriefKind, start: number, end: number): string {
  switch (kind) {
    case 'daily':
      return `邮件日报 · ${formatDate(start)}`;
    case 'weekly':
      return `邮件周报 · ${formatDate(start)} ~ ${formatDate(end)}`;
    case 'monthly':
      return `邮件月报 · ${formatDate(start)} ~ ${formatDate(end)}`;
    case 'yearly':
      return `邮件年报 · ${formatDate(start)} ~ ${formatDate(end)}`;
    default:
      return `邮件简报 · ${formatDate(start)} ~ ${formatDate(end)}`;
  }
}

export async function generateBrief(
  params: BriefGenerateParams,
  hooks?: { onProgress?: (message: string) => void },
): Promise<Brief> {
  const analysis = await analyzeRange(params, hooks);
  const kind: BriefKind = params.briefKind ?? 'custom';
  const title = params.title?.trim() || defaultTitle(kind, params.rangeStart, params.rangeEnd);
  const id = `brief-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  const scopeText =
    params.scope === 'account'
      ? `账户「${store.getAccount(params.accountId ?? '')?.name ?? '指定账户'}」收件箱`
      : params.scope === 'folder'
      ? `文件夹「${store.getFolder(params.folderId ?? '')?.name ?? '指定文件夹'}」`
      : params.scope === 'inbox'
        ? '全部账户收件箱'
        : params.scope === 'filtered'
          ? '自定义筛选'
          : '全部邮件';

  // 为每条待办找回「来源邮件」：按标题/详情与邮件主题+正文的字面重合度打分
  const candidates = analysis.messageIds
    .map((messageId) => {
      const meta = store.getMessageMeta(messageId);
      if (!meta) return null;
      const body = store.getMessageBody(meta.accountId, meta.folderId, meta.uid);
      const text = `${meta.subject} ${body?.text?.slice(0, 1200) ?? ''}`;
      return { meta, text };
    })
    .filter((item): item is { meta: MessageMeta; text: string } => Boolean(item));
  const pickSource = (draft: { title: string; detail?: string }) => {
    const query = `${draft.title} ${draft.detail ?? ''}`;
    let best: { meta: MessageMeta; score: number } | null = null;
    for (const candidate of candidates) {
      const score = overlapScore(query, candidate.text);
      if (!best || score > best.score) best = { meta: candidate.meta, score };
    }
    return best && best.score > 0 ? best.meta : candidates[0]?.meta ?? null;
  };
  const todos = analysis.todos.map((draft) => {
    const source = pickSource(draft);
    return {
      ...draft,
      sourceMessageId: draft.sourceMessageId ?? source?.id,
      sourceSubject: draft.sourceSubject ?? source?.subject,
      sourceFrom: draft.sourceFrom ?? source?.from?.[0]?.address,
    };
  });
  const createdTodos = createTodoItems(todos, {
    briefId: id,
    sourceSubject: title,
  });

  const brief: Brief = {
    id,
    title,
    kind,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
    createdAt: Date.now(),
    provider: analysis.provider,
    model: analysis.model,
    scopeLabel: scopeText,
    messageCount: analysis.stats.total,
    todoCount: createdTodos.length,
    markdown: analysis.markdown,
    stats: analysis.stats,
    messageIds: analysis.messageIds,
    auto: Boolean(params.auto),
    group: groupOf(kind),
  };

  store.saveBrief(brief);
  return brief;
}

export function listBriefs(groupId?: string): Brief[] {
  const all = store.listBriefs();
  if (!groupId) return all;
  return all.filter((brief) => brief.group === groupId);
}

export function getBrief(id: string): Brief | undefined {
  return store.getBrief(id);
}

export function removeBrief(id: string): Brief[] {
  store.removeBrief(id);
  return store.listBriefs();
}

export interface ExportResult {
  path: string;
  filename: string;
  format: string;
}

export async function exportBrief(id: string, format: 'md' | 'html' | 'docx'): Promise<ExportResult> {
  const brief = store.getBrief(id);
  if (!brief) throw new Error('简报不存在或已被删除');

  const targetDir = path.join(app.getPath('documents'), '知邮简报');
  fs.mkdirSync(targetDir, { recursive: true });

  const safeTitle = brief.title.replace(/[\\/:*?"<>|]/g, '_');
  const meta = `统计区间：${formatDate(brief.rangeStart)} 至 ${formatDate(brief.rangeEnd)}　|　邮件 ${brief.messageCount} 封　|　待办 ${brief.todoCount} 条　|　模型 ${brief.model}（${brief.provider}）　|　生成时间 ${formatDate(brief.createdAt)}`;

  if (format === 'md') {
    const filename = `${safeTitle}.md`;
    const filePath = path.join(targetDir, filename);
    const content = `# ${brief.title}\n\n> ${meta}\n\n${brief.markdown}\n\n---\n\n由知邮 ZhiMail 自动生成\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    return { path: filePath, filename, format };
  }

  if (format === 'html') {
    const filename = `${safeTitle}.html`;
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, renderHtmlDocument(brief.title, brief.markdown, meta), 'utf8');
    return { path: filePath, filename, format };
  }

  const filename = `${safeTitle}.docx`;
  const filePath = path.join(targetDir, filename);
  const buffer = await buildDocxBuffer({ title: brief.title, meta, markdown: brief.markdown });
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, filename, format };
}

/** 粗粒度重合度：中文按二元字组、英文按词，用于给待办找最可能的来源邮件 */
function overlapScore(query: string, text: string): number {
  if (!query || !text) return 0;
  const normalize = (input: string) => input.replace(/\s+/g, '');
  const q = normalize(query);
  const t = normalize(text);
  let score = 0;
  const seen = new Set<string>();
  for (let i = 0; i < q.length - 1; i += 1) {
    const gram = q.slice(i, i + 2);
    if (!/[\u4e00-\u9fa5]/.test(gram)) continue;
    if (seen.has(gram)) continue;
    seen.add(gram);
    if (t.includes(gram)) score += 1;
  }
  for (const word of query.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []) {
    if (text.toLowerCase().includes(word)) score += 2;
  }
  return score;
}
