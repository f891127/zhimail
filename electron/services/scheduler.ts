/**
 * 自动简报调度：应用运行期间每分钟检查一次，按每一组排程各自的周期判断是否到点。
 * 计算「最近一个已结束的统计周期」，同一周期只生成一次（按排程记录 lastRun 防重复）。
 * 支持每天、每周、每月、每年以及「每 N 天」的自定义周期。
 */

import { store } from './store';
import { generateBrief } from './brief';
import type { Brief, BriefKind, BriefSchedule } from './types';

export interface SchedulePeriod {
  kind: BriefKind;
  start: number;
  end: number;
  key: string;
  /** 本次周期应当触发的时刻 */
  dueAt: number;
}

const DAY = 86400000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseTime(time: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!match) return { hour: 8, minute: 30 };
  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2]))),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 计算某组排程在 now 时刻对应的「最近一个已完成周期」 */
export function computePeriod(schedule: BriefSchedule, now: Date): SchedulePeriod {
  const { hour, minute } = parseTime(schedule.time);
  const kind = schedule.frequency;

  if (kind === 'daily') {
    const today = startOfDay(now);
    const due = new Date(today);
    due.setHours(hour, minute, 0, 0);
    const end = due.getTime() > now.getTime() ? today.getTime() - DAY : today.getTime();
    return {
      kind,
      start: end - DAY,
      end: end - 1,
      key: `daily:${end}`,
      dueAt: due.getTime() - (end < today.getTime() ? DAY : 0),
    };
  }

  if (kind === 'weekly') {
    const today = startOfDay(now);
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const thisMonday = new Date(today.getTime() - (dayOfWeek - 1) * DAY);
    const weekday = clamp(schedule.weekday, 1, 7);
    const due = new Date(thisMonday.getTime() + (weekday - 1) * DAY);
    due.setHours(hour, minute, 0, 0);
    const monday = due.getTime() > now.getTime() ? thisMonday.getTime() - 7 * DAY : thisMonday.getTime();
    return {
      kind,
      start: monday - 7 * DAY,
      end: monday - 1,
      key: `weekly:${monday}`,
      dueAt: due.getTime(),
    };
  }

  if (kind === 'monthly') {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const day = clamp(schedule.dayOfMonth, 1, 28);
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

  if (kind === 'yearly') {
    const month = clamp(schedule.month, 1, 12);
    const day = clamp(schedule.dayOfMonth, 1, 28);
    const dueThisYear = new Date(now.getFullYear(), month - 1, day, hour, minute, 0, 0);
    const dueYear = dueThisYear.getTime() > now.getTime() ? now.getFullYear() - 1 : now.getFullYear();
    const due = new Date(dueYear, month - 1, day, hour, minute, 0, 0);
    // 统计范围：到期日所在年份的上一个完整自然年
    const periodYear = dueYear - 1;
    return {
      kind,
      start: new Date(periodYear, 0, 1).getTime(),
      end: new Date(periodYear + 1, 0, 1).getTime() - 1,
      key: `yearly:${dueYear}`,
      dueAt: due.getTime(),
    };
  }

  // custom：每 N 天一次，锚点为排程创建时间（未记录时按当年 1 月 1 日）
  const days = clamp(schedule.days || 7, 1, 365);
  const step = days * DAY;
  const anchorDate = schedule.anchorAt ? new Date(schedule.anchorAt) : new Date(now.getFullYear(), 0, 1);
  const base = startOfDay(anchorDate).getTime() + hour * 3600000 + minute * 60000;
  if (now.getTime() < base) {
    return { kind: 'custom', start: base - step, end: base - 1, key: `custom:${base}`, dueAt: base };
  }
  const index = Math.floor((now.getTime() - base) / step);
  const due = base + index * step;
  return {
    kind: 'custom',
    start: due - step,
    end: due - 1,
    key: `custom:${due}`,
    dueAt: due,
  };
}

export interface ScheduleRunResult {
  scheduleId: string;
  scheduleName: string;
  brief?: Brief;
  skipped?: string;
  error?: string;
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

  /** 按当前设置检查所有排程，返回本次实际生成的结果 */
  async tick(now = new Date()): Promise<ScheduleRunResult[]> {
    const settings = store.getSettings().brief;
    if (!settings.autoEnabled || this.running) return [];
    const schedules = (settings.schedules ?? []).filter((schedule) => schedule.enabled);
    if (schedules.length === 0) return [];

    if (!store.getSettings().ai.hasApiKey) {
      this.onError?.('自动简报已开启，但尚未配置 AI API Key');
      return [];
    }

    const results: ScheduleRunResult[] = [];
    this.running = true;
    try {
      for (const schedule of schedules) {
        const period = computePeriod(schedule, now);
        if (now.getTime() < period.dueAt) continue;
        if (schedule.lastRun?.[period.key]) continue;
        results.push(await this.runSchedule(schedule, period, true));
      }
    } finally {
      this.running = false;
    }
    return results;
  }

  /** 立即生成某组排程（手动触发，同样记录 lastRun 避免与自动周期重复） */
  async runNow(scheduleId: string, now = new Date()): Promise<ScheduleRunResult> {
    const schedule = (store.getSettings().brief.schedules ?? []).find((item) => item.id === scheduleId);
    if (!schedule) return { scheduleId, scheduleName: '', error: '未找到该简报排程' };
    if (!store.getSettings().ai.hasApiKey) {
      return { scheduleId, scheduleName: schedule.name, error: '尚未配置 AI API Key' };
    }
    if (this.running) return { scheduleId, scheduleName: schedule.name, error: '已有简报正在生成，请稍后再试' };
    const period = computePeriod(schedule, now);
    this.running = true;
    try {
      return await this.runSchedule(schedule, period, false);
    } finally {
      this.running = false;
    }
  }

  private async runSchedule(
    schedule: BriefSchedule,
    period: SchedulePeriod,
    _auto: boolean,
  ): Promise<ScheduleRunResult> {
    try {
      const brief = await generateBrief(
        {
          rangeStart: period.start,
          rangeEnd: period.end,
          scope: schedule.scope === 'inbox' ? 'inbox' : 'all',
          briefKind: period.kind,
          title: `${schedule.name} · ${briefRangeSuffix(period)}`,
          auto: true,
        },
        { onProgress: () => undefined },
      );
      this.recordRun(schedule.id, period.key);
      this.onGenerated?.(brief);
      return { scheduleId: schedule.id, scheduleName: schedule.name, brief };
    } catch (error) {
      this.onError?.((error as Error).message);
      return { scheduleId: schedule.id, scheduleName: schedule.name, error: (error as Error).message };
    }
  }

  private recordRun(scheduleId: string, key: string): void {
    const settings = store.getSettings().brief;
    store.updateSettings({
      brief: {
        ...settings,
        schedules: (settings.schedules ?? []).map((schedule) =>
          schedule.id === scheduleId
            ? { ...schedule, lastRun: { ...(schedule.lastRun ?? {}), [key]: Date.now() } }
            : schedule,
        ),
      },
    });
  }
}

function briefRangeSuffix(period: SchedulePeriod): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const format = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  return period.kind === 'daily' ? format(period.start) : `${format(period.start)} ~ ${format(period.end)}`;
}

export const briefScheduler = new BriefScheduler();
