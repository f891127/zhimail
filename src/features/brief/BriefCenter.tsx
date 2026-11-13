/** 邮件简报中心：左侧按日报/周报/月报/自定义分组，右侧阅读与导出 */

import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { dateOnly, fullTime } from '@/lib/format';
import { renderMarkdown } from '@/lib/markdown';
import { ContextMenu } from '@/components/ContextMenu';

/** 简报不再分子目录，列表里用标签区分周期 */
const KIND_LABEL: Record<string, string> = {
  daily: '日报',
  weekly: '周报',
  monthly: '月报',
  yearly: '年报',
  custom: '自定义',
};

export function BriefCenter() {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; title: string } | null>(null);
  const store = useAppStore();
  const { briefs, selectedBriefId, aiBusy } = store;

  const filtered = useMemo(() => briefs, [briefs]);

  const selected = briefs.find((brief) => brief.id === selectedBriefId) ?? filtered[0];

  return (
    <div className="flex h-full min-w-0 flex-1 bg-white">
      {/* 列表 */}
      <div className="flex w-[300px] shrink-0 flex-col border-r border-shell-line">
        <div className="flex h-[38px] shrink-0 items-center gap-1.5 border-b border-shell-line bg-[#fafbfc] px-2.5">
          <Icon name="document" size={14} className="text-brand-600" />
          <span className="text-xs font-semibold text-shell-text">邮件简报</span>
          <span className="text-[10px] tabular-nums text-shell-faint">{filtered.length} 份</span>
          <button
            type="button"
            className="ml-auto rounded p-1 text-shell-faint hover:bg-black/5 hover:text-brand-600"
            title="生成新简报"
            onClick={() => store.setAIPanel(true, 'brief')}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-shell-lineSoft px-2.5 py-1.5">
          {(['daily', 'weekly', 'monthly', 'yearly', 'custom'] as const).map((kind) => {
            const count = briefs.filter((brief) => brief.kind === kind).length;
            if (!count) return null;
            return (
              <span
                key={kind}
                className="rounded bg-black/[0.04] px-1.5 py-[2px] text-[11px] text-shell-sub"
                title={`${KIND_LABEL[kind]}共 ${count} 份`}
              >
                {KIND_LABEL[kind]} {count}
              </span>
            );
          })}
          <span className="ml-auto text-[11px] text-shell-faint">全部 {briefs.length} 份</span>
        </div>

        <div className="scroll-area flex-1">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-shell-faint">
              <Icon name="document" size={28} className="text-shell-line" strokeWidth={1.2} />
              <p className="text-xs">还没有简报，生成一份试试</p>
              <button type="button" className="ghost-btn" onClick={() => store.setAIPanel(true, 'brief')}>
                <Icon name="sparkles" size={12} className="text-brand-500" />
                生成一份
              </button>
            </div>
          )}
          {filtered.map((brief) => (
            <button
              key={brief.id}
              type="button"
              onClick={() => store.selectBrief(brief.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                store.selectBrief(brief.id);
                setMenu({ x: event.clientX, y: event.clientY, id: brief.id, title: brief.title });
              }}
              className={`flex w-full flex-col gap-1 border-b border-shell-lineSoft px-2.5 py-2 text-left transition-colors duration-120 ${
                selected?.id === brief.id ? 'bg-brand-50' : 'hover:bg-brand-50/50'
              }`}
            >
              <div className="flex items-start gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-shell-text">{brief.title}</span>
                {brief.auto && (
                  <span className="shrink-0 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">自动</span>
                )}
              </div>
              <div className="text-[10px] text-shell-faint">
                {dateOnly(brief.rangeStart)} ~ {dateOnly(brief.rangeEnd)}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-shell-sub">
                <span className="flex items-center gap-0.5">
                  <Icon name="mail" size={10} /> {brief.messageCount}
                </span>
                <span className="flex items-center gap-0.5">
                  <Icon name="checklist" size={10} /> {brief.todoCount}
                </span>
                <span className="ml-auto tabular-nums text-shell-faint">{fullTime(brief.createdAt).slice(5, 16)}</span>
              </div>
            </button>
          ))}
          {menu && (
            <ContextMenu
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
              items={[
                { label: '打开这份简报', onClick: () => store.selectBrief(menu.id) },
                {
                  label: '导出为 Word',
                  onClick: () => void store.exportBrief(menu.id, 'docx'),
                },
                {
                  label: '导出为 HTML',
                  onClick: () => void store.exportBrief(menu.id, 'html'),
                },
                { divider: true, label: '' },
                {
                  label: '删除本条简报',
                  danger: true,
                  onClick: () => {
                    void store.removeBrief(menu.id);
                  },
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* 阅读 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!selected && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-shell-faint">
            <Icon name="document" size={32} className="text-shell-line" strokeWidth={1.2} />
            <p className="text-xs">选择左侧简报查看内容</p>
          </div>
        )}

        {selected && (
          <>
            <div className="shrink-0 border-b border-shell-line px-4 pt-3 pb-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-semibold leading-6 text-shell-text">{selected.title}</h1>
                  <p className="mt-1 text-[11px] text-shell-sub">
                    统计区间：{dateOnly(selected.rangeStart)} 至 {dateOnly(selected.rangeEnd)}
                    <span className="mx-1.5 text-shell-line">|</span>
                    范围：{selected.scopeLabel}
                    <span className="mx-1.5 text-shell-line">|</span>
                    邮件 {selected.messageCount} 封
                    <span className="mx-1.5 text-shell-line">|</span>
                    待办 {selected.todoCount} 条
                    <span className="mx-1.5 text-shell-line">|</span>
                    模型 {selected.model}（{selected.provider}）
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void store.exportBrief(selected.id, 'docx')}
                    title="导出为可编辑 Word 文档"
                  >
                    <Icon name="download" size={12} /> Word
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void store.exportBrief(selected.id, 'html')}
                  >
                    HTML
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void store.exportBrief(selected.id, 'md')}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className="tool-btn text-accent-600"
                    onClick={() => void store.removeBrief(selected.id)}
                    title="删除简报"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            </div>

            <div className="scroll-area flex-1 px-5 py-4">
              <div className="mx-auto max-w-[820px]">
                <div className="mb-3 flex gap-2">
                  <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
                    <div className="text-[15px] font-semibold tabular-nums text-shell-text">{selected.stats.total}</div>
                    <div className="text-[10px] text-shell-faint">邮件总数</div>
                  </div>
                  <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
                    <div className="text-[15px] font-semibold tabular-nums text-accent-600">{selected.stats.unread}</div>
                    <div className="text-[10px] text-shell-faint">未读</div>
                  </div>
                  <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
                    <div className="text-[15px] font-semibold tabular-nums text-shell-text">
                      {selected.stats.withAttachment}
                    </div>
                    <div className="text-[10px] text-shell-faint">含附件</div>
                  </div>
                  <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
                    <div className="text-[15px] font-semibold tabular-nums text-shell-text">{selected.todoCount}</div>
                    <div className="text-[10px] text-shell-faint">提取待办</div>
                  </div>
                  <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
                    <div className="text-[15px] font-semibold tabular-nums text-shell-text">
                      {selected.stats.busiestDay.count}
                    </div>
                    <div className="text-[10px] text-shell-faint">单日峰值（{selected.stats.busiestDay.day}）</div>
                  </div>
                </div>

                <div
                  className="md-body pb-8"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.markdown) }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {aiBusy && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded bg-shell-text/85 px-3 py-1.5 text-[11px] text-white shadow-card">
          正在生成简报…
        </div>
      )}
    </div>
  );
}
