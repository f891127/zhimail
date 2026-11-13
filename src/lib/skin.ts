/** 皮肤（主题）定义：每套皮肤对应 index.css 里的一组 CSS 变量 */
export type SkinId = 'default' | 'gmail' | 'outlook' | 'foxmail' | 'filo' | 'notion' | 'neat';

export interface SkinDef {
  id: SkinId;
  name: string;
  /** 风格参考来源，展示在皮肤选择器里 */
  from: string;
  /** 选择器里的三色预览 */
  swatch: [string, string, string];
  /** 一句话说明 */
  note: string;
}

export const SKINS: SkinDef[] = [
  {
    id: 'default',
    name: '知邮蓝',
    from: '默认',
    swatch: ['#1f6fd0', '#e8541e', '#f5f6f7'],
    note: '经典办公蓝，信息密度高',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    from: 'Google',
    swatch: ['#1a73e8', '#ea4335', '#f6f8fc'],
    note: '冷白底 + 圆润蓝，清爽干净',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    from: 'Microsoft',
    swatch: ['#0f6cbd', '#d13438', '#faf9f8'],
    note: 'Fluent 蓝，线条克制、留白多',
  },
  {
    id: 'foxmail',
    name: 'Foxmail',
    from: '腾讯',
    swatch: ['#1b6ec2', '#f08300', '#eef1f4'],
    note: '灰色工具栏 + 高对比分隔，老牌客户端味道',
  },
  {
    id: 'filo',
    name: 'Filo Mail',
    from: 'Filo',
    swatch: ['#6c5ce7', '#ff6b81', '#f7f5ff'],
    note: '紫色系，柔和的淡紫底',
  },
  {
    id: 'notion',
    name: 'Notion Mail',
    from: 'Notion',
    swatch: ['#37352f', '#2383e2', '#fbfbfa'],
    note: '极简黑白 + 一点点蓝，安静耐看',
  },
  {
    id: 'neat',
    name: 'Neat Mail AI',
    from: 'Neat',
    swatch: ['#0f9d76', '#f5a524', '#f4f9f7'],
    note: '薄荷绿，AI 产品常见的科技感',
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
