/** AI 助手面板：汇总分析 / 简报 / 辅助（回复·翻译·重要度）/ 待办 */

import { useMemo, useState } from 'react';
import { useAppStore, type AITab } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { renderMarkdown } from '@/lib/markdown';
import { addressLabel, dateOnly, fullTime, PRIORITY_LABEL } from '@/lib/format';
import { RANGE_PRESETS, applyPreset, fromDateInput, toDateInput, type RangePresetId } from '@/lib/range';
import type { RangeAnalysisParams } from '@/types/zhimail';

const TABS: { id: AITab; label: string; icon: 'chart' | 'document' | 'send' | 'checklist' }[] = [
  { id: 'analysis', label: '汇总分析', icon: 'chart' },
  { id: 'brief', label: '简报', icon: 'document' },
  { id: 'assist', label: '写作·回复', icon: 'send' },
  { id: 'todo', label: '待办', icon: 'checklist' },
];

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="flex-1 rounded border border-shell-lineSoft bg-white px-2 py-1.5">
      <div className={`text-[15px] font-semibold tabular-nums ${tone ?? 'text-shell-text'}`}>{value}</div>
      <div className="text-[10px] text-shell-faint">{label}</div>
    </div>
  );
}

export function AIAssistantPanel() {
  const store = useAppStore();
  const {
    aiTab,
    aiBusy,
    aiProgress,
    aiOutputs,
    analysisParams,
    folders,
    selectedFolderId,
    selectedMessage,
    settings,
    todos,
    briefs,
    aiPanelOpen,
  } = store;

  const [preset, setPreset] = useState<RangePresetId>('last7');
  const [startDate, setStartDate] = useState(toDateInput(Date.now() - 7 * 86400000));
  const [endDate, setEndDate] = useState(toDateInput(Date.now()));
  const [scope, setScope] = useState<RangeAnalysisParams['scope']>(analysisParams.scope ?? 'inbox');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [copied, setCopied] = useState(false);

  const currentFolder = folders.find((folder) => folder.id === selectedFolderId);

  const params: RangeAnalysisParams = useMemo(() => {
    const range =
      preset === 'custom'
        ? { start: fromDateInput(startDate), end: fromDateInput(endDate, true) }
        : applyPreset(preset) ?? { start: Date.now() - 7 * 86400000, end: Date.now() };
    return {
      rangeStart: range.start,
      rangeEnd: range.end,
      scope,
      folderId: scope === 'folder' ? selectedFolderId ?? undefined : undefined,
      from: scope === 'filtered' ? filterFrom || undefined : undefined,
      keyword: scope === 'filtered' ? filterKeyword || undefined : undefined,
    };
  }, [preset, startDate, endDate, scope, selectedFolderId, filterFrom, filterKeyword]);

  const analysis = aiOutputs.analysis;
  const replies = aiOutputs.replies;
  const translate = aiOutputs.translate;
  const triage = aiOutputs.triage;

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const insertReply = (body: string) => {
    if (!selectedMessage) return;
    const account = store.accounts.find((item) => item.id === selectedMessage.accountId);
    const sender = selectedMessage.from[0];
    store.openCompose({
      mode: 'reply',
      accountId: selectedMessage.accountId,
      to: sender?.address ?? '',
      subject: /^re[:：]/i.test(selectedMessage.subject) ? selectedMessage.subject : `Re: ${selectedMessage.subject}`,
      html: `${body.split('\n').map((line) => `<p>${line || '<br/>'}</p>`).join('')}`,
      inReplyTo: selectedMessage.messageId,
      references: [...(selectedMessage.references ?? []), selectedMessage.messageId].filter(Boolean) as string[],
    });
    void account;
  };

  if (!aiPanelOpen) return null;

  return (
    <div className="md-compact flex h-full w-[408px] shrink-0 flex-col border-l border-shell-line bg-[#fbfcfd] animate-slide-in-right">
      <div className="flex h-[38px] shrink-0 items-center gap-1 border-b border-shell-line bg-white px-2">
        <Icon name="sparkles" size={14} className="text-brand-500" />
        <span className="text-xs font-semibold text-shell-text">AI 助手</span>
        <span className="ml-1 rounded bg-shell-chrome px-1 text-[10px] text-shell-sub">
          {settings?.ai.hasApiKey ? settings.ai.model : '未配置模型'}
        </span>
        <button
          type="button"
          className="ml-auto rounded p-1 text-shell-faint hover:bg-black/5 hover:text-shell-text"
          onClick={() => store.setAIPanel(false)}
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="flex shrink-0 border-b border-shell-line bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => store.setAIPanel(true, tab.id)}
            className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-1.5 text-[11px] transition-colors duration-120 ${
              aiTab === tab.id
                ? 'border-brand-500 font-medium text-brand-700'
                : 'border-transparent text-shell-sub hover:text-shell-text'
            }`}
          >
            <Icon name={tab.icon} size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {aiBusy && (
        <div className="flex shrink-0 items-center gap-2 border-b border-brand-100 bg-brand-50 px-3 py-1.5 text-[11px] text-brand-700">
          <Icon name="refresh" size={11} className="animate-spin" />
          <span className="truncate">{aiProgress ?? '正在处理…'}</span>
        </div>
      )}

      <div className="scroll-area flex-1 px-3 py-2.5">
        {!settings?.ai.hasApiKey && (
          <div className="mb-2.5 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
            <Icon name="alert" size={12} className="mt-[1px] shrink-0" />
            <div>
              尚未配置大模型 API。前往
              <button
                type="button"
                className="mx-0.5 font-medium text-amber-900 underline"
                onClick={() => store.openSettings('ai')}
              >
                设置 → AI 助手
              </button>
              填写 Base URL、API Key 与模型名称后即可使用全部 AI 功能。
            </div>
          </div>
        )}

        {aiTab === 'analysis' && (
          <div className="space-y-2.5">
            <div>
              <div className="mb-1 text-[11px] font-medium text-shell-sub">时间范围</div>
              <div className="flex flex-wrap gap-1">
                {RANGE_PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setPreset(item.id);
                      const range = item.compute();
                      setStartDate(toDateInput(range.start));
                      setEndDate(toDateInput(range.end));
                    }}
                    className={`rounded border px-1.5 py-[3px] text-[11px] transition-colors duration-120 ${
                      preset === item.id
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-shell-line bg-white text-shell-sub hover:border-brand-300 hover:text-brand-600'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPreset('custom')}
                  className={`rounded border px-1.5 py-[3px] text-[11px] transition-colors duration-120 ${
                    preset === 'custom'
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-shell-line bg-white text-shell-sub hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  自定义
                </button>
              </div>
              {preset === 'custom' && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="field py-1" />
                  <span className="text-[11px] text-shell-faint">至</span>
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="field py-1" />
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 text-[11px] font-medium text-shell-sub">分析范围</div>
              <select value={scope} onChange={(event) => setScope(event.target.value as RangeAnalysisParams['scope'])} className="field py-1">
                <option value="inbox">全部账户收件箱</option>
                <option value="all">全部邮件（含已发送）</option>
                <option value="folder">当前文件夹{currentFolder ? `（${currentFolder.name}）` : ''}</option>
                <option value="filtered">自定义筛选</option>
              </select>
              {scope === 'filtered' && (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <input
                    value={filterFrom}
                    onChange={(event) => setFilterFrom(event.target.value)}
                    placeholder="发件人包含…"
                    className="field py-1"
                  />
                  <input
                    value={filterKeyword}
                    onChange={(event) => setFilterKeyword(event.target.value)}
                    placeholder="关键词包含…"
                    className="field py-1"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="primary-btn w-full justify-center"
              disabled={aiBusy}
              onClick={() => void store.runAnalysis(params)}
            >
              <Icon name="sparkles" size={13} />
              {aiBusy ? '分析中…' : '开始汇总分析'}
            </button>

            {analysis && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <StatTile label="邮件总数" value={analysis.stats.total} />
                  <StatTile label="未读" value={analysis.stats.unread} tone="text-accent-600" />
                  <StatTile label="含附件" value={analysis.stats.withAttachment} />
                  <StatTile label="分批" value={analysis.batches} />
                </div>
                <div className="rounded border border-shell-lineSoft bg-white p-2.5">
                  <div
                    className="md-body"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis.markdown) }}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void store.generateBriefFromAnalysis('daily', `邮件日报 · ${dateOnly(Date.now())}`)}
                  >
                    <Icon name="document" size={12} /> 存为日报
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void store.generateBriefFromAnalysis('weekly')}
                  >
                    存为周报
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void store.generateBriefFromAnalysis('monthly')}
                  >
                    存为月报
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void copyText(analysis.markdown)}
                  >
                    <Icon name={copied ? 'check' : 'document'} size={12} /> {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <p className="text-[10px] leading-4 text-shell-faint">
                  「存为…」会把当前汇总结果重新生成一份结构化简报并存入左侧「邮件简报」文件夹，同时写入待办事项。
                </p>
              </div>
            )}

            {!analysis && !aiBusy && (
              <div className="rounded border border-dashed border-shell-line bg-white/60 px-3 py-4 text-[11px] leading-5 text-shell-faint">
                选择时间范围与分析范围后点击「开始汇总分析」。邮件较多时会自动分批压缩再汇总，并在结果中标注实际纳入的邮件数量。
              </div>
            )}
          </div>
        )}

        {aiTab === 'brief' && (
          <div className="space-y-2.5">
            <div className="rounded border border-shell-lineSoft bg-white p-2.5">
              <div className="mb-1.5 text-[11px] font-medium text-shell-sub">快速生成简报</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className="ghost-btn justify-center"
                  disabled={aiBusy}
                  onClick={() => void store.generateBriefDirect({ ...params, rangeStart: Date.now() - 86400000, rangeEnd: Date.now() }, 'daily')}
                >
                  日报
                </button>
                <button
                  type="button"
                  className="ghost-btn justify-center"
                  disabled={aiBusy}
                  onClick={() => void store.generateBriefDirect({ ...params, rangeStart: Date.now() - 7 * 86400000, rangeEnd: Date.now() }, 'weekly')}
                >
                  周报
                </button>
                <button
                  type="button"
                  className="ghost-btn justify-center"
                  disabled={aiBusy}
                  onClick={() => void store.generateBriefDirect({ ...params, rangeStart: Date.now() - 30 * 86400000, rangeEnd: Date.now() }, 'monthly')}
                >
                  月报
                </button>
                <button
                  type="button"
                  className="ghost-btn justify-center"
                  disabled={aiBusy}
                  onClick={() => void store.generateBriefDirect(params, 'custom')}
                >
                  按当前范围
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-shell-faint">
                生成后自动存入「邮件简报」文件夹，可在简报中心阅读并导出 Word / HTML / Markdown。
              </p>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-shell-sub">
                <span>最近简报</span>
                <button type="button" className="text-brand-600 hover:underline" onClick={() => store.setView('briefs')}>
                  全部
                </button>
              </div>
              <div className="space-y-1">
                {briefs.slice(0, 6).map((brief) => (
                  <button
                    key={brief.id}
                    type="button"
                    onClick={() => {
                      store.setView('briefs');
                      store.setBriefGroup(brief.group);
                      store.selectBrief(brief.id);
                    }}
                    className="flex w-full flex-col gap-0.5 rounded border border-shell-lineSoft bg-white px-2 py-1.5 text-left transition-colors duration-120 hover:border-brand-300"
                  >
                    <span className="truncate text-[11px] font-medium text-shell-text">{brief.title}</span>
                    <span className="text-[10px] text-shell-faint">
                      {brief.messageCount} 封 · {brief.todoCount} 条待办 · {fullTime(brief.createdAt)}
                    </span>
                  </button>
                ))}
                {briefs.length === 0 && <p className="text-[11px] text-shell-faint">还没有简报，先生成一份试试。</p>}
              </div>
            </div>
          </div>
        )}

        {aiTab === 'assist' && (
          <div className="space-y-2.5">
            {!selectedMessage && (
              <p className="rounded border border-dashed border-shell-line px-3 py-4 text-[11px] text-shell-faint">
                请先在列表中选中一封邮件，再使用回复建议、翻译与重要度判定。
              </p>
            )}

            {selectedMessage && (
              <div className="rounded border border-shell-lineSoft bg-white p-2.5">
                <div className="mb-1 text-[11px] font-medium text-shell-sub">当前邮件</div>
                <div className="truncate text-[11px] font-medium text-shell-text">{selectedMessage.subject}</div>
                <div className="truncate text-[10px] text-shell-faint">
                  {addressLabel(selectedMessage.from)} · {fullTime(selectedMessage.date)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button type="button" className="ghost-btn" disabled={aiBusy} onClick={() => void store.runReplies(selectedMessage.id)}>
                    <Icon name="send" size={12} /> 一键回复建议
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={aiBusy}
                    onClick={() => void store.runTranslate(selectedMessage.id, 'English')}
                  >
                    译英
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={aiBusy}
                    onClick={() => void store.runTranslate(selectedMessage.id, '中文')}
                  >
                    译中
                  </button>
                  <button type="button" className="ghost-btn" disabled={aiBusy} onClick={() => void store.runTriage(selectedMessage.id)}>
                    重要度
                  </button>
                </div>
              </div>
            )}

            {replies?.suggestions.map((suggestion) => (
              <div key={suggestion.tone} className="rounded border border-shell-lineSoft bg-white p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded bg-brand-50 px-1.5 py-[1px] text-[10px] font-medium text-brand-700">
                    {suggestion.label}
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-[10px] text-brand-600 hover:underline"
                    onClick={() => insertReply(suggestion.body)}
                  >
                    插入到写信窗口
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[11px] leading-5 text-shell-text">{suggestion.body}</p>
              </div>
            ))}

            {translate && (
              <div className="rounded border border-shell-lineSoft bg-white p-2.5">
                <div className="mb-1 text-[11px] font-medium text-shell-sub">翻译结果</div>
                <p className="whitespace-pre-wrap text-[11px] leading-5 text-shell-text">{translate.text}</p>
              </div>
            )}

            {triage && (
              <div className="rounded border border-shell-lineSoft bg-white p-2.5 text-[11px] leading-5 text-shell-text">
                <div className="mb-1 font-medium text-shell-sub">重要度判定</div>
                <div>
                  重要度：{triage.result.importance === 'high' ? '高' : triage.result.importance === 'low' ? '低' : '中'}；
                  紧急度：{triage.result.urgency === 'high' ? '高' : triage.result.urgency === 'low' ? '低' : '中'}
                </div>
                <div className="text-shell-sub">{triage.result.reason}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {triage.result.labels.map((label) => (
                    <span key={label} className="rounded bg-brand-50 px-1.5 py-[1px] text-[10px] text-brand-700">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {aiTab === 'todo' && (
          <div className="space-y-1.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-shell-sub">待办事项</span>
              <button type="button" className="text-[10px] text-brand-600 hover:underline" onClick={() => store.setView('todos')}>
                打开完整面板
              </button>
            </div>
            {todos.length === 0 && (
              <p className="rounded border border-dashed border-shell-line px-3 py-4 text-[11px] text-shell-faint">
                暂无待办。可在汇总分析、简报或单封邮件中提取。
              </p>
            )}
            {todos.slice(0, 12).map((todo) => (
              <label
                key={todo.id}
                className="flex cursor-pointer items-start gap-2 rounded border border-shell-lineSoft bg-white px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={(event) => void store.toggleTodo(todo.id, event.target.checked)}
                  className="mt-[3px] h-3 w-3 accent-brand-500"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[11px] leading-4 ${todo.done ? 'text-shell-faint line-through' : 'text-shell-text'}`}>
                    {todo.title}
                  </span>
                  <span className="text-[10px] text-shell-faint">
                    {PRIORITY_LABEL[todo.priority]}优先级
                    {todo.due ? ` · 截止 ${todo.due}` : ''}
                    {todo.sourceFrom ? ` · 来自 ${todo.sourceFrom}` : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
