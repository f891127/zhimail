/** 工具栏：左侧「写邮件」（固定）+ 可选的「收取」，右侧为可配置的邮件操作与视图入口 */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { SkinPicker } from '@/components/SkinPicker';
import { ZH_LABEL_KEYS } from '@/lib/i18n';
import { useT } from '@/lib/useT';
import { DEFAULT_TOOLBAR_ACTIONS, TOOLBAR_ACTIONS } from '@/lib/toolbarActions';

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
    selectedIds,
    toggleFlag,
    syncNow,
    syncAll,
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

  // 工具栏按钮由设置决定：勾选哪些显示、顺序即展示顺序（空配置时用出厂默认）
  const configured = store.settings?.ui?.toolbarActions;
  const enabledIds = configured && configured.length ? configured : DEFAULT_TOOLBAR_ACTIONS;
  const known = new Set(TOOLBAR_ACTIONS.map((action) => action.id));
  const ids = enabledIds.filter((id) => known.has(id));
  const leftIds = ids.filter((id) => id === 'collect');
  const rightIds = ids.filter((id) => id !== 'collect');
  const firstViewIndex = rightIds.findIndex((id) => {
    const def = TOOLBAR_ACTIONS.find((action) => action.id === id);
    return def?.group === '视图与工具';
  });

  /** 每个按钮的实际渲染 */
  const renderAction = (id: string) => {
    const def = TOOLBAR_ACTIONS.find((action) => action.id === id);
    if (!def) return null;
    const disabled = Boolean(def.needSelection) && !selectedMessageId;
    const base = 'tool-btn';
    switch (id) {
      case 'collect':
        return (
          <button
            key={id}
            type="button"
            className={`${base} shrink-0 border border-shell-line`}
            title={realAccount ? '收取全部账户的邮件（F5）' : '演示邮箱无需收取'}
            onClick={() => void syncAll()}
          >
            <Icon name="refresh" size={14} className="text-brand-600" />
            <span>{def.label}</span>
          </button>
        );
      case 'reply':
        return (
          <button key={id} type="button" className={base} disabled={disabled} onClick={() => replyToMessage('reply')} title={def.title}>
            <Icon name={def.icon} size={15} />
            <span>{def.label}</span>
          </button>
        );
      case 'replyAll':
        return (
          <button key={id} type="button" className={base} disabled={disabled} onClick={() => replyToMessage('replyAll')} title={def.title}>
            <Icon name={def.icon} size={15} />
            <span>全部</span>
          </button>
        );
      case 'forward':
        return (
          <button key={id} type="button" className={base} disabled={disabled} onClick={() => replyToMessage('forward')} title={def.title}>
            <Icon name={def.icon} size={15} />
            <span>{def.label}</span>
          </button>
        );
      case 'star':
        return (
          <button
            key={id}
            type="button"
            className={`${base} ${flagged ? 'text-accent-500' : ''}`}
            disabled={disabled}
            onClick={() => selectedMessageId && void toggleFlag([selectedMessageId], '\\Flagged', !flagged)}
            title={def.title}
          >
            <Icon name={flagged ? 'star-filled' : 'star'} size={15} />
            <span>{flagged ? '已星标' : def.label}</span>
          </button>
        );
      case 'delete':
        return (
          <button
            key={id}
            type="button"
            className={base}
            disabled={disabled}
            onClick={() => {
              const targets = selectedIds.length > 1 ? selectedIds : selectedMessageId ? [selectedMessageId] : [];
              if (targets.length) void deleteMessages(targets);
            }}
            title={def.title}
          >
            <Icon name={def.icon} size={15} />
            <span>{def.label}</span>
          </button>
        );
      case 'sync':
        return (
          <button key={id} type="button" className={base} onClick={() => void syncNow()} title={realAccount ? def.title : '演示邮箱无需同步'}>
            <Icon name={def.icon} size={15} />
            <span>{tt('同步')}</span>
          </button>
        );
      case 'brief':
        return (
          <button
            key={id}
            type="button"
            className={`${base} ${view === 'briefs' ? 'chrome-btn-active' : ''}`}
            onClick={() => setView('briefs')}
            title={def.title}
          >
            <Icon name={def.icon} size={15} />
            <span>{tt('简报')}</span>
          </button>
        );
      case 'todos':
        return (
          <button
            key={id}
            type="button"
            className={`${base} ${view === 'todos' ? 'chrome-btn-active' : ''}`}
            onClick={() => setView('todos')}
            title={def.title}
          >
            <Icon name={def.icon} size={15} />
            <span>{def.label}</span>
          </button>
        );
      case 'ai':
        return (
          <button
            key={id}
            type="button"
            className={`${base} ${aiPanelOpen ? 'chrome-btn-active' : ''}`}
            onClick={() => setAIPanel(!aiPanelOpen)}
            title={def.title}
          >
            <Icon name={def.icon} size={15} className={aiBusy ? 'animate-pulse-soft text-brand-500' : 'text-brand-500'} />
            <span>{tt('AI 助手')}</span>
          </button>
        );
      case 'skin':
        return <SkinPicker key={id} />;
      case 'settings':
        return (
          <button key={id} type="button" className={base} onClick={() => openSettings('ai')} title={def.title}>
            <Icon name={def.icon} size={15} />
            <span>{def.label}</span>
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-shell-line bg-white px-2.5">
      {/* 左侧：写邮件固定，收取可按配置出现 */}
      <button type="button" className="primary-btn shrink-0" onClick={() => openCompose()}>
        <Icon name="compose" size={14} />
        写邮件
      </button>
      {leftIds.map((id) => renderAction(id))}

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

      {/* 右侧：按配置顺序渲染，邮件操作与视图入口之间加分隔线 */}
      <div className="ml-1.5 flex shrink-0 items-center gap-0.5">
        {rightIds.map((id, index) => (
          <span key={id} className="flex items-center gap-0.5">
            {index === firstViewIndex && firstViewIndex > 0 && (
              <span className="mx-0.5 h-5 w-px bg-shell-lineSoft" />
            )}
            {renderAction(id)}
          </span>
        ))}
      </div>
    </div>
  );
}
