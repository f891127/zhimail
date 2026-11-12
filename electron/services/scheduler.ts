/**
 * 自动简报调度：应用运行期间每分钟检查一次是否到达设定时间。
 * 计算「最近一个已结束的统计周期」，同一周期只生成一次（以 lastRun 记录防止重复）。
 */

import { store } from './store';
import { generateBrief } from './brief';
import type { Brief, BriefKind } from './types';

export interface SchedulePeriod {
  kind: BriefKind;
  start: number;
  end: number;
  key: string;
  /** 本次周期应当触发的时刻 */
  dueAt: number;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseTime(time: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return { hour: 8, minute: 30 };
  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2]))),
  };
}

/** 计算指定频率在 now 时刻对应的「最近一个已完成周期」 */
export function computePeriod(
  kind: BriefKind,
  now: Date,
  options: { time: string; weekday: number; dayOfMonth: number },
): SchedulePeriod {
  const { hour, minute } = parseTime(options.time);

  if (kind === 'daily') {
    const today = startOfDay(now);
    const due = new Date(today);
    due.setHours(hour, minute, 0, 0);
    const end = due.getTime() > now.getTime() ? today.getTime() - 86400000 : today.getTime();
    const start = end - 86400000;
    return { kind, start, end: end - 1, key: `daily:${end}`, dueAt: due.getTime() - (end < today.getTime() ? 86400000 : 0) };
  }

  if (kind === 'weekly') {
    const today = startOfDay(now);
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const thisMonday = new Date(today.getTime() - (dayOfWeek - 1) * 86400000);
    const weekday = Math.min(7, Math.max(1, options.weekday));
    const due = new Date(thisMonday.getTime() + (weekday - 1) * 86400000);
    due.setHours(hour, minute, 0, 0);
    const monday = due.getTime() > now.getTime()
      ? thisMonday.getTime() - 7 * 86400000
      : thisMonday.getTime();
    return {
      kind,
      start: monday - 7 * 86400000,
      end: monday - 1,
      key: `weekly:${monday}`,
      dueAt: due.getTime(),
    };
  }

  // monthly
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const day = Math.min(28, Math.max(1, options.dayOfMonth));
  const due = new Date(thisMonthStart);
  due.setDate(day);
  due.setHours(hour, minute, 0, 0);
  const monthStart =
    due.getTime() > now.getTime()
      ? new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
      : thisMonthStart.getTime();
  return {
    kind,
    start: new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() - 1, 1).getTime(),
    end: monthStart - 1,
    key: `monthly:${monthStart}`,
    dueAt: due.getTime(),
  };
}

export class BriefScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private onGenerated?: (brief: Brief) => void;
  private onError?: (message: string) => void;

  start(options: { onGenerated: (brief: Brief) => void; onError?: (message: string) => void }): void {
    this.onGenerated = options.onGenerated;
    this.onError = options.onError;
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()): Promise<Brief | undefined> {
    const settings = store.getSettings().brief;
    if (!settings.autoEnabled || this.running) return undefined;

    const period = computePeriod(settings.frequency, now, settings);
    if (now.getTime() < period.dueAt) return undefined;
    if (settings.lastRun?.[period.key]) return undefined;
    if (!store.getSettings().ai.hasApiKey) {
      this.onError?.('自动简报已开启，但尚未配置 AI API Key');
      return undefined;
    }

    this.running = true;
    try {
      const brief = await generateBrief(
        {
          rangeStart: period.start,
          rangeEnd: period.end,
          scope: settings.scope === 'inbox' ? 'inbox' : 'all',
          briefKind: period.kind,
          auto: true,
        },
        { onProgress: () => undefined },
      );
      store.updateSettings({
        brief: {
          ...store.getSettings().brief,
          lastRun: { ...(store.getSettings().brief.lastRun ?? {}), [period.key]: Date.now() },
        },
      });
      this.onGenerated?.(brief);
      return brief;
    } catch (error) {
      this.onError?.((error as Error).message);
      return undefined;
    } finally {
      this.running = false;
    }
  }
}

export const briefScheduler = new BriefScheduler();
