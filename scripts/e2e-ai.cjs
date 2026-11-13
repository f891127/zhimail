/**
 * 在 Electron 主进程内运行 AI 全链路验证（使用本地 mock 模型服务）。
 * 用法：xvfb-run -a ./node_modules/electron/dist/electron scripts/e2e-ai.cjs --no-sandbox
 */

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const { store } = require('../dist-electron/services/store');
    const { seedDemoData } = require('../dist-electron/services/demo');
    const tasks = require('../dist-electron/services/ai/tasks');
    const briefService = require('../dist-electron/services/brief');
    const todoService = require('../dist-electron/services/todo');
    const { groupThreads } = require('../dist-electron/services/thread');
    const translateService = require('../dist-electron/services/translate');

    const dataDir = path.join(os.tmpdir(), `zhimail-e2e-${Date.now()}`);
    store.init(dataDir);
    const seeded = seedDemoData(false);
    check('演示数据播种', seeded.seeded === true, `account=${store.listAccounts().length}`);

    store.setAIKey('test-key');
    store.updateSettings({
      ai: {
        provider: 'custom',
        baseUrl: 'http://127.0.0.1:8787/v1',
        model: 'mock-model',
        temperature: 0.3,
        maxTokens: 2000,
        timeoutMs: 30000,
        metadataOnly: false,
        hasApiKey: true,
      },
    });

    const inbox = store.listFolders('demo-account').find((f) => f.kind === 'inbox');
    check('收件箱文件夹存在', Boolean(inbox), inbox && inbox.id);
    const inboxMessages = store.queryMessages({ folderId: inbox.id, limit: 100 }).items;
    check('收件箱邮件数', inboxMessages.length >= 10, `count=${inboxMessages.length}`);

    // 1. 连接测试
    const ping = await tasks.testAIConnection();
    check('AI 连接测试', ping.ok && ping.reply.includes('正常'), ping.reply);

    // 2. 单封长邮件摘要
    const longMail = inboxMessages.find((m) => m.subject.includes('电气控制方案'));
    const summary = await tasks.summarizeMessage(longMail.id);
    check('长邮件摘要', summary.includes('一句话结论') && summary.length > 100, `len=${summary.length}`);

    // 3. 会话串摘要
    const threads = groupThreads(store.queryMessages({ folderId: inbox.id, limit: 100 }).items);
    const thread = threads.find((t) => t.count > 1);
    const threadSummary = thread ? await tasks.summarizeThread(thread.threadId) : null;
    check('会话串摘要', Boolean(threadSummary && threadSummary.markdown.includes('会话概况')), threadSummary ? `count=${threadSummary.count}` : 'no-thread');

    // 4. 区间汇总分析 + 待办抽取
    const now = Date.now();
    const analysis = await tasks.analyzeRange({ rangeStart: now - 14 * 86400000, rangeEnd: now, scope: 'inbox' });
    check('区间汇总分析', analysis.markdown.includes('整体概览'), `total=${analysis.stats.total} batches=${analysis.batches}`);
    check('汇总内待办抽取', analysis.todos.length > 0, `todos=${analysis.todos.length}`);

    // 5. 生成简报并落库
    const brief = await briefService.generateBrief({
      rangeStart: now - 7 * 86400000,
      rangeEnd: now,
      scope: 'inbox',
      briefKind: 'weekly',
      title: 'E2E 测试周报',
    });
    check('简报生成并入库', Boolean(store.getBrief(brief.id)), `${brief.id} todos=${brief.todoCount}`);
    check('简报进入「邮件简报」分组', brief.group === 'briefs/weekly', brief.group);
    const listed = briefService.listBriefs('briefs/weekly');
    check('简报分组查询', listed.some((item) => item.id === brief.id), `count=${listed.length}`);

    // 6. 导出三种格式
    for (const format of ['md', 'html', 'docx']) {
      const exported = await briefService.exportBrief(brief.id, format);
      const exists = fs.existsSync(exported.path);
      const size = exists ? fs.statSync(exported.path).size : 0;
      check(`简报导出 ${format.toUpperCase()}`, exists && size > 200, `${path.basename(exported.path)} ${size}B`);
      if (format === 'docx' && exists) {
        const head = fs.readFileSync(exported.path).subarray(0, 2).toString('binary');
        check('docx 为合法 ZIP 包（可编辑 Word）', head === 'PK', head.charCodeAt(0) === 0x50 ? 'PK' : 'invalid');
      }
    }

    // 7. 单封邮件提取待办
    const todoDrafts = await tasks.extractTodosFromMessage(longMail.id);
    const created = todoService.createTodoItems(todoDrafts, { messageId: longMail.id, sourceSubject: longMail.subject });
    check('单封邮件待办提取', created.length > 0, `count=${created.length}`);
    check('待办持久化', store.listTodos().length >= created.length, `total=${store.listTodos().length}`);

    // 8. 回复建议
    const replies = await tasks.suggestReplies(longMail.id);
    check('一键回复建议（3 条）', replies.length === 3 && replies.every((r) => r.body.length > 20), replies.map((r) => r.label).join('/'));

    // 9. 重要度判定
    const triage = await tasks.triageMessage(longMail.id);
    check('重要度判定', triage.importance === 'high' && triage.labels.length > 0, `${triage.importance}/${triage.urgency}`);

    // 10. 智能搜索解析
    const interpretation = await tasks.interpretSearch('上周张工发来的关于灭菌验证的邮件');
    check('智能搜索解析', interpretation.usedAI && Boolean(interpretation.query), interpretation.explanation);

    // 11. 写作辅助
    const assist = await tasks.composeAssist({ action: 'polish', text: '这个方案有问题，你改一下。', subject: '方案反馈' });
    check('写作辅助（润色）', assist.length > 10, `len=${assist.length}`);

    // 12. 翻译
    const translated = await tasks.translateMessage(longMail.id, 'English');
    check(
      '邮件翻译（大模型）',
      translated.body.length > 10 && translated.engine === 'llm',
      `len=${translated.body.length} engine=${translated.engine}`,
    );

    // 12b. 内置免费翻译引擎（无需 API Key）
    const builtin = await translateService.translateText(
      'The chamber door must not be pressurized until the locking mechanism is engaged.',
      '中文',
      'builtin',
    );
    check(
      '内置免费翻译引擎',
      builtin.engine === 'builtin' && builtin.text.length > 4,
      `engine=${builtin.engine} text=${builtin.text.slice(0, 20)}`,
    );

    // 13. 调度周期计算（多组排程：日/周/月/年/自定义）
    const { computePeriod } = require('../dist-electron/services/scheduler');
    const base = {
      id: 'test',
      name: 'test',
      enabled: true,
      time: '08:30',
      weekday: 1,
      dayOfMonth: 1,
      month: 1,
      days: 7,
      scope: 'all',
      anchorAt: 0,
      lastRun: {},
    };
    const periodNow = new Date('2026-11-12T09:00:00');
    const daily = computePeriod({ ...base, frequency: 'daily' }, periodNow);
    const weekly = computePeriod({ ...base, frequency: 'weekly' }, periodNow);
    const monthly = computePeriod({ ...base, frequency: 'monthly' }, periodNow);
    const yearly = computePeriod({ ...base, frequency: 'yearly', month: 1, dayOfMonth: 1 }, periodNow);
    const custom14 = computePeriod({ ...base, frequency: 'custom', days: 14 }, periodNow);
    check('简报周期（每日）', daily.start < daily.end && daily.end <= periodNow.getTime(), `${new Date(daily.start).toISOString().slice(0, 10)}~${new Date(daily.end).toISOString().slice(0, 10)}`);
    check('简报周期（每周）', weekly.end - weekly.start > 6 * 86400000 - 1000, `${Math.round((weekly.end - weekly.start) / 86400000)}天`);
    check('简报周期（每月）', monthly.end - monthly.start >= 27 * 86400000, `${Math.round((monthly.end - monthly.start) / 86400000)}天`);
    check('简报周期（每年）', Math.round((yearly.end - yearly.start + 1) / 86400000) === 365 || Math.round((yearly.end - yearly.start + 1) / 86400000) === 366, `${Math.round((yearly.end - yearly.start + 1) / 86400000)}天`);
    check('简报周期（自定义每 14 天）', Math.round((custom14.end - custom14.start + 1) / 86400000) === 14, `${Math.round((custom14.end - custom14.start + 1) / 86400000)}天`);

    // 14. 设置持久化
    store.flush();
    const stateFile = path.join(dataDir, 'state.json');
    check('本地状态落盘', fs.existsSync(stateFile) && JSON.parse(fs.readFileSync(stateFile, 'utf8')).briefs.length > 0, `${(fs.statSync(stateFile).size / 1024).toFixed(1)}KB`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n=== 结果：${results.length - failed.length}/${results.length} 通过 ===`);
    if (failed.length) console.log('失败项：', failed.map((f) => f.name).join('、'));
    fs.writeFileSync(path.join(process.cwd(), 'shots', 'e2e-report.json'), JSON.stringify(results, null, 2));
    app.exit(failed.length ? 1 : 0);
  } catch (error) {
    console.error('E2E 异常：', error);
    app.exit(2);
  }
});
