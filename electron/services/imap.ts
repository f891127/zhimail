/**
 * IMAP 收信服务：连接、文件夹枚举、增量同步、IDLE 新邮件、标记/移动/删除。
 * 使用 imapflow 官方 API，所有网络操作均有超时与错误归类。
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import iconv from 'iconv-lite';
import type { ParsedMail } from 'mailparser';
import type { AddressObject } from 'mailparser';
import { decryptSecret } from './crypto';
import { assignThreadIds } from './thread';
import { store } from './store';
import type {
  Account,
  AttachmentMeta,
  Folder,
  FolderKind,
  MailAddress,
  MessageMeta,
  SyncProgress,
} from './types';

const CONNECTION_TIMEOUT = 20000;
const GREETING_TIMEOUT = 15000;

function toAddresses(input: unknown): MailAddress[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const result: MailAddress[] = [];
  for (const item of list) {
    if (!item) continue;
    const entry = item as { name?: string; address?: string; value?: { name?: string; address?: string }[] };
    // imapflow 的 envelope 直接给 { name, address }；mailparser 给 { value: [{ name, address }] }
    if (Array.isArray(entry.value)) {
      for (const one of entry.value) {
        if (one?.address) result.push({ name: one.name || undefined, address: one.address });
      }
      continue;
    }
    if (entry.address) result.push({ name: entry.name || undefined, address: entry.address });
  }
  return result;
}


/** 文本“像不像正常中文”的粗略打分：用于在多种解码结果中挑最合理的一个 */
function textScore(text: string): number {
  if (!text) return 0;
  let score = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 128) score += 1;
    else if (code >= 0x4e00 && code <= 0x9fff) score += 3; // 常用汉字
    else if (code >= 0x3000 && code <= 0x303f) score += 2; // 中文标点
    else if (code >= 0x25a0 && code <= 0x25ff) score -= 5; // ◆ ■ 等编码错位产物
    else if (code >= 0xff61 && code <= 0xff9f) score -= 6; // 半角片假名：GBK 被当成 Shift_JIS 解码的典型症状
    else if (code >= 0xff00 && code <= 0xffef) score += 1; // 全角符号
    else if (code === 0xfffd || code === 0x25c6 || code === 0x25c7 || code === 0x25a1 || code === 0x25a0) score -= 8;
    else if (code >= 0x3400 && code <= 0x4dbf) score -= 4; // 生僻扩展 A，常见于错位解码
    else if (code >= 0xf900 && code <= 0xfaff) score -= 4; // 兼容汉字
    else if (code >= 0xe000 && code <= 0xf8ff) score -= 6; // 私用区
    else score -= 1;
  }
  return score;
}

/** 常用汉字表：用于判断一段文字像不像正常中文（取自项目内自然语言文本的高频字） */
const COMMON_HANZI = '件邮文的新用与动置在时报本自更示一户不可要中发已复设成出数会前简为回据版正接生同安下后装夹模周日开重次分未内存务到查启账写标按待定保需读份并箱关提程取器作有备面式入点显间口当认选除办录步主化行服收是条目型建方地统包部译单窗明现封月无删期失知表序析话请余度附检题人最上结额容项全完败密即载持翻键列解码每证或客于使常确端原大格名应栏加手义理个进摘助预试整组空连默能系导天换总测支操配否索说汇批界打览送改工案事把通先直含态量合求址立留排这信对阅多位线再议字验增三状免源语输只清级闭击计任菌体记果制返图灭调退看星真过切没布转范具围稿搜法言实草第右填优编机见菜错恢签展演构商台供我志近超号误业段小其页以移引压被交消运里来则年修板避类该询续此择处长高便场首也始串注顺力变例意判如隐钮效刷及截词替权归皮肤弹区辑由问至元异仅等管英参控断郵产指审略储给找心从相渲染档覆像讯企网所电锅流性共因房做升了秒响侧擎凭镜执代忽二还头气节依册携盘钟带医外隔致添聚树两尚功勾盖授限库暂息影帮照推视称放层私句论今专您声浏路院抽联去样底独快准你腾兼质各风环醒评停们价藏角若片色随值止四另秀杰温公比仓品算基核货物向起均费缩补协历锁械责延它双都左筛普跳掉官仍强智垃圾采门造付王丽剂圈约桌白然种紧就充辅捷登史昨旧料初拉告泵好走顶兜适拟符低际跟划差络何音境链落老答李博培域继焦局宽创平些往较插景别占员逐赖触托缺少蓝达匹火追阶曲华疗蒸汽险百悬反静软套框命子将受早几急金逾五得许术者净戳束经磁块跨且径特脉涉国孙倩千集屏虚销获访速润扩概必降频暴露缀設讀辦干科技资他象殊传迁规久拒书警热估东阳偏刘仁济诉遮罩馈抄哪赠严精粗识须之允探钥齐那纯繁顯標订某湿绝础非纠乱身况逻敏溯研水阀察硅混材训师张壳轻稍撤车沙脚绪纳冗六吗刻尝但终护深刚而根體項簡報為映射和感临却锚播微阿举满情校硬养陈毒足勘贵晓芸架万川突缓舟帆洁友禁靠铺决卡细背才般毫率挪望永详让號資錄結檢單產尋譯關刪對話典牌道住监拿短针享唯滤易云枚僻踢堆防负赵踪午迟剩承燥漏海形室谢奏冲贴释拦山豆谱飞零跃辰什么歧固徽';
const COMMON_HANZI_SET = new Set(COMMON_HANZI);

