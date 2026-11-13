/** 工具栏：左侧只有「写邮件」，其余操作与搜索统一排在右侧（参照 Foxmail 新版布局） */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { ZH_LABEL_KEYS } from '@/lib/i18n';
import { useT } from '@/lib/useT';

export function ToolBar() {
  const store = useAppStore();
  const t = useT();
  const tt = (label: string) => (ZH_LABEL_KEYS[label] ? t(ZH_LABEL_KEYS[label]) : label);
  const {
    selectedMessageId,
    selectedMessage,
    searchActive,
    searchKeyword,
    aiPanelOpen,
    aiBusy,
    view,
    openCompose,
    replyToMessage,
    deleteMessages,
    toggleFlag,
    syncNow,
    search,
    clearSearch,
    setAIPanel,
    setView,
    openSettings,
    accounts,
  } = store;

  const [keyword, setKeyword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setKeyword(searchActive ? searchKeyword : '');
  }, [searchActive, searchKeyword]);

  const flagged = selectedMessage?.flags.includes('\\Flagged') ?? false;
  const realAccount = accounts.find((account) => !account.demo);

  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-shell-line bg-white px-2.5">
      {/* 左侧：只保留写邮件 */}
      <button type="button" className="primary-btn shrink-0" onClick={() => openCompose()}>
        <Icon name="compose" size={14} />
        写邮件
      </button>

      {/* 中间弹性留白，把搜索与操作推到右侧 */}
      <div className="flex-1" />

      {/* 搜索框：宽度自适应，最长 460px */}
      <div className="flex h-[30px] w-full max-w-[460px] min-w-[180px] items-center gap-1 rounded border border-shell-line bg-shell-bg px-2 focus-within:border-brand-400 focus-within:bg-white">
        <Icon name="search" size={14} className="text-shell-faint" />
        <input
          ref={inputRef}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search(keyword, event.shiftKey);
            if (event.key === 'Escape') void clearSearch();
          }}
          placeholder={t('toolbar.searchPlaceholder')}
          className="h-full flex-1 bg-transparent text-xs text-shell-text outline-none placeholder:text-shell-faint"
        />
        {searchActive && (
          <button type="button" className="text-shell-faint hover:text-shell-text" onClick={() => void clearSearch()}>
            <Icon name="close" size={12} />
          </button>
        )}
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-[2px] text-[11px] text-brand-600 transition-colors duration-120 hover:bg-brand-50"
          onClick={() => void search(keyword, true)}
          title="AI 解析自然语言检索条件（Shift+Enter）"
        >
          <Icon name="sparkles" size={12} />
          AI 搜索
        </button>
      </div>

      {/* 搜索框右侧：常用邮件操作 */}
      <div className="ml-1.5 flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className="tool-btn"
          disabled={!selectedMessageId}
          onClick={() => replyToMessage('reply')}
          title="回复 (Ctrl+R)"
        >
          <Icon name="reply" size={15} />
          <span>{tt('回复')}</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!selectedMessageId}
          onClick={() => replyToMessage('replyAll')}
          title="全部回复 (Ctrl+Shift+R)"
        >
          <Icon name="reply-all" size={15} />
          <span>全部</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!selectedMessageId}
          onClick={() => replyToMessage('forward')}
          title="转发 (Ctrl+F)"
        >
          <Icon name="forward" size={15} />
          <span>转发</span>
        </button>
        <div className="mx-0.5 h-5 w-px bg-shell-lineSoft" />
        <button
          type="button"
          className={`tool-btn ${flagged ? 'text-accent-500' : ''}`}
          disabled={!selectedMessageId}
          onClick={() => selectedMessageId && void toggleFlag([selectedMessageId], '\\Flagged', !flagged)}
          title="加星标 / 取消星标"
        >
          <Icon name={flagged ? 'star-filled' : 'star'} size={15} />
          <span>{flagged ? '已星标' : '星标'}</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          disabled={!selectedMessageId}
          onClick={() => selectedMessageId && void deleteMessages([selectedMessageId])}
          title="删除 (Delete)"
        >
          <Icon name="trash" size={15} />
          <span>删除</span>
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => void syncNow()}
          title={realAccount ? '同步邮箱' : '演示邮箱无需同步'}
        >
          <Icon name="refresh" size={15} />
          <span>{tt('同步')}</span>
        </button>
      </div>

      <div className="mx-0.5 h-5 w-px bg-shell-lineSoft" />

      {/* 视图入口与设置 */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className={`tool-btn ${view === 'briefs' ? 'chrome-btn-active' : ''}`}
          onClick={() => setView('briefs')}
          title="邮件简报"
        >
          <Icon name="document" size={15} />
          <span>{tt('简报')}</span>
        </button>
        <button
          type="button"
          className={`tool-btn ${view === 'todos' ? 'chrome-btn-active' : ''}`}
          onClick={() => setView('todos')}
          title="待办事项"
        >
          <Icon name="checklist" size={15} />
          <span>待办</span>
        </button>
        <button
          type="button"
          className={`tool-btn ${aiPanelOpen ? 'chrome-btn-active' : ''}`}
          onClick={() => setAIPanel(!aiPanelOpen)}
          title="AI 助手 (Ctrl+Shift+A)"
        >
          <Icon name="sparkles" size={15} className={aiBusy ? 'animate-pulse-soft text-brand-500' : 'text-brand-500'} />
          <span>{tt('AI 助手')}</span>
        </button>
        <button type="button" className="tool-btn" onClick={() => openSettings('ai')} title="设置">
          <Icon name="settings" size={15} />
          <span>设置</span>
        </button>
      </div>
    </div>
  );
}
