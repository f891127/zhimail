/** 版本更新日志：升级后首次启动自动展示本次更新内容，也可随时从菜单查看历史版本 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { changelogEntries, findChangelogEntry, type ChangelogEntry } from '@/lib/changelog';

function EntryBlock({
  entry,
  current,
  highlighted,
  expanded,
  onToggle,
}: {
  entry: ChangelogEntry;
  current: boolean;
  highlighted: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[4px] border transition-colors duration-120 ${
        highlighted ? 'border-brand-300 bg-brand-50/40' : 'border-shell-line bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02]"
      >
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} className="shrink-0 text-shell-faint" />
        <span className="text-[13px] font-semibold text-shell-text">v{entry.version}</span>
        {current && (
          <span className="rounded bg-brand-500 px-1.5 py-[1px] text-[10px] font-medium text-white">当前版本</span>
        )}
        {highlighted && !current && (
          <span className="rounded bg-accent-500 px-1.5 py-[1px] text-[10px] font-medium text-white">新版本</span>
        )}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-shell-faint">{entry.date}</span>
      </button>

      {expanded && (
        <div className="border-t border-shell-lineSoft px-3 pb-3 pt-2">
          {entry.groups.map((group) => (
            <div key={group.title} className="mb-2 last:mb-0">
              <p className="mb-1 text-[11px] font-semibold text-brand-700">{group.title}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-1.5 text-[12px] leading-[19px] text-shell-sub">
                    <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-shell-faint" />
                    <span className="min-w-0 flex-1">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChangelogDialog() {
  const { changelogOpen, changelogHighlight, changelogAuto, closeChangelog, info } = useAppStore();
  const currentVersion = info?.version ?? '';
  const [expanded, setExpanded] = useState<string | null>(null);

  const entries = useMemo(() => changelogEntries, []);

  useEffect(() => {
    if (!changelogOpen) return;
    setExpanded(changelogHighlight ?? findChangelogEntry(currentVersion)?.version ?? entries[0]?.version ?? null);
  }, [changelogOpen, changelogHighlight, currentVersion, entries]);

  useEffect(() => {
    if (!changelogOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChangelog();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [changelogOpen, closeChangelog]);

  if (!changelogOpen) return null;

  const highlightEntry = changelogHighlight ? findChangelogEntry(changelogHighlight) : undefined;
  // 只保留当前版本（或刚升级到的那一版）的更新说明
  const versionKey = (changelogHighlight ?? currentVersion).replace(/^v/, '');
  const matched = entries.filter((entry) => entry.version === versionKey);
  const visibleEntries = matched.length ? matched : entries.slice(0, 1);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 p-6 animate-fade-in">
      <div className="flex max-h-[76vh] w-[560px] flex-col overflow-hidden rounded-md border border-shell-line bg-shell-panel shadow-card">
        <div className="flex shrink-0 items-center gap-2 border-b border-shell-line bg-[#fafbfc] px-4 py-2.5">
          <Icon name="sparkles" size={14} className="text-brand-500" />
          <span className="text-[13px] font-semibold text-shell-text">
            {changelogAuto ? '本次更新内容' : '版本更新日志'}
          </span>
          <span className="text-[11px] text-shell-faint">当前版本 v{currentVersion}</span>
          <button
            type="button"
            data-changelog-close
            onClick={closeChangelog}
            className="ml-auto rounded p-1 text-shell-faint transition-colors duration-120 hover:bg-black/[0.05] hover:text-shell-text"
            title="关闭"
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        {changelogAuto && highlightEntry && (
          <div className="shrink-0 border-b border-brand-100 bg-brand-50/60 px-4 py-2 text-[11px] leading-[18px] text-brand-700">
            已更新到 v{highlightEntry.version}（{highlightEntry.date}），以下是本次更新包含的改动。
          </div>
        )}

        <div className="scroll-area flex-1 space-y-2 p-3">
          {visibleEntries.map((entry) => (
            <EntryBlock
              key={entry.version}
              entry={entry}
              current={entry.version === currentVersion.replace(/^v/, '')}
              highlighted={entry.version === (changelogHighlight ?? '').replace(/^v/, '')}
              expanded
              onToggle={() => undefined}
            />
          ))}
          {entries.length === 0 && <p className="px-2 py-6 text-center text-xs text-shell-faint">暂无更新日志</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-shell-line bg-[#fafbfc] px-4 py-2">
          <span className="text-[11px] text-shell-faint">下载与更新：zhiyou-emy2c9va.manus.space</span>
          <button
            type="button"
            onClick={closeChangelog}
            className="ml-auto rounded border border-shell-line bg-white px-3 py-[4px] text-[12px] text-shell-text transition-colors duration-120 hover:bg-black/[0.03]"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
