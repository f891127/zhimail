/** 阅读窗格操作条：可在「设置 → 界面」中勾选显示哪些操作，顺序即展示顺序 */
import type { IconName } from '@/components/Icon';

export type ReaderActionGroup = '常用操作' | 'AI 能力' | '翻译' | '待办';

export interface ReaderActionDef {
  id: string;
  label: string;
  icon: IconName;
  title: string;
  group: ReaderActionGroup;
  /** 蓝色强调样式 */
  brand?: boolean;
  /** 仅图标按钮，不显示文字 */
  iconOnly?: boolean;
}

export const READER_ACTIONS: ReaderActionDef[] = [
  { id: 'reply', label: '回复', icon: 'reply', title: '回复发件人', group: '常用操作' },
  { id: 'replyAll', label: '全部', icon: 'reply-all', title: '回复全部收件人', group: '常用操作' },
  { id: 'forward', label: '转发', icon: 'forward', title: '转发此邮件', group: '常用操作' },
  {
    id: 'analysis',
    label: '汇总分析',
    icon: 'chart',
    title: 'AI 汇总分析：按时间范围统计与解读邮件',
    group: 'AI 能力',
    brand: true,
  },
  {
    id: 'summarize',
    label: 'AI 摘要',
    icon: 'sparkles',
    title: 'AI 摘要：一句话结论 + 要点 + 待办',
    group: 'AI 能力',
    brand: true,
  },
  {
    id: 'threadSummary',
    label: '会话摘要',
    icon: 'document',
    title: '生成整个会话串的摘要',
    group: 'AI 能力',
    brand: true,
    iconOnly: true,
  },
  {
    id: 'replies',
    label: '回复建议',
    icon: 'send',
    title: '一键生成 3 条回复草稿',
    group: 'AI 能力',
    brand: true,
    iconOnly: true,
  },
  {
    id: 'triage',
    label: '重要度',
    icon: 'shield',
    title: '判断重要度与紧急度',
    group: 'AI 能力',
    iconOnly: true,
  },
  { id: 'translateZh', label: '译中', icon: 'translate', title: '一键翻译为中文', group: '翻译' },
  { id: 'translateEn', label: '译英', icon: 'translate', title: '一键翻译为英文', group: '翻译' },
  {
    id: 'todos',
    label: '提取待办',
    icon: 'checklist',
    title: '从本邮件提取待办事项',
    group: '待办',
    iconOnly: true,
  },
];

export const READER_ACTION_GROUPS: ReaderActionGroup[] = ['常用操作', 'AI 能力', '翻译', '待办'];

/** 默认展示：翻译与摘要放在前 7 项内，避免被收进「更多」 */
export const DEFAULT_READER_ACTIONS = [
  'reply',
  'replyAll',
  'forward',
  'summarize',
  'translateZh',
  'translateEn',
  'triage',
  'threadSummary',
  'replies',
  'todos',
];

/** 操作条最多直接展示的按钮数量，超出部分收进「更多」 */
export const READER_ACTION_VISIBLE_LIMIT = 7;
/** 操作条最多显示项数的可配置范围 */
export const READER_ACTION_LIMIT_MIN = 3;
export const READER_ACTION_LIMIT_MAX = 12;

export function findReaderAction(id: string): ReaderActionDef | undefined {
  return READER_ACTIONS.find((action) => action.id === id);
}
