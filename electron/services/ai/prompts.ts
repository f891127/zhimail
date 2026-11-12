/** 知邮 ZhiMail —— AI 提示词。所有提示词面向中文办公场景，要求输出可直接落库的结构化结果。 */

import type { MessageMeta } from '../types';

export const SYSTEM_MAIL_ANALYST = `你是一位资深的中文邮件助理，服务于制造、质量与项目管理场景的工程师。
你的职责是把冗长的邮件读成结论与行动，风格务实、克制、不夸张。
硬性要求：
1. 只依据给定的邮件内容作答，不臆测未出现的信息；信息不足时明确写「原文未提及」。
2. 保留原文中的具体数字、型号、标准编号、日期与责任人不做改写。
3. 人名、部门、项目名保持原文写法。
4. 输出使用简体中文（除非明确要求翻译）。`;

export function formatAddress(list: MessageMeta['from']): string {
  return list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join('、') || '（未知）';
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（后文因长度限制已截断）`;
}

/** 单封邮件摘要 */
export function promptSummarizeMessage(meta: MessageMeta, body: string, hasAttachments: boolean) {
  return `请为下面这封邮件生成摘要。

【邮件信息】
主题：${meta.subject}
发件人：${formatAddress(meta.from)}
收件人：${formatAddress(meta.to)}
时间：${formatDate(meta.date)}
${hasAttachments ? '含附件：是' : '含附件：否'}

【正文】
${body}

【输出格式】使用 Markdown，严格按以下结构，不要添加额外章节：
### 一句话结论
（不超过 40 字，直接说这封信要干什么）

### 关键要点
- （3-6 条，每条不超过 60 字，保留具体数字与时间）

### 需要我做的事
- （若原文没有明确要求，写「无明确待办」）

### 建议动作
（一句话：回复/转交/归档/无需处理，并说明原因）`;
}

/** 会话串摘要 */
export function promptSummarizeThread(metaLines: string, subject: string, count: number) {
  return `请为下面这个邮件会话串生成摘要。会话共 ${count} 封邮件，主题：${subject}。

【会话内容（按时间排序）】
${metaLines}

【输出格式】使用 Markdown，严格按以下结构：
### 会话概况
（谁和谁在讨论什么，当前推进到哪一步，2-3 句）

### 时间线要点
- 【日期】发件人：要点（按时间顺序，合并重复内容）

### 待确认 / 分歧点
- （列出尚未达成一致或缺少答复的问题；没有则写「暂无」）

### 当前状态
（已解决 / 待对方回复 / 待我方确认 / 已搁置，并说明依据）

### 下一步建议
- （具体动作，含责任人，若原文有明确责任人则沿用）`;
}

/** 批量压缩：长区间汇总的第一阶段 */
export function promptBatchDigest(batchLabel: string, lines: string) {
  return `你在处理一批邮件（${batchLabel}）。请压缩为结构化要点，供后续汇总使用。

【邮件清单】
${lines}

【输出格式】使用 Markdown，不超过 500 字：
### 本批概览
（2 句，说明这批邮件主要在推进哪些事）
### 重要邮件
- 【发件人｜日期】主题 → 关键结论或诉求（保留数字与型号）
### 待办线索
- （可执行事项，注明来源发件人与截止时间；没有则写「无」）`;
}

/** 终稿汇总：长区间汇总的第二阶段 */
export function promptFinalDigest(rangeLabel: string, scopeLabel: string, statsLine: string, material: string) {
  return `请基于下面的材料，生成一份「邮件汇总分析」报告。

【统计口径】时间范围：${rangeLabel}；分析范围：${scopeLabel}
【数据统计】${statsLine}

【材料】
${material}

【输出格式】使用 Markdown，严格按以下结构：
## 一、整体概览
（3-5 句：这段时间邮件在推进什么，整体节奏与风险）

## 二、重点邮件
| 时间 | 发件人 | 主题 | 核心结论 / 诉求 |
| --- | --- | --- | --- |
（6-12 行，按重要性排序，不要罗列全部邮件）

## 三、主题聚类
- **主题名称**：涉及 N 封邮件，进展与结论（3-6 组）

## 四、风险与异常
- （延期、投诉、质量异常、审批卡点、金额或交期变动；没有则写「未发现明显风险」）

## 五、跟进建议
- （3-5 条，可执行，尽量带责任人与时间）

## 六、待办事项
- [ ] 任务内容 ｜ 截止：YYYY-MM-DD 或「未提及」 ｜ 优先级：高/中/低`;
}

/** 待办抽取（结构化） */
export function promptExtractTodos(material: string) {
  return `从下面的邮件材料中抽取「需要收件人去做」的待办事项。只抽取有明确动作要求的条目，不要把通知类内容算作待办。

【材料】
${material}

【输出要求】只输出 JSON，不要任何解释文字，格式：
{"todos":[{"title":"任务内容（不超过40字）","detail":"补充说明或原文依据","due":"YYYY-MM-DD 或 null","priority":"high|medium|low","sourceSubject":"来源邮件主题"}]}
若无待办，输出 {"todos":[]}。`;
}

/** 回复建议（结构化） */
export function promptReplySuggestions(meta: MessageMeta, body: string, senderName: string) {
  return `请为下面这封邮件写 3 条可直接发送的中文回复草稿。

【原邮件】
主题：${meta.subject}
发件人：${formatAddress(meta.from)}
正文：
${body}

【要求】
- 三条分别为：formal（正式规范，适合对外/上级）、concise（简洁直接，3 句以内）、friendly（口语友好，适合同事协作）。
- 每条都要回应原文的具体诉求，不要写「感谢来信」这类空话开头。
- 不确定的信息写成「我确认后回复」，不要编造。
- 称呼使用「${senderName}」。
- 正文用换行分段，不要包含主题行与签名档。

【输出要求】只输出 JSON：
{"suggestions":[{"tone":"formal","body":"..."},{"tone":"concise","body":"..."},{"tone":"friendly","body":"..."}]}`;
}

/** 写作辅助 */
const COMPOSE_INSTRUCTIONS: Record<string, string> = {
  continue: '接着用户已写的内容继续写下去，保持同样的语气与详略程度，只输出续写的部分。',
  polish: '润色用户草稿，使表达更准确、通顺、专业，保持原意与事实不变，输出润色后的完整正文。',
  formalize: '把草稿改写为正式商务邮件语气，措辞严谨、结构清晰，输出改写后的完整正文。',
  shorten: '精简草稿，去掉冗余表达，保留全部关键信息与数字，输出精简后的完整正文。',
  expand: '在保留原意的基础上补充必要的背景、依据与执行细节，使内容更完整，输出扩写后的完整正文。',
  bullets: '把草稿整理为「背景 / 结论 / 请求事项」三段式条目，便于快速阅读，输出整理后的正文。',
  translate: '按目标语言翻译，保留专有名词、型号与数字，输出译文。',
};

export function promptComposeAssist(params: {
  action: string;
  text: string;
  subject?: string;
  to?: string;
  targetLanguage?: string;
  tone?: string;
}) {
  const instruction = COMPOSE_INSTRUCTIONS[params.action] ?? '优化下面的邮件草稿。';
  return `你正在协助撰写一封中文商务邮件。

【邮件主题】${params.subject || '（未填写）'}
【收件人】${params.to || '（未填写）'}
【任务】${instruction}
${params.targetLanguage ? `【目标语言】${params.targetLanguage}\n` : ''}${params.tone ? `【期望语气】${params.tone}\n` : ''}
【用户当前内容】
${params.text || '（空白，请根据主题直接起草）'}

只输出可直接粘贴进正文的内容，不要解释、不要加「以下是」之类的前后缀。`;
}

/** 重要度判定 */
export function promptTriage(meta: MessageMeta, body: string) {
  return `判断下面这封邮件对收件人的重要度与紧急度，并给出标签建议。

主题：${meta.subject}
发件人：${formatAddress(meta.from)}
时间：${formatDate(meta.date)}
正文：
${body}

【判断标准】
- importance：是否影响项目节点、质量结论、合同金额、上级指令或客户关系。
- urgency：是否要求 24-48 小时内响应。
- labels：2-3 个中文短标签，从「客户/供应商/质量/审批/交期/技术/会议/财务/人事/通知」中选取，可自拟更贴切的。

【输出要求】只输出 JSON：
{"importance":"high|normal|low","urgency":"high|normal|low","reason":"一句话理由（不超过50字）","labels":["标签1","标签2"]}`;
}

/** 自然语言搜索解析 */
export function promptSearchInterpret(text: string, today: string) {
  return `把用户的自然语言搜索需求转换为邮件检索条件。今天是 ${today}。

用户输入：${text}

【字段说明】
- text：用于匹配主题与正文的关键词，去掉时间词与发件人后的核心词；没有则留空字符串。
- from：发件人姓名或邮箱片段，没有则不填。
- since / until：毫秒时间戳，表示时间范围；无法确定则不填。
- hasAttachment：布尔值，用户要求「带附件」时为 true。
- unreadOnly：布尔值，用户要求「未读」时为 true。
- explanation：用一句中文说明你理解到的检索条件。

【输出要求】只输出 JSON：
{"query":{"text":"","from":"","since":0,"until":0,"hasAttachment":false,"unreadOnly":false},"explanation":"..."}`;
}

/** 翻译 */
export function promptTranslate(body: string, targetLanguage: string) {
  return `把下面的邮件正文翻译为${targetLanguage}。保留专有名词、型号、标准编号、日期与数字不变，保持原有分段。只输出译文。

【正文】
${body}`;
}

/** 连接测试 */
export function promptPing() {
  return '请只回复这一行文字：知邮 AI 连接正常。不要添加任何其他内容。';
}
