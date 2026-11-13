/** 顶部工具栏可配置按钮：勾选哪些显示、顺序即展示顺序 */
import type { IconName } from '@/components/Icon';

export interface ToolbarActionDef {
  id: string;
  label: string;
  icon: IconName;
  /** 鼠标悬停提示 */
  title: string;
  /** 分组，仅用于设置界面归类 */
  group: string;
  /** 需要先选中邮件才能点 */
  needSelection?: boolean;
  /** 品牌色图标（AI 相关） */
  brand?: boolean;
}

export const TOOLBAR_ACTION_GROUPS = ['收取与同步', '邮件操作', '视图与工具'] as const;

export const TOOLBAR_ACTIONS: ToolbarActionDef[] = [
  {
    id: 'collect',
    label: '收取',
    icon: 'refresh',
    title: '一键收取全部账户（F5）',
    group: '收取与同步',
  },
  {
    id: 'sync',
    label: '同步',
    icon: 'refresh',
    title: '同步当前文件夹',
    group: '收取与同步',
  },
  {
    id: 'reply',
    label: '回复',
    icon: 'reply',
    title: '回复（Ctrl+R）',
    group: '邮件操作',
    needSelection: true,
  },
  {
    id: 'replyAll',
    label: '全部回复',
    icon: 'reply-all',
    title: '全部回复（Ctrl+Shift+R）',
    group: '邮件操作',
    needSelection: true,
  },
  {
    id: 'forward',
    label: '转发',
    icon: 'forward',
    title: '转发（Ctrl+F）',
    group: '邮件操作',
    needSelection: true,
  },
  {
    id: 'star',
    label: '星标',
    icon: 'star',
    title: '加星标 / 取消星标',
    group: '邮件操作',
    needSelection: true,
  },
  {
    id: 'delete',
    label: '删除',
    icon: 'trash',
    title: '删除（Delete）',
    group: '邮件操作',
    needSelection: true,
  },
  {
    id: 'brief',
    label: '简报',
    icon: 'document',
    title: '邮件简报中心',
    group: '视图与工具',
  },
  {
    id: 'todos',
    label: '待办',
    icon: 'checklist',
    title: '待办事项',
    group: '视图与工具',
  },
  {
    id: 'ai',
    label: 'AI 助手',
    icon: 'sparkles',
    title: '打开 / 收起 AI 助手（Ctrl+Shift+A）',
    group: '视图与工具',
    brand: true,
  },
  {
    id: 'skin',
    label: '皮肤',
    icon: 'palette',
    title: '切换外观皮肤',
    group: '视图与工具',
  },
  {
    id: 'settings',
    label: '设置',
    icon: 'settings',
    title: '打开设置',
    group: '视图与工具',
  },
];

/** 默认显示（与出厂布局一致） */
export const DEFAULT_TOOLBAR_ACTIONS = TOOLBAR_ACTIONS.map((action) => action.id);
