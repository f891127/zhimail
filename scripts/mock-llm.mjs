/**
 * 本地模拟 OpenAI 兼容接口，用于在无真实 API Key 的情况下联调 AI 全链路。
 * 用法：node scripts/mock-llm.mjs [port]
 */

import http from 'node:http';

const PORT = Number(process.argv[2] ?? 8787);

const SUMMARY_MD = `### 一句话结论
客户要求本周四前确认电气控制方案的 5 条修改意见，涉及安全联锁与报警追溯。

### 关键要点
- 门密封未到位时仅报警不停机，不符合 GB 8599-2008 第 5.4.7 条，需串入加热与抽真空回路。
- 温度压力记录采样间隔需由 2 分钟调整为 30 秒，年数据量约 3.2 GB。
- 新增 134℃/4min 预真空程序，需明确是否强制做 B-D 测试。
- 报警追溯需记录确认人与确认时间，工作量约 3 人日。

### 需要我做的事
- 周四前回复 5 条评审意见。
- 评估分批交付：先交付主机，软件后续现场升级。

### 建议动作
回复邮件确认改造范围与交期影响，并同步客户。`;

const ANALYSIS_MD = `## 一、整体概览
本周邮件主要集中在三条主线：1.2m³ 脉动真空灭菌器的电气方案评审、华东 CSSD 第三批验证的偏差处理、仁济医院改造项目的售前推进。整体节奏偏紧，验证偏差与门密封圈质量异常是本周最需要闭环的两件事。

## 二、重点邮件
| 时间 | 发件人 | 主题 | 核心结论 / 诉求 |
| --- | --- | --- | --- |
| 11-07 | 李文博 | 1.2m³ 灭菌器电气控制方案评审意见 | 5 条修改意见，安全联锁需串入加热回路，要求周四前回复 |
| 11-06 | 孙倩 | 批次 B2409 门密封圈早期老化 | 抽检 10 件中 6 件不合格，涉及 4 台整机 |
| 11-05 | 王丽 | 第三批验证数据复核 | 2 锅次生物指示剂阳性，需连续 3 锅次复测 |
| 11-04 | 刘建国 | 仁济医院改造询价 | 2 台 1.5m³ 灭菌器，11-20 前报方案 |
| 11-03 | 陈志强 | 真空泵交期延期 | 延期至 12-08，需 11-12 前答复替代方案 |

## 三、主题聚类
- **灭菌器电气方案**：涉及 3 封邮件，核心是安全联锁与数据采样间隔。
- **验证与质量异常**：涉及 4 封邮件，含生物指示剂阳性与密封圈老化两个独立问题。
- **售前与交付**：涉及 3 封邮件，仁济医院项目进入方案阶段，真空泵延期影响 12 月交付。

## 四、风险与异常
- 真空泵延期 18 天，若客户不接受替代方案，12 月交付存在违约风险。
- 密封圈批次问题已波及 2 台已发货设备，存在现场停机与客户投诉风险。

## 五、跟进建议
- 今日内回复李文博评审意见，明确安全联锁改造范围与交期影响（房秀杰）。
- 与质量部确认已发货 2 台的现场更换方案（孙倩、房秀杰）。
- 11-12 前答复布驰真空的替代方案，同步客户交付计划（房秀杰）。

## 六、待办事项
- [ ] 回复 1.2m³ 灭菌器电气方案评审意见 ｜ 截止：本周四 ｜ 优先级：高
- [ ] 确认已发货 2 台的密封圈现场更换方案 ｜ 截止：本周三 ｜ 优先级：高
- [ ] 答复真空泵替代方案并同步客户 ｜ 截止：11-12 ｜ 优先级：高`;

const TODOS_JSON = JSON.stringify({
  todos: [
    {
      title: '回复 1.2m³ 灭菌器电气方案评审意见（5 条）',
      detail: '安全联锁需串入加热与抽真空回路；报警追溯需增加确认人与确认时间。',
      due: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      priority: 'high',
      sourceSubject: '关于 1.2m³ 脉动真空灭菌器电气控制方案评审的几点意见',
    },
    {
      title: '确认已发货 2 台设备的密封圈现场更换方案',
      detail: '批次 B2409 抽检 6/10 不合格，需评估停机影响。',
      due: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      priority: 'high',
      sourceSubject: '质量异常：批次 B2409 门密封圈早期老化',
    },
    {
      title: '答复真空泵替代方案并同步客户交付计划',
      detail: 'XD-40B 可替代 3 台，需在 11-12 前回复。',
      due: null,
      priority: 'medium',
      sourceSubject: '【交期变更】真空泵与电磁阀到货延期通知',
    },
  ],
});

