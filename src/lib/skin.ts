/** 皮肤（主题）定义：每套皮肤对应 index.css 里的一组 CSS 变量 */
export type SkinId = 'default' | 'gmail' | 'outlook' | 'foxmail' | 'notion' | 'contrast';

export interface SkinDef {
  id: SkinId;
  name: string;
  /** 配色来源参考，展示在皮肤选择器里 */
  from: string;
  /** 选择器里的三色预览 */
  swatch: [string, string, string];
  /** 一句话说明 */
  note: string;
}

/** 皮肤统一按颜色命名 */
export const SKINS: SkinDef[] = [
  {
    id: 'default',
    name: '经典蓝',
    from: '知邮默认',
    swatch: ['#1f6fd0', '#e8541e', '#eef0f2'],
    note: '经典办公蓝，信息密度高',
  },
  {
    id: 'gmail',
    name: '天空蓝',
    from: 'Gmail 风格',
    swatch: ['#1a73e8', '#ea4335', '#e6f0fe'],
    note: '冷白底 + 浅蓝工具栏，清爽干净',
  },
  {
    id: 'outlook',
    name: '深海蓝',
    from: 'Outlook 风格',
    swatch: ['#0f6cbd', '#d13438', '#eae8e6'],
    note: '深蓝主色，线条克制、留白多',
  },
  {
    id: 'foxmail',
    name: '灰蓝',
    from: 'Foxmail 风格',
    swatch: ['#1b6ec2', '#f08300', '#dde4ea'],
    note: '灰色工具栏 + 灰蓝分隔，老牌客户端味道',
  },
  {
    id: 'notion',
    name: '极简黑',
    from: 'Notion 风格',
    swatch: ['#37352f', '#2383e2', '#f1f1ef'],
    note: '黑灰主色 + 一点点蓝，安静耐看',
  },
  {
    id: 'contrast',
    name: '高对比黑',
    from: '无障碍 / 强对比',
    swatch: ['#0b4fd0', '#c1121f', '#ffffff'],
    note: '纯白底 + 纯黑字 + 深色分隔线，弱光或老花眼更清楚',
  },
];

export const DEFAULT_SKIN: SkinId = 'default';

export function resolveSkin(value: string | undefined | null): SkinId {
  const found = SKINS.find((skin) => skin.id === value);
  return found ? found.id : DEFAULT_SKIN;
}

/** 调试用：临时锁定皮肤（截图验证时避免被设置里的值覆盖） */
let skinOverride: SkinId | null = null;

export function lockSkin(value: string | undefined | null): SkinId {
  skinOverride = resolveSkin(value);
  return applySkin(skinOverride);
}

/** 把皮肤写到 <html data-skin="...">，CSS 变量随之切换 */
export function applySkin(value: string | undefined | null): SkinId {
  const skin = resolveSkin(skinOverride ?? value);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.skin = skin;
  }
  return skin;
}

export function skinById(value: string | undefined | null): SkinDef {
  return SKINS.find((skin) => skin.id === resolveSkin(value)) ?? SKINS[0];
}
