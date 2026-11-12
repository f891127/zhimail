/** 时间范围预设：今日 / 昨日 / 本周 / 上周 / 本月 / 上月 / 近 7 天 / 近 30 天 */

export type RangePresetId =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'last7'
  | 'last30'
  | 'custom';

export interface RangePreset {
  id: RangePresetId;
  label: string;
  compute: () => { start: number; end: number };
}

const DAY = 86400000;

function startOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export const RANGE_PRESETS: RangePreset[] = [
  {
    id: 'today',
    label: '今日',
    compute: () => ({ start: startOfDay().getTime(), end: Date.now() }),
  },
  {
    id: 'yesterday',
    label: '昨日',
    compute: () => ({
      start: startOfDay(new Date(Date.now() - DAY)).getTime(),
      end: endOfDay(new Date(Date.now() - DAY)).getTime(),
    }),
  },
  {
    id: 'thisWeek',
    label: '本周',
    compute: () => {
      const today = startOfDay();
      const day = today.getDay() === 0 ? 7 : today.getDay();
      return { start: today.getTime() - (day - 1) * DAY, end: Date.now() };
    },
  },
  {
    id: 'lastWeek',
    label: '上周',
    compute: () => {
      const today = startOfDay();
      const day = today.getDay() === 0 ? 7 : today.getDay();
      const monday = today.getTime() - (day - 1) * DAY;
      return { start: monday - 7 * DAY, end: monday - 1 };
    },
  },
  {
    id: 'thisMonth',
    label: '本月',
    compute: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end: Date.now() };
    },
  },
  {
    id: 'lastMonth',
    label: '上月',
    compute: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
      return { start, end };
    },
  },
  {
    id: 'last7',
    label: '近 7 天',
    compute: () => ({ start: Date.now() - 7 * DAY, end: Date.now() }),
  },
  {
    id: 'last30',
    label: '近 30 天',
    compute: () => ({ start: Date.now() - 30 * DAY, end: Date.now() }),
  },
];

export function applyPreset(id: RangePresetId): { start: number; end: number } | null {
  const preset = RANGE_PRESETS.find((item) => item.id === id);
  return preset ? preset.compute() : null;
}

/** 把时间戳转换为 <input type="date"> 需要的 yyyy-mm-dd */
export function toDateInput(ts: number): string {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateInput(value: string, endOfDayValue = false): number {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return Date.now();
  if (endOfDayValue) date.setHours(23, 59, 59, 999);
  return date.getTime();
}
