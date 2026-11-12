/** 本地检索：结构化条件 + 关键词匹配；AI 负责把自然语言翻译为这些条件 */

import { store } from './store';
import type { MessageMeta, SearchQuery } from './types';

const CN_DATE_WORDS: { pattern: RegExp; days: number }[] = [
  { pattern: /今天|今日/, days: 1 },
  { pattern: /昨天|昨日/, days: 2 },
  { pattern: /本周|这周|这一周/, days: 7 },
  { pattern: /上周|上一周/, days: 14 },
  { pattern: /本月|这个月/, days: 31 },
  { pattern: /上月|上个月/, days: 62 },
  { pattern: /近一周|最近一周|近7天/, days: 7 },
  { pattern: /近一月|最近一月|近30天/, days: 30 },
];

/** 不依赖大模型的关键词兜底解析，保证 AI 不可用时搜索仍然可用 */
export function heuristicParse(text: string): SearchQuery {
  const query: SearchQuery = { text: '' };
  const raw = (text || '').trim();
  if (!raw) return query;

  for (const rule of CN_DATE_WORDS) {
    if (rule.pattern.test(raw)) {
      const now = Date.now();
      if (/昨天|昨日/.test(raw)) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        query.since = start.getTime() - 24 * 3600 * 1000;
        query.until = start.getTime() - 1;
      } else if (/上周|上一周/.test(raw)) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const day = start.getDay() === 0 ? 7 : start.getDay();
        const thisMonday = start.getTime() - (day - 1) * 24 * 3600 * 1000;
        query.since = thisMonday - 7 * 24 * 3600 * 1000;
        query.until = thisMonday - 1;
      } else {
        query.since = now - rule.days * 24 * 3600 * 1000;
      }
      break;
    }
  }

  if (/附件/.test(raw)) query.hasAttachment = true;
  if (/未读/.test(raw)) query.unreadOnly = true;

  const fromMatch = raw.match(/(?:来自|发件人|由)\s*([\u4e00-\u9fa5A-Za-z0-9._%+-]{2,30})/);
  if (fromMatch) query.from = fromMatch[1];

  const cleaned = raw
    .replace(/(?:来自|发件人|由)\s*[\u4e00-\u9fa5A-Za-z0-9._%+-]{2,30}/g, ' ')
    .replace(/的?邮件|邮件|邮箱|帮我|查找|搜索|找一下|找找|有没有|所有|关于|最近|上周|本周|本月|上月|昨天|今天|近\d+天|近[一二]周|近[一二]月/g, ' ')
    .replace(/[\s,，。？?]+/g, ' ')
    .trim();
  query.text = cleaned;
  return query;
}

export function runSearch(query: SearchQuery): MessageMeta[] {
  const keyword = (query.text ?? '').trim();
  const base = store.queryMessages({
    folderId: query.folderId,
    from: query.from,
    since: query.since,
    until: query.until,
    hasAttachment: query.hasAttachment,
    unreadOnly: query.unreadOnly,
    keyword: keyword || undefined,
    limit: 500,
    sortBy: 'date',
    sortDir: 'desc',
  });

  if (base.items.length) return base.items;

  // 关键词整体未命中时，退化为分词匹配（中文按 2 字滑窗）
  if (keyword.length >= 2) {
    const tokens = new Set<string>();
    for (let i = 0; i < keyword.length - 1; i += 1) tokens.add(keyword.slice(i, i + 2));
    const candidates = store.queryMessages({
      folderId: query.folderId,
      from: query.from,
      since: query.since,
      until: query.until,
      hasAttachment: query.hasAttachment,
      unreadOnly: query.unreadOnly,
      limit: 1000,
    }).items;
    const scored = candidates
      .map((meta) => {
        const haystack = `${meta.subject} ${meta.snippet} ${meta.from
          .map((a) => a.name ?? a.address)
          .join(' ')}`;
        let score = 0;
        for (const token of tokens) if (haystack.includes(token)) score += 1;
        return { meta, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.meta.date - a.meta.date)
      .slice(0, 200)
      .map((item) => item.meta);
    return scored;
  }

  return [];
}
