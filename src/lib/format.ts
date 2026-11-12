/** 日期、大小、地址等展示格式化工具 */

import type { MailAddress } from '@/types/zhimail';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** 列表用时间：今天显示 HH:mm，本周显示「周三」，更早显示 MM-DD 或 YYYY-MM-DD */
export function listTime(ts: number): string {
  const date = new Date(ts);
  const today = startOfDay(new Date()).getTime();
  const day = startOfDay(date).getTime();
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (diff === 1) return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (diff > 1 && diff < 7) return `周${WEEKDAYS[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() === new Date().getFullYear()) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fullTime(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function dateOnly(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function weekdayLabel(ts: number): string {
  return `周${WEEKDAYS[new Date(ts).getDay()]}`;
}

export function fileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function addressLabel(addresses: MailAddress[] | undefined, fallback = '（无收件人）'): string {
  if (!addresses || !addresses.length) return fallback;
  return addresses
    .map((item) => item.name || item.address)
    .filter(Boolean)
    .join('、');
}

export function senderName(addresses: MailAddress[] | undefined): string {
  if (!addresses || !addresses.length) return '（未知发件人）';
  const first = addresses[0];
  return first.name || first.address.split('@')[0];
}

export function shortAddress(address: string): string {
  return address.length > 34 ? `${address.slice(0, 31)}…` : address;
}

export function isToday(ts: number): boolean {
  return startOfDay(new Date(ts)).getTime() === startOfDay(new Date()).getTime();
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`;
  return dateOnly(ts);
}

export function dueLabel(due?: string | null): { text: string; tone: 'overdue' | 'soon' | 'normal' | 'none' } {
  if (!due) return { text: '未设置截止', tone: 'none' };
  const dueTs = Date.parse(due);
  if (Number.isNaN(dueTs)) return { text: due, tone: 'normal' };
  const days = Math.ceil((dueTs - Date.now()) / 86400000);
  if (days < 0) return { text: `已逾期 ${Math.abs(days)} 天`, tone: 'overdue' };
  if (days === 0) return { text: '今天到期', tone: 'soon' };
  if (days <= 2) return { text: `${days} 天后到期`, tone: 'soon' };
  return { text: due, tone: 'normal' };
}

export const PRIORITY_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' };