/** 正文是否像乱码：半角片假名、替换符、连续 ◇（无法映射字节时的占位） */
export function looksMojibake(text: string | undefined | null): boolean {
  if (!text) return false;
  if (/[\uff61-\uff9f]/.test(text)) return true;
  if (text.includes('\ufffd')) return true;
  // 经典乱码词（UTF-8 被当 GBK / GBK 被当 UTF-8 的典型结果）
  if (/锟斤拷|烫烫烫|屯屯屯|ï¿½|Ã¤|â€™/.test(text)) return true;
  // 编码错位时中文常被映射成几何符号（◆ ■ □ ▲ 等），按密度判断，避免误伤正常的项目符号列表
  const shapes = (text.match(/[\u25A0-\u25FF]/g) ?? []).length;
  if (shapes >= 4 && shapes > text.length * 0.02) return true;
  return (text.match(/◇/g) ?? []).length >= 3;
}

/** 文本「像正常中文」的程度：常用字加分，半角片假名 / 替换符 / 生僻字减分 */
export function plausibility(text: string): number {
  if (!text) return 0;
  let score = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 128) score += 1;
    else if (code >= 0x4e00 && code <= 0x9fff) score += COMMON_HANZI_SET.has(ch) ? 3 : -1;
    else if (code >= 0x3000 && code <= 0x303f) score += 2;
    else if (code >= 0xff61 && code <= 0xff9f) score -= 6;
    else if (code === 0xfffd) score -= 10;
    else if (code >= 0xff00 && code <= 0xffef) score += 0.5;
    else if (code >= 0x0400 && code <= 0x04ff) score -= 3;
    else score -= 1;
  }
  return score;
}

/**
 * 纠正乱码：把「用错编码解码出来的字符串」按错误编码还原成字节，再用正确编码解一次，
 * 用常用字比例判断哪个结果最像正常中文。覆盖：
 *  1) GBK/GB2312 正文被当成 Shift_JIS 解码 → 满屏半角片假名与「◇」；
 *  2) UTF-8 正文被当成 latin1/windows-1252 解码 → 「ä¸­æ–‡」式乱码。
 */
export function repairMojibake(text: string | undefined | null): string {
  if (!text) return text ?? '';
  if (!/[\u0080-\uffff]/.test(text)) return text;
  const base = plausibility(text);
  let best = text;
  let bestScore = base;
  const wrongList = /[\uff61-\uff9f]/.test(text)
    ? ['shift_jis', 'euc-jp', 'gb18030']
    : ['latin1', 'windows-1252', 'gb18030', 'big5'];
  for (const wrong of wrongList) {
    let bytes: Buffer;
    try {
      bytes = iconv.encode(text, wrong);
    } catch {
      continue;
    }
    if (!bytes.length) continue;
    for (const right of ['utf-8', 'gb18030', 'big5']) {
      let fixed: string;
      try {
        fixed = iconv.decode(bytes, right);
      } catch {
        continue;
      }
      if (!fixed || fixed === text) continue;
      // 字节往返必须无损，否则说明还原过程丢信息
      try {
        if (!iconv.encode(fixed, right).equals(bytes)) continue;
      } catch {
        continue;
      }
      // 编码回原字节时若有字符变成 ?（无法映射），说明这一步会丢信息，直接丢弃
      const lostBytes = bytes.filter((byte) => byte === 0x3f).length;
      const lostChars = (fixed.match(/\?/g) ?? []).length;
      if (lostBytes > 0 && lostChars > (text.match(/\?/g) ?? []).length) continue;
      const score = plausibility(fixed);
      if (score > bestScore + Math.max(6, text.length * 0.05)) {
        best = fixed;
        bestScore = score;
      }
    }
  }
  return best;
}

