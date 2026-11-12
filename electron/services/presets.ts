/** 常见邮箱服务商预设，用于账户设置面板一键填充 */

export interface MailPreset {
  id: string;
  label: string;
  hint: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  /** 域名匹配，用于自动识别 */
  domains: string[];
}

export const MAIL_PRESETS: MailPreset[] = [
  {
    id: 'qq',
    label: 'QQ 邮箱',
    hint: '需在 QQ 邮箱设置中开启 IMAP/SMTP 并使用「授权码」而非登录密码',
    imap: { host: 'imap.qq.com', port: 993, secure: true },
    smtp: { host: 'smtp.qq.com', port: 465, secure: true },
    domains: ['qq.com', 'vip.qq.com', 'foxmail.com'],
  },
  {
    id: 'exmail',
    label: '腾讯企业邮箱',
    hint: '企业微信/腾讯企业邮，使用客户端专用密码',
    imap: { host: 'imap.exmail.qq.com', port: 993, secure: true },
    smtp: { host: 'smtp.exmail.qq.com', port: 465, secure: true },
    domains: [],
  },
  {
    id: '163',
    label: '网易 163 邮箱',
    hint: '需开启 IMAP/SMTP 服务，使用客户端授权密码',
    imap: { host: 'imap.163.com', port: 993, secure: true },
    smtp: { host: 'smtp.163.com', port: 465, secure: true },
    domains: ['163.com'],
  },
  {
    id: '126',
    label: '网易 126 邮箱',
    hint: '需开启 IMAP/SMTP 服务，使用客户端授权密码',
    imap: { host: 'imap.126.com', port: 993, secure: true },
    smtp: { host: 'smtp.126.com', port: 465, secure: true },
    domains: ['126.com'],
  },
  {
    id: 'aliyun',
    label: '阿里云企业邮箱',
    hint: '企业邮箱使用客户端专用密码',
    imap: { host: 'imap.qiye.aliyun.com', port: 993, secure: true },
    smtp: { host: 'smtp.qiye.aliyun.com', port: 465, secure: true },
    domains: [],
  },
  {
    id: 'gmail',
    label: 'Gmail',
    hint: '需开启两步验证并生成「应用专用密码」',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    domains: ['gmail.com', 'googlemail.com'],
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    hint: 'IMAP 需在账户中启用，SMTP 使用 STARTTLS 587 端口',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'office365.com'],
  },
  {
    id: 'sina',
    label: '新浪邮箱',
    hint: '需开启 IMAP/SMTP 服务',
    imap: { host: 'imap.sina.com', port: 993, secure: true },
    smtp: { host: 'smtp.sina.com', port: 465, secure: true },
    domains: ['sina.com', 'sina.cn'],
  },
  {
    id: '189',
    label: '天翼 189 邮箱',
    hint: '使用客户端授权码',
    imap: { host: 'imap.189.cn', port: 993, secure: true },
    smtp: { host: 'smtp.189.cn', port: 465, secure: true },
    domains: ['189.cn'],
  },
  {
    id: 'custom',
    label: '自定义 / 企业自建',
    hint: '请向邮箱管理员确认 IMAP、SMTP 服务器地址与端口',
    imap: { host: '', port: 993, secure: true },
    smtp: { host: '', port: 465, secure: true },
    domains: [],
  },
];

export function detectPreset(email: string): MailPreset | undefined {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return undefined;
  return MAIL_PRESETS.find((p) => p.domains.includes(domain));
}
