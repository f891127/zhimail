/**
 * 会话串聚合：
 * 依据 References / In-Reply-To 与主题归一（去 Re:/Fwd:/答复:/转发:）把邮件归入同一会话。
 * 采用「消息 ID → 会话 ID」「主题键 → 会话 ID」双映射，缺头信息时也能按主题归并。
 */

import crypto from 'node:crypto';
import type { MailAddress, MessageMeta } from './types';

const REPLY_PREFIX = /^\s*(?:(?:re|fw|fwd|aw|sv|答复|回复|转发|转)\s*[:：]\s*)+/i;

export function normalizeSubject(subject: string): string {
  let value = (subject || '').replace(REPLY_PREFIX, '').trim();
  // 去掉邮件列表常见的 [标签] 前缀差异，保留内容主体
  value = value.replace(/\s+/g, ' ');
  return value.toLowerCase() || '(无主题)';
}

export function subjectKey(subject: string): string {
  return `subj:${normalizeSubject(subject)}`;
}

export function hashId(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 16);
}

export interface ThreadSummary {
  threadId: string;
  subject: string;
  messages: MessageMeta[];
  participants: MailAddress[];
  latestDate: number;
  count: number;
  unread: number;
  hasAttachments: boolean;
}

interface ResolverState {
  byMessageId: Map<string, string>;
  bySubject: Map<string, string>;
}

/** 从已有邮件重建解析状态 */
export function buildResolver(messages: MessageMeta[]): ResolverState {
  const byMessageId = new Map<string, string>();
  const bySubject = new Map<string, string>();
  for (const meta of messages) {
    if (meta.messageId) byMessageId.set(meta.messageId, meta.threadId ?? meta.id);
    if (meta.threadId) bySubject.set(subjectKey(meta.subject), meta.threadId);
  }
  return { byMessageId, bySubject };
}

/**
 * 为一批新邮件分配 threadId。
 * 已带 threadId 的邮件保持原值；其余按引用链或主题归并。
 */
export function assignThreadIds(messages: MessageMeta[], existing: MessageMeta[]): MessageMeta[] {
  const { byMessageId, bySubject } = buildResolver(existing);
  for (const meta of messages) {
    if (meta.threadId) {
      if (meta.messageId) byMessageId.set(meta.messageId, meta.threadId);
      bySubject.set(subjectKey(meta.subject), meta.threadId);
    }
  }

  for (const meta of messages) {
    if (meta.threadId) continue;
    let threadId: string | undefined;

    const refs = [...(meta.references ?? [])];
    if (meta.inReplyTo) refs.push(meta.inReplyTo);
    for (const ref of refs) {
      const hit = byMessageId.get(ref);
      if (hit) {
        threadId = hit;
        break;
      }
    }

    if (!threadId) {
      const hit = bySubject.get(subjectKey(meta.subject));
      if (hit) threadId = hit;
    }

    if (!threadId) {
      threadId = meta.messageId ? hashId(meta.messageId) : hashId(`${meta.subject}|${meta.date}`);
    }

    meta.threadId = threadId;
    if (meta.messageId) byMessageId.set(meta.messageId, threadId);
    bySubject.set(subjectKey(meta.subject), threadId);
  }

  return messages;
}

/** 把邮件列表聚合成会话列表（按最新时间倒序） */
export function groupThreads(messages: MessageMeta[]): ThreadSummary[] {
  const map = new Map<string, MessageMeta[]>();
  for (const meta of messages) {
    const key = meta.threadId ?? meta.id;
    const list = map.get(key);
    if (list) list.push(meta);
    else map.set(key, [meta]);
  }

  const summaries: ThreadSummary[] = [];
  for (const [threadId, list] of map) {
    list.sort((a, b) => a.date - b.date);
    const participantMap = new Map<string, MailAddress>();
    for (const meta of list) {
      for (const address of meta.from) participantMap.set(address.address, address);
    }
    summaries.push({
      threadId,
      subject: list[list.length - 1].subject,
      messages: list,
      participants: [...participantMap.values()],
      latestDate: list[list.length - 1].date,
      count: list.length,
      unread: list.filter((m) => !m.flags.includes('\\Seen')).length,
      hasAttachments: list.some((m) => m.hasAttachments),
    });
  }
  return summaries.sort((a, b) => b.latestDate - a.latestDate);
}

/** 邮件线程排序键：用于把会话内邮件按时间线展开 */
export function sortThreadMessages(messages: MessageMeta[]): MessageMeta[] {
  return [...messages].sort((a, b) => a.date - b.date);
}