/** quoted-printable 解码（只处理正文，保留字节） */
function decodeQuotedPrintable(input: string): Buffer {
  const text = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '=' && i + 2 < text.length) {
      const hex = text.slice(i + 1, i + 3);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(text.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}

/** 把一段文本按 UTF-8 重新编码成 base64 正文（76 字符换行） */
function toBase64Body(buffer: Buffer): string {
  return buffer.toString('base64').replace(/(.{76})/g, '$1\r\n');
}

/**
 * 逐个 MIME 分段纠正正文编码：把每段 text/* 正文按「最像正常中文」的编码解一次，
 * 再统一改写成 UTF-8 + base64。这样一封邮件里不同分段用不同编码也不会互相干扰。
 */
/**
 * 把邮件里所有文本分段统一转成 UTF-8 + base64，交给 mailparser 时就不会再依赖它的编码猜测。
 * 支持任意层级的 multipart 嵌套（典型邮件是 mixed → alternative → text/plain + text/html）。
 */
export function normalizeMessageEncodings(source: Buffer): Buffer {
  const raw = source.toString('latin1');
  let out = raw;
  try {
    out = normalizeEntity(raw, 0);
  } catch {
    out = raw;
  }
  return out === raw ? source : Buffer.from(out, 'latin1');
}

function normalizeEntity(raw: string, depth: number): string {
  if (depth > 8 || !raw) return raw;
  const crlfSep = raw.indexOf('\r\n\r\n');
  const lfSep = raw.indexOf('\n\n');
  const splitAt = crlfSep >= 0 ? crlfSep : lfSep;
  if (splitAt < 0) return raw;
  const bodyOffset = crlfSep >= 0 ? 4 : 2;
  const headers = raw.slice(0, splitAt);
  const body = raw.slice(splitAt + bodyOffset);
  const contentType = /content-type:\s*([^;\r\n]+)/i.exec(headers)?.[1]?.toLowerCase().trim() ?? '';
  const boundary = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(headers)?.[1];

  // 多段：逐段递归，子段自己的 headers 决定它是不是文本
  if (contentType.startsWith('multipart/') && boundary) {
    const parts = body.split(`--${boundary}`);
    if (parts.length < 2) return raw;
    const rebuilt = parts.map((part, index) => {
      if (index === 0) return part; // 前导说明
      if (part.startsWith('--')) return part; // 结束标记
      const trimmed = part.replace(/^\r?\n/, '');
      const lead = part.slice(0, part.length - trimmed.length);
      return lead + normalizeEntity(trimmed, depth + 1);
    });
    return `${headers}\r\n\r\n${rebuilt.join(`--${boundary}`)}`;
  }

  const fixed = normalizePart(headers, body);
  return fixed ?? raw;
}

function normalizePart(headers: string, body: string): string | undefined {
  if (!/content-type:\s*text\//i.test(headers)) return undefined;
  const cteMatch = /content-transfer-encoding:\s*([\w-]+)/i.exec(headers);
  const cte = (cteMatch?.[1] ?? '7bit').toLowerCase();
  let bytes: Buffer;
  if (cte === 'base64') bytes = Buffer.from(body.replace(/\s+/g, ''), 'base64');
  else if (cte === 'quoted-printable') bytes = decodeQuotedPrintable(body);
  else bytes = Buffer.from(body, 'latin1');
  if (!bytes.length) return undefined;

  const declared = /charset\s*=\s*"?([\w.\-]+)"?/i.exec(headers)?.[1]?.toLowerCase();
  const candidates = [declared, 'utf-8', 'gb18030', 'big5'].filter(Boolean) as string[];
  let bestText = '';
  let bestScore = -Infinity;
  for (const charset of candidates) {
    let text: string;
    try {
      text = iconv.decode(bytes, charset);
    } catch {
      continue;
    }
    if (!text) continue;
    const score = plausibility(text);
    if (score > bestScore) {
      bestText = text;
      bestScore = score;
    }
  }
  if (!bestText) return undefined;

  const nextHeaders = headers
    .replace(/charset\s*=\s*"?[\w.\-]+"?/gi, 'charset="utf-8"')
    .replace(/content-transfer-encoding:\s*[\w-]+/gi, 'Content-Transfer-Encoding: base64');
  const withCharset = /charset\s*=/i.test(nextHeaders)
    ? nextHeaders
    : nextHeaders.replace(/(content-type:\s*text\/[a-z\-]+)/i, '$1; charset="utf-8"');
  // 结尾必须保留 CRLF，否则下一段的 boundary 会和 base64 粘在一起
  return `${withCharset}\r\n\r\n${toBase64Body(Buffer.from(bestText, 'utf8'))}\r\n`;
}

/** 判定解析结果是否明显乱码（大量生僻字 / 替换符 / ◆） */
function looksBroken(text: string): boolean {
  if (!text || text.length < 8) return false;
  return textScore(text) < text.length * 0.2;
}

/** 正文里是否含非 ASCII 字节，且整段原文能无损按 UTF-8 往返（说明它就是 UTF-8 编码的） */
function isLikelyUtf8(source: Buffer): boolean {
  if (!/[\x80-\xff]/.test(source.toString('latin1'))) return false;
  const decoded = source.toString('utf8');
  if (decoded.includes('\uFFFD')) return false;
  return Buffer.byteLength(decoded, 'utf8') === source.length;
}

/** 读取头部里声明的 charset */
function declaredCharset(source: Buffer): string {
  const head = source.subarray(0, Math.min(source.length, 8192)).toString('latin1');
  const match = /charset\s*=\s*"?([\w.\-]+)"?/i.exec(head);
  return (match?.[1] ?? '').toLowerCase();
}

/** 把邮件头里的 charset 声明统一改写成指定编码，用于纠正声明与实际不一致的邮件 */
function forceCharsetSource(source: Buffer, charset: string): Buffer {
  const index = source.indexOf('\r\n\r\n') >= 0 ? source.indexOf('\r\n\r\n') : source.indexOf('\n\n');
  if (index < 0) return source;
  // 用 latin1 读写整封邮件：头部按字节等价，正文不会被破坏
  const text = source.toString('latin1');
  let changed = false;
  // 1) 已有的 charset 声明统一改写（含各 MIME 分段里的声明）
  let out = text.replace(/charset\s*=\s*"?[\w.\-]+"?/gi, () => {
    changed = true;
    return `charset="${charset}"`;
  });
  // 2) text/* 分段没有声明 charset 时补上
  out = out.replace(/(content-type:\s*text\/[a-z\-]+)(\r?\n)/gi, (_m, type: string, eol: string) => {
    changed = true;
    return `${type}; charset="${charset}"${eol}`;
  });
  if (!changed) return source;
  return Buffer.from(out, 'latin1');
}

/**
 * 解析邮件原文。
 * 中文企业邮箱（企业微信 / Exmail 等）常见「正文实际是 UTF-8，但头部声明 gb2312/gbk」，
 * 直接解析会得到生僻字（界面上显示成 ◆）或整段错位的中文。
 * 因此：先按声明解析；若原文本身就是合法 UTF-8，或解析结果明显异常，则强制按 UTF-8 再解析一次并择优。
 */
export async function parseMessageSource(source: Buffer | string): Promise<ParsedMail> {
  const original = Buffer.isBuffer(source) ? source : Buffer.from(source, 'binary');
  // 先按分段把正文统一成 UTF-8，再交给 mailparser，避免一段编码出错拖垮整封邮件
  let buffer = original;
  try {
    buffer = normalizeMessageEncodings(original);
  } catch {
    buffer = original;
  }
  const parsed = await simpleParser(buffer);

  const charset = declaredCharset(buffer);
  if (charset === 'utf-8' || charset === 'utf8') {
    // 声明 utf-8 但正文其实不是（会出现替换符 / 乱码），继续往下走重解析
    const decoded = (parsed.text ?? '') + (typeof parsed.html === 'string' ? parsed.html : '');
    if (!looksMojibake(decoded) && !looksBroken(decoded)) return applyRepair(parsed);
  }

  const plain = parsed.text ?? '';
  const htmlText = typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '';
  const broken = looksBroken(plain + htmlText) || looksMojibake(plain) || looksMojibake(htmlText);
  // 原文是合法 UTF-8 却声明成别的编码，是中文企业邮件的典型问题，直接按 UTF-8 重解析
  const utf8Source = isLikelyUtf8(buffer);
  if (!broken && !utf8Source) return applyRepair(parsed);

  const baseScore = plausibility(plain + htmlText);
  let best: ParsedMail | null = null;
  let bestScore = baseScore;
  // 逐个候选编码重新解析，取「最像正常中文」的那一份（不要一有提升就停，否则可能停在 UTF-8 的替换符上）
  for (const charset of ['gb18030', 'utf-8', 'big5'] as const) {
    try {
      const retried = await simpleParser(forceCharsetSource(buffer, charset));
      const retriedPlain = retried.text ?? '';
      const retriedHtml = typeof retried.html === 'string' ? retried.html.replace(/<[^>]+>/g, ' ') : '';
      const score = plausibility(retriedPlain + retriedHtml);
      if (score > bestScore) {
        best = retried;
        bestScore = score;
      }
    } catch {
      /* 某个候选失败就跳过 */
    }
  }
  if (best) {
    parsed.text = best.text;
    if (best.html) parsed.html = best.html;
    if (best.subject) parsed.subject = best.subject;
  }
  return applyRepair(parsed);
}

/** 指定编码重新解析一封邮件的原文（用于用户手动纠正编码） */
export async function parseWithCharset(source: Buffer | string, charset: string): Promise<ParsedMail> {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source, 'binary');
  const forced = forceCharsetSource(buffer, charset);
  return simpleParser(forced);
}

/** 依次尝试候选编码，返回「最像正常中文」的一份 */
export async function parseBestEffort(
  source: Buffer | string,
): Promise<{ parsed: ParsedMail; charset: string; score: number }> {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source, 'binary');
  let best: { parsed: ParsedMail; charset: string; score: number } | null = null;
  for (const charset of ['utf-8', 'gb18030', 'big5', 'utf-16le', 'utf-16be'] as const) {
    try {
      const parsed = await parseWithCharset(buffer, charset);
      const text =
        (parsed.text ?? '') +
        (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
      const score = plausibility(text);
      if (!best || score > best.score) best = { parsed, charset, score };
    } catch {
      /* 跳过失败的候选 */
    }
  }
  const auto = await parseMessageSource(buffer);
  const autoText =
    (auto.text ?? '') + (typeof auto.html === 'string' ? auto.html.replace(/<[^>]+>/g, ' ') : '');
  const autoScore = plausibility(autoText);
  if (!best || autoScore >= best.score) return { parsed: auto, charset: 'auto', score: autoScore };
  return best;
}

/** 对解析结果的文本部分做一次乱码纠正 */
function applyRepair(parsed: ParsedMail): ParsedMail {
  if (typeof parsed.text === 'string') parsed.text = repairMojibake(parsed.text);
  if (typeof parsed.html === 'string') parsed.html = repairMojibake(parsed.html);
  if (typeof parsed.subject === 'string') parsed.subject = repairMojibake(parsed.subject);
  return parsed;
}

export function makeSnippet(text: string | undefined, html: string | undefined): string {
  const source = (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  if (source) return source;
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function detectFolderKind(path: string, specialUse: string | undefined): FolderKind {
  const use = (specialUse ?? '').toLowerCase();
  if (use.includes('\\inbox')) return 'inbox';
  if (use.includes('\\sent')) return 'sent';
  if (use.includes('\\draft')) return 'draft';
  if (use.includes('\\trash')) return 'trash';
  if (use.includes('\\junk') || use.includes('\\spam')) return 'junk';
  if (use.includes('\\archive')) return 'archive';

  const lower = path.toLowerCase();
  if (lower === 'inbox' || lower.endsWith('/inbox')) return 'inbox';
  if (/sent|已发送|送信/.test(lower)) return 'sent';
  if (/draft|草稿/.test(lower)) return 'draft';
  if (/trash|deleted|已删除|废纸篓/.test(lower)) return 'trash';
  if (/junk|spam|垃圾/.test(lower)) return 'junk';
  if (/archive|存档|归档/.test(lower)) return 'archive';
  return 'custom';
}


/** 内置特殊文件夹的标准中文名 */
const BUILTIN_FOLDER_NAMES: Record<string, string> = {
  inbox: '收件箱',
  draft: '草稿箱',
  sent: '已发送',
  archive: '存档',
  junk: '垃圾邮件',
  trash: '已删除',
};

/** 服务器上常见的英文文件夹名 → 中文显示名（腾讯企业邮等会返回 INBOX / unwanted 这类名字） */
const FOLDER_NAME_ZH: Record<string, string> = {
  inbox: '收件箱',
  drafts: '草稿箱',
  draft: '草稿箱',
  'sent messages': '已发送',
  sent: '已发送',
  'sent items': '已发送',
  'deleted messages': '已删除',
  deleted: '已删除',
  trash: '已删除',
  junk: '垃圾邮件',
  'junk e-mail': '垃圾邮件',
  spam: '垃圾邮件',
  unwanted: '可疑邮件',
  archive: '存档',
  archives: '存档',
  'all mail': '全部邮件',
  outbox: '发件箱',
  notes: '便签',
};

function localizeFolderName(name: string, kind: string): string {
  const builtin = BUILTIN_FOLDER_NAMES[kind];
  if (builtin) return builtin;
  const key = name.trim().toLowerCase();
  return FOLDER_NAME_ZH[key] ?? name;
}

const KIND_ORDER: Record<FolderKind, number> = {
  virtual: -1,
  inbox: 0,
  draft: 1,
  sent: 2,
  archive: 3,
  junk: 4,
  trash: 5,
  custom: 10,
  brief: 99,
};

export class ImapService {
  private clients = new Map<string, ImapFlow>();
  private cancels = new Set<string>();
  private idleListeners = new Map<string, (accountId: string) => void>();

  private createClient(account: Account): ImapFlow {
    const secret = store.getAccountSecret(account.id);
    const password = decryptSecret(secret.imapPassword);
    if (!password) throw new Error('未找到该账户的 IMAP 授权码，请在账户设置中重新填写');

    return new ImapFlow({
      host: account.imap.host,
      port: account.imap.port,
      secure: account.imap.secure,
      auth: { user: account.imap.user || account.email, pass: password },
      logger: false,
      connectionTimeout: CONNECTION_TIMEOUT,
      greetingTimeout: GREETING_TIMEOUT,
      socketTimeout: 120000,
      emitLogs: false,
    });
  }

  async testConnection(account: Account): Promise<{ ok: boolean; message: string }> {
    let client: ImapFlow | undefined;
    try {
      client = this.createClient(account);
      await client.connect();
      const list = await client.list();
      const folders = list.filter((item) => !item.flags.has('\\Noselect')).length;
      return { ok: true, message: `IMAP 连接成功，发现 ${folders} 个可用文件夹` };
    } catch (error) {
      return { ok: false, message: describeImapError(error) };
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          /* 忽略退出异常 */
        }
      }
    }
  }

  /** 枚举服务器文件夹并写入本地索引 */
  async syncFolders(account: Account, sharedClient?: ImapFlow): Promise<Folder[]> {
    // 复用同步过程中已有的连接：部分邮箱（腾讯企业邮等）限制并发连接数，
    // 同时开两条会被服务器踢掉一条，表现为「Connection not available」
    const client = sharedClient ?? this.createClient(account);
    if (!sharedClient) await client.connect();
    try {
      const list = await client.list();
      const existing = store.listFolders(account.id);
      // 服务器上的收件箱/已发送/草稿等特殊文件夹要与内置文件夹合并，
      // 否则会出现「收件箱」和「INBOX」两个入口、邮件全堆在 INBOX 的情况
      // 按 kind 匹配内置文件夹（不要求没有 remotePath，否则第二次同步会再建一个 INBOX 出来）
      const builtinByKind = new Map<string, Folder>();
      for (const folder of existing) {
        if (folder.kind === 'custom' || folder.kind === 'brief' || folder.kind === 'virtual') continue;
        const canonicalId = `${account.id}:${folder.kind}`;
        const current = builtinByKind.get(folder.kind);
        // 优先保留 id 规范（acc:inbox 这种）的那条，其余重复项交给后面的清理逻辑
        if (!current || (folder.id === canonicalId && current.id !== canonicalId)) {
          builtinByKind.set(folder.kind, folder);
        }
      }
      const folders: Folder[] = [];
      const usedBuiltin = new Set<string>();
      for (const item of list) {
        if (item.flags?.has('\\Noselect')) continue;
        const kind = detectFolderKind(item.path, item.specialUse);
        const builtin = kind === 'custom' ? undefined : builtinByKind.get(kind);
        if (builtin && !usedBuiltin.has(builtin.id)) {
          usedBuiltin.add(builtin.id);
          folders.push({
            ...builtin,
            // 特殊文件夹统一用内置中文名，避免出现 INBOX / Drafts / Sent Messages
            name: BUILTIN_FOLDER_NAMES[kind] ?? builtin.name,
            remotePath: item.path,
            specialUse: item.specialUse,
            deletable: false,
            order: KIND_ORDER[kind],
          });
          continue;
        }
        folders.push({
          id: `${account.id}:${item.path}`,
          accountId: account.id,
          name: localizeFolderName(item.name || item.path, kind),
          kind,
          remotePath: item.path,
          specialUse: item.specialUse,
          deletable: !['inbox', 'sent', 'draft', 'trash'].includes(kind),
          order: KIND_ORDER[kind],
          local: false,
        });
      }
      // 清理历史遗留的重复文件夹（例如上一版本同步出来的 acc:INBOX），其邮件会在本次同步中重新拉取
      const keep = new Set(folders.map((folder) => folder.id));
      for (const folder of existing) {
        if (keep.has(folder.id)) continue;
        if (folder.kind === 'brief' || folder.kind === 'virtual') continue;
        if (!folder.remotePath) continue; // 本地自建目录保留
        store.removeFolderData(folder.id);
      }
      folders.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh'));
      return folders;
    } finally {
      if (!sharedClient) {
        try {
          await client.logout();
        } catch {
          /* 忽略 */
        }
      }
    }
  }

  cancel(accountId: string): void {
    this.cancels.add(accountId);
  }

  private isCancelled(accountId: string): boolean {
    return this.cancels.has(accountId);
  }

  /**
   * 同步单个账户：枚举文件夹 → 逐文件夹拉取邮件。
   * 最新 fullCount 封拉取完整正文，其余仅拉取邮件头，打开时按需下载。
   */
  async syncAccount(
    account: Account,
    options: { days: number; limit: number; fullCount?: number },
    onProgress: (progress: SyncProgress) => void,
  ): Promise<{ fetched: number; folders: number; errors: string[] }> {
    this.cancels.delete(account.id);
    const errors: string[] = [];
    let fetched = 0;

    onProgress({
      accountId: account.id,
      phase: 'connecting',
      current: 0,
      total: 0,
      message: '正在连接邮件服务器…',
    });

    const client = this.createClient(account);
    await client.connect();

    try {
      const remoteFolders = await this.syncFolders(account, client);
      for (const folder of remoteFolders) {
        store.upsertFolder(folder);
      }

      const targets = remoteFolders.filter((f) =>
        ['inbox', 'sent', 'draft', 'custom', 'archive'].includes(f.kind),
      );

      for (const [index, folder] of targets.entries()) {
        if (this.isCancelled(account.id)) {
          onProgress({
            accountId: account.id,
            phase: 'cancelled',
            current: fetched,
            total: 0,
            message: '同步已取消',
          });
          break;
        }
        onProgress({
          accountId: account.id,
          folderId: folder.id,
          folderName: folder.name,
          phase: 'listing',
          current: index,
          total: targets.length,
          message: `正在同步「${folder.name}」…`,
        });
        try {
          const count = await this.syncFolder(client, account, folder, options, onProgress);
          fetched += count;
        } catch (error) {
          const message = String((error as Error)?.message ?? '');
          const dropped = /connection not available|connection closed|not authenticated|socket/i.test(message);
          if (dropped) {
            // 服务器把连接踢掉（并发限制或空闲超时）：重连一次再试这个文件夹
            try {
              if (!client.usable) await client.connect();
              const count = await this.syncFolder(client, account, folder, options, onProgress);
              fetched += count;
              continue;
            } catch (retryError) {
              errors.push(`${folder.name}: ${describeImapError(retryError)}`);
              continue;
            }
          }
          errors.push(`${folder.name}: ${describeImapError(error)}`);
        }
      }

      account.lastSyncAt = Date.now();
      store.upsertAccount(account);
      onProgress({
        accountId: account.id,
        phase: 'done',
        current: fetched,
        total: fetched,
        message: `同步完成，共更新 ${fetched} 封邮件`,
      });
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }

    return { fetched, folders: store.listFolders(account.id).length, errors };
  }

  /**
   * 服务器上已删除的邮件，本地是否跟着删除（设置项 mail.syncServerDeletes）。
   * 只在「同步时间窗口」内比对，避免把窗口外的历史邮件误删；
   * 若窗口内本地邮件几乎全部消失，多半是 UIDVALIDITY 变化或服务器异常，跳过本轮清理。
   */
  private pruneDeletedOnServer(
    account: Account,
    folder: Folder,
    serverUids: number[],
    since: Date,
  ): void {
    if (!store.getSettings().mail.syncServerDeletes) return;
    const sinceTime = since.getTime();
    const local = store
      .allMessages()
      .filter((m) => m.folderId === folder.id && m.date >= sinceTime);
    if (!local.length) return;
    const serverSet = new Set(serverUids);
    const kept = local.filter((m) => serverSet.has(m.uid));
    const gone = local.filter((m) => !serverSet.has(m.uid));
    if (!gone.length) return;
    if (kept.length === 0 && local.length > 3) {
      console.warn('[imap] 窗口内本地邮件全部不在服务器上，疑似 UIDVALIDITY 变化，跳过清理');
      return;
    }
    store.deleteMessages(gone.map((m) => m.id));
    console.log(`[imap] 已跟随服务器删除 ${gone.length} 封（${account.name} / ${folder.name}）`);
  }

  private async syncFolder(
    client: ImapFlow,
    account: Account,
    folder: Folder,
    options: { days: number; limit: number; fullCount?: number },
    onProgress: (progress: SyncProgress) => void,
  ): Promise<number> {
    const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
    try {
      const since = new Date(Date.now() - options.days * 24 * 3600 * 1000);
      const uids = (await client.search({ since }, { uid: true })) as number[];
      if (!uids.length) return 0;
      uids.sort((a, b) => a - b);
      const limited = uids.slice(-options.limit);
      const fullCount = options.fullCount ?? 60;
      const fullUids = new Set(limited.slice(-fullCount));
      const envelopeOnly = limited.filter((uid) => !fullUids.has(uid));

      // 跟随服务器删除：本地有、服务器已没有的邮件（同一时间窗口内）一并清理
      this.pruneDeletedOnServer(account, folder, uids, since);

      const existing = new Set(
        store
          .allMessages()
          .filter((m) => m.folderId === folder.id)
          .map((m) => m.uid),
      );
      const newUids = limited.filter((uid) => !existing.has(uid));
      const pendingFull = [...newUids.filter((uid) => fullUids.has(uid))];
      const pendingHead = [...newUids.filter((uid) => !fullUids.has(uid))];
      void envelopeOnly;

      const collected: MessageMeta[] = [];
      let processed = 0;
      const total = pendingFull.length + pendingHead.length;

      // 第一轮：完整拉取（含正文）
      if (pendingFull.length) {
        const range = pendingFull.join(',');
        for await (const message of client.fetch(
          range,
          { envelope: true, flags: true, size: true, source: true, internalDate: true },
          { uid: true },
        )) {
          if (this.isCancelled(account.id)) break;
          const meta = await this.persistFullMessage(account, folder, message);
          if (meta) collected.push(meta);
          processed += 1;
          onProgress({
            accountId: account.id,
            folderId: folder.id,
            folderName: folder.name,
            phase: 'fetching',
            current: processed,
            total,
            message: `「${folder.name}」已下载 ${processed}/${total} 封`,
          });
        }
      }

      // 第二轮：仅拉取邮件头
      if (pendingHead.length) {
        const range = pendingHead.join(',');
        for await (const message of client.fetch(
          range,
          { envelope: true, flags: true, size: true, internalDate: true, bodyStructure: true },
          { uid: true },
        )) {
          if (this.isCancelled(account.id)) break;
          const meta = this.persistHeadOnly(account, folder, message);
          if (meta) collected.push(meta);
          processed += 1;
          if (processed % 10 === 0) {
            onProgress({
              accountId: account.id,
              folderId: folder.id,
              folderName: folder.name,
              phase: 'fetching',
              current: processed,
              total,
              message: `「${folder.name}」已处理 ${processed}/${total} 封`,
            });
          }
        }
      }

      if (collected.length) {
        assignThreadIds(collected, store.allMessages());
        store.upsertMessageMetas(collected);
      }
      return collected.length;
    } finally {
      lock.release();
    }
  }

  private buildMeta(
    account: Account,
    folder: Folder,
    message: any,
    snippet: string,
    hasAttachments: boolean,
  ): MessageMeta {
    const envelope = message.envelope ?? {};
    const flags: string[] = [];
    if (message.flags) {
      for (const flag of message.flags) flags.push(flag);
    }
    const date = envelope.date
      ? new Date(envelope.date).getTime()
      : message.internalDate
        ? new Date(message.internalDate).getTime()
        : Date.now();

    return {
      id: `${account.id}/${folder.id}/${message.uid}`,
      accountId: account.id,
      folderId: folder.id,
      uid: message.uid,
      messageId: envelope.messageId ?? undefined,
      subject: envelope.subject || '(无主题)',
      from: toAddresses(envelope.from),
      to: toAddresses(envelope.to),
      cc: toAddresses(envelope.cc),
      date,
      size: message.size ?? 0,
      flags,
      hasAttachments,
      snippet,
      inReplyTo: envelope.inReplyTo ?? undefined,
      references: Array.isArray(envelope.references)
        ? envelope.references
        : envelope.references
          ? [envelope.references]
          : undefined,
    };
  }

  private async persistFullMessage(
    account: Account,
    folder: Folder,
    message: any,
  ): Promise<MessageMeta | undefined> {
    if (!message.source) return this.persistHeadOnly(account, folder, message);
    const parsed = await parseMessageSource(message.source);
    const attachments: AttachmentMeta[] = (parsed.attachments ?? []).map((attachment, index) => ({
      index,
      filename: attachment.filename || `附件-${index + 1}`,
      contentType: attachment.contentType,
      size: attachment.size,
      contentId: attachment.cid ?? undefined,
    }));

    const meta = this.buildMeta(
      account,
      folder,
      message,
      makeSnippet(parsed.text ?? undefined, parsed.html || undefined),
      attachments.length > 0,
    );

    if (meta.messageId === undefined && parsed.messageId) meta.messageId = parsed.messageId;
    if (!meta.inReplyTo && parsed.inReplyTo) meta.inReplyTo = parsed.inReplyTo;
    if ((!meta.references || !meta.references.length) && parsed.references) {
      meta.references = Array.isArray(parsed.references) ? parsed.references : [parsed.references];
    }

    // 附件立即落盘，避免阅读时再走一次网络
    for (const attachment of parsed.attachments ?? []) {
      const index = parsed.attachments.indexOf(attachment);
      try {
        const filePath = store.attachmentPath(meta.id, attachment.filename || `附件-${index + 1}`);
        const fs = await import('node:fs');
        fs.writeFileSync(filePath, attachment.content);
        attachments[index].localPath = filePath;
      } catch (error) {
        console.warn('[imap] 附件保存失败', error);
      }
    }

    store.saveMessageBody(account.id, folder.id, message.uid, {
      text: parsed.text ?? undefined,
      html: typeof parsed.html === 'string' ? parsed.html : undefined,
      attachments,
    });

    return meta;
  }

  private persistHeadOnly(
    account: Account,
    folder: Folder,
    message: any,
  ): MessageMeta | undefined {
    const structure = message.bodyStructure;
    const hasAttachments = Boolean(
      structure?.childNodes?.some(
        (node: any) =>
          node.disposition === 'attachment' ||
          (node.type === 'application' && node.disposition !== 'inline'),
      ),
    );
    return this.buildMeta(account, folder, message, '', hasAttachments);
  }

  /** 按需下载单封邮件正文（列表中只拉过邮件头的邮件） */
  async fetchMessageBody(
    account: Account,
    folder: Folder,
    uid: number,
  ): Promise<{ text?: string; html?: string; attachments: AttachmentMeta[] } | undefined> {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) return undefined;
        const parsed = await parseMessageSource(message.source);
        const attachments: AttachmentMeta[] = (parsed.attachments ?? []).map(
          (attachment, index) => ({
            index,
            filename: attachment.filename || `附件-${index + 1}`,
            contentType: attachment.contentType,
            size: attachment.size,
            contentId: attachment.cid ?? undefined,
          }),
        );
        const metaId = `${account.id}/${folder.id}/${uid}`;
        for (const attachment of parsed.attachments ?? []) {
          const index = parsed.attachments.indexOf(attachment);
          try {
            const filePath = store.attachmentPath(
              metaId,
              attachment.filename || `附件-${index + 1}`,
            );
            const fs = await import('node:fs');
            fs.writeFileSync(filePath, attachment.content);
            attachments[index].localPath = filePath;
          } catch (error) {
            console.warn('[imap] 附件保存失败', error);
          }
        }
        const body = {
          text: parsed.text ?? undefined,
          html: typeof parsed.html === 'string' ? parsed.html : undefined,
          attachments,
        };
        store.saveMessageBody(account.id, folder.id, uid, body);
        store.patchMessage(metaId, {
          snippet: makeSnippet(body.text, body.html),
          hasAttachments: attachments.length > 0,
        });
        return body;
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 与服务器同步标记状态 */
  async setFlags(account: Account, folder: Folder, uids: number[], flag: string, value: boolean) {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        if (value) await client.messageFlagsAdd(uids, [flag], { uid: true });
        else await client.messageFlagsRemove(uids, [flag], { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  async moveMessages(account: Account, folder: Folder, uids: number[], targetPath: string) {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        await client.messageMove(uids, targetPath, { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  async deleteMessages(account: Account, folder: Folder, uids: number[]) {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        await client.messageDelete(uids, { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 导出邮件原文（.eml），用于排查编码问题或转发给他人 */
  async exportSource(account: Account, folder: Folder, uid: number, filePath: string): Promise<number> {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        const message = (await client.fetchOne(String(uid), { source: true }, { uid: true })) || undefined;
        if (!message?.source) throw new Error('服务器上没有取到邮件原文');
        const fs = await import('node:fs');
        fs.writeFileSync(filePath, message.source);
        return message.source.length;
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 重新解码单封邮件正文：可选指定编码，否则自动挑最像正常中文的一份 */
  async redecodeMessage(
    account: Account,
    folder: Folder,
    uid: number,
    charset?: string,
  ): Promise<{
    body: { text?: string; html?: string; attachments: AttachmentMeta[] };
    charset: string;
    stillBroken: boolean;
  } | undefined> {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        const message = (await client.fetchOne(String(uid), { source: true }, { uid: true })) || undefined;
        if (!message?.source) return undefined;
        const result = charset
          ? { parsed: await parseWithCharset(message.source, charset), charset }
          : await parseBestEffort(message.source);
        const metaId = `${account.id}/${folder.id}/${uid}`;
        const existing = store.getMessageBody(account.id, folder.id, uid);
        const body = {
          text: result.parsed.text ?? undefined,
          html: typeof result.parsed.html === 'string' ? result.parsed.html : undefined,
          attachments: existing?.attachments ?? [],
        };
        store.saveMessageBody(account.id, folder.id, uid, body);
        store.patchMessage(metaId, { snippet: makeSnippet(body.text, body.html) });
        // 原文本身就带 ◆ 等替换字符时，任何本地解码都救不回来，如实告知用户
        const stillBroken = looksMojibake(body.text ?? '') || looksMojibake(body.html ?? '');
        return { body, charset: result.charset, stillBroken };
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 启动 IDLE 长连接，收到新邮件时回调 */
  async startIdle(account: Account, onNewMail: (accountId: string) => void): Promise<void> {
    if (this.clients.has(account.id)) return;
    const client = this.createClient(account);
    this.idleListeners.set(account.id, onNewMail);
    client.on('exists', (data: any) => {
      const count = typeof data === 'number' ? data : data?.count;
      if (count) onNewMail(account.id);
    });
    client.on('error', (error: Error) => {
      console.warn('[imap] IDLE 连接异常', error.message);
      this.clients.delete(account.id);
    });
    client.on('close', () => {
      this.clients.delete(account.id);
    });
    await client.connect();
    this.clients.set(account.id, client);
  }

  async stopIdle(accountId: string): Promise<void> {
    const client = this.clients.get(accountId);
    this.clients.delete(accountId);
    this.idleListeners.delete(accountId);
    if (!client) return;
    try {
      await client.logout();
    } catch {
      /* 忽略 */
    }
  }

  async stopAll(): Promise<void> {
    for (const accountId of [...this.clients.keys()]) {
      await this.stopIdle(accountId);
    }
  }
}

export function describeImapError(error: unknown): string {
  const err = error as any;
  const code = err?.code ?? err?.responseCode;
  const message: string = err?.message ?? String(error);
  // 服务器返回的原始原因（例如 "LOGIN failed" / "user is disabled"），对排查最有用
  const serverText: string =
    err?.responseText ?? err?.response ?? err?.serverResponse ?? '';
  const withServer = (base: string) => (serverText ? `${base}（服务器返回：${String(serverText).slice(0, 160)}）` : base);
  if (
    err?.authenticationFailed === true ||
    code === 'EAUTH' ||
    /authentication failed|invalid credentials|login failed|command failed|auth/i.test(message)
  ) {
    return withServer(
      'IMAP 登录被服务器拒绝：请确认「用户名」为完整邮箱地址，密码处填写客户端授权码/专用密码（不是网页登录密码），并在邮箱网页版开启 IMAP 服务',
    );
  }
  if (code === 'ENOTFOUND' || /getaddrinfo|ENOTFOUND/i.test(message)) {
    return '无法解析邮件服务器地址，请检查 IMAP 主机名是否正确';
  }
  if (code === 'ECONNREFUSED') {
    return '连接被拒绝：端口可能被占用或被服务器限制，请核对端口与加密方式';
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return '连接超时：请检查网络或防火墙是否允许该端口';
  }
  if (/certificate|self signed/i.test(message)) {
    return '证书校验失败：服务器使用了自签名证书，请确认服务器地址';
  }
  return withServer(message);
}

export const imapService = new ImapService();
