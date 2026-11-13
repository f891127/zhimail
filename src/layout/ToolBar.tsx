/** 工具栏：写信、常用操作、搜索与 AI 入口 */

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
      <button type="button" className="primary-btn" onClick={() => openCompose()}>
        <Icon name="compose" size={14} />
        写邮件
      </button>

      <div className="mx-1 h-5 w-px bg-shell-lineSoft" />

      <button
        type="button"
        className="tool-btn"
        disabled={!selectedMessageId}
        onClick={() => replyToMessage('reply')}
        title="回复 (Ctrl+R)"
      >
        <Icon name="reply" size={15} />
        回复
      </button>
      <button
        type="button"
        className="tool-btn"
        disabled={!selectedMessageId}
        onClick={() => replyToMessage('replyAll')}
        title="回复全部"
      >
        <Icon name="reply-all" size={15} />
      </button>
      <button
        type="button"
        className="tool-btn"
        disabled={!selectedMessageId}
        onClick={() => replyToMessage('forward')}
        title="转发"
      >
        <Icon name="forward" size={15} />
      </button>

      <div className="mx-1 h-5 w-px bg-shell-lineSoft" />

      <button
        type="button"
        className={`tool-btn ${flagged ? 'text-accent-500' : ''}`}
        disabled={!selectedMessageId}
        onClick={() => selectedMessageId && void toggleFlag([selectedMessageId], '\\Flagged', !flagged)}
        title="加星标"
      >
        <Icon name={flagged ? 'star-filled' : 'star'} size={15} />
      </button>
      <button
        type="button"
        className="tool-btn"
        disabled={!selectedMessageId}
        onClick={() => selectedMessageId && void deleteMessages([selectedMessageId])}
        title="删除 (Delete)"
      >
        <Icon name="trash" size={15} />
      </button>
      <button
        type="button"
        className="tool-btn"
        onClick={() => void syncNow()}
        title={realAccount ? '同步邮箱' : '演示邮箱无需同步'}
      >
        <Icon name="refresh" size={15} />
        同步
      </button>

      <div className="ml-2 flex h-[30px] flex-1 items-center gap-1 rounded border border-shell-line bg-shell-bg px-2 focus-within:border-brand-400 focus-within:bg-white">
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
          className="flex items-center gap-1 rounded px-1.5 py-[2px] text-[11px] text-brand-600 transition-colors duration-120 hover:bg-brand-50"
          onClick={() => void search(keyword, true)}
          title="AI 解析自然语言检索条件（Shift+Enter）"
        >
          <Icon name="sparkles" size={12} />
          AI 搜索
        </button>
      </div>

      <div className="ml-1.5 flex items-center gap-1">
        <button
          type="button"
          className={`tool-btn ${view === 'briefs' ? 'chrome-btn-active' : ''}`}
          onClick={() => setView('briefs')}
          title="邮件简报"
        >
          <Icon name="document" size={15} />
          简报
        </button>
        <button
          type="button"
          className={`tool-btn ${view === 'todos' ? 'chrome-btn-active' : ''}`}
          onClick={() => setView('todos')}
          title="待办事项"
        >
          <Icon name="checklist" size={15} />
        </button>
        <button
          type="button"
          className={`tool-btn ${aiPanelOpen ? 'chrome-btn-active' : ''}`}
          onClick={() => setAIPanel(!aiPanelOpen)}
          title="AI 助手 (Ctrl+Shift+A)"
        >
          <Icon name="sparkles" size={15} className={aiBusy ? 'animate-pulse-soft text-brand-500' : 'text-brand-500'} />
          AI 助手
        </button>
        <button type="button" className="tool-btn" onClick={() => openSettings('ai')} title="设置">
          <Icon name="settings" size={15} />
        </button>
      </div>
    </div>
  );
}