const REPLIES_JSON = JSON.stringify({
  suggestions: [
    {
      tone: 'formal',
      body: '李工：\n\n评审意见收悉，5 条意见我方逐条确认如下：安全联锁将改为门到位信号串入加热与抽真空回路；温度压力记录采样间隔调整为 30 秒；134℃/4min 程序强制前置 B-D 测试；报警追溯随登录模块一并改造。\n\n按此范围评估，电气部分需 10 个工作日。建议分两批交付：主机按现方案先行，软件升级现场实施。请确认。\n\n房秀杰',
    },
    {
      tone: 'concise',
      body: '李工：\n\n5 条意见全部采纳。安全联锁改串入回路，采样改 30 秒，134℃ 程序前置 B-D，报警追溯与登录模块一起改。\n\n全改需 10 个工作日，建议主机先交、软件现场升级。今天内给你确认结论。',
    },
    {
      tone: 'friendly',
      body: '李工：\n\n意见看完了，都是关键点，尤其是门密封那条，确实得串进回路才算数。\n\n我这边排了下工作量，全改大概 10 个工作日。要不主机先走，软件到现场再升？你看这样客户能不能接受。\n\n房秀杰',
    },
  ],
});

const TRIAGE_JSON = JSON.stringify({
  importance: 'high',
  urgency: 'high',
  reason: '涉及安全联锁合规性与客户交期，要求 48 小时内回复。',
  labels: ['客户', '质量', '交期'],
});

function pickReply(userText) {
  if (userText.includes('只回复这一行文字')) return '智邮 AI 连接正常。';
  if (userText.includes('抽取「需要收件人去做」的待办')) return TODOS_JSON;
  if (userText.includes('3 条可直接发送的中文回复草稿')) return REPLIES_JSON;
  if (userText.includes('重要度与紧急度')) return TRIAGE_JSON;
  if (userText.includes('邮件汇总分析')) return ANALYSIS_MD;
  if (userText.includes('翻译为')) return 'Dear Li,\n\nThank you for the review comments. We accept all five points...';
  if (userText.includes('压缩为结构化要点')) return '### 本批概览\n本批邮件主要推进灭菌器电气方案与验证偏差处理。\n### 重要邮件\n- 【李文博｜11-07】方案评审 → 5 条意见待确认\n### 待办线索\n- 周四前回复评审意见';
  if (userText.includes('自然语言搜索需求')) {
    return JSON.stringify({
      query: { text: '灭菌验证', from: '', since: Date.now() - 14 * 86400000, until: 0, hasAttachment: false, unreadOnly: false },
      explanation: '检索近两周内与「灭菌验证」相关的邮件',
    });
  }
  if (userText.includes('会话串')) return '### 会话概况\n王丽与房秀杰就第三批验证的 2 锅次阳性结果沟通，已确定 11-14 复测。\n\n### 时间线要点\n- 【11-05】王丽：2 锅次生物指示剂阳性，请示复测范围\n- 【11-05】房秀杰：需连续 3 锅次验证，含 1 次空载 B-D\n- 【11-06】王丽：对照培养全部阴性，怀疑蒸汽质量\n\n### 待确认 / 分歧点\n- 第 7 锅升温段 40 秒温度平台的原因尚未确认\n\n### 当前状态\n待我方回复曲线分析结论\n\n### 下一步建议\n- 房秀杰分析 11-06 曲线并回复';
  if (userText.includes('润色')) {
    return '关于本次方案，存在以下几点需要调整：安全联锁逻辑需串入加热与抽真空回路；温度压力记录采样间隔建议由 2 分钟调整为 30 秒。请在确认后回复。';
  }
  if (userText.includes('生成摘要')) return SUMMARY_MD;
  return '已按你的要求处理完成。';
}

const server = http.createServer((req, res) => {
  // 余额查询（DeepSeek 格式），用于联调「测试余额查询」
  if ((req.url ?? '').includes('user/balance')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        is_available: true,
        balance_infos: [
          { currency: 'CNY', total_balance: '128.66', granted_balance: '8.66', topped_up_balance: '120.00' },
        ],
      }),
    );
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ id: 'mock-model' }] }));
    return;
  }
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    let body = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      body = {};
    }
    const messages = body.messages ?? [];
    const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const content = pickReply(String(userText));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-mock',
        model: body.model ?? 'mock-model',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1200, completion_tokens: 480, total_tokens: 1680 },
      }),
    );
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-llm] listening on http://127.0.0.1:${PORT}/v1`);
});
