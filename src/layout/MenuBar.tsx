/** 顶部菜单栏：文件 / 编辑 / 查看 / 工具 / 帮助，行为与桌面客户端一致 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { ZH_LABEL_KEYS } from '@/lib/i18n';
import { useT } from '@/lib/useT';

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const store = useAppStore();
  const t = useT();
  /** 按中文原文取当前语言的菜单文案，未收录的原文原样显示 */
  const tt = (label: string) => (ZH_LABEL_KEYS[label] ? t(ZH_LABEL_KEYS[label]) : label);
  const {
    selectedMessageId,
    messages,
    threadMode,
    settings,
    openCompose,
    syncNow,
    deleteMessages,
    toggleFlag,
    setThreadMode,
    loadMessages,
    setView,
    setAIPanel,
    openSettings,
    replyToMessage,
  } = store;

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const menus: Record<string, MenuItem[]> = {
    文件: [
      { label: tt('新建邮件'), shortcut: 'Ctrl+N', onClick: () => openCompose() },
      { divider: true, label: tt('') },
      { label: tt('立即同步'), shortcut: 'F5', onClick: () => void syncNow() },
      { label: tt('重置演示数据'), onClick: () => void store.resetDemo() },
      { divider: true, label: tt('') },
      { label: tt('退出'), shortcut: 'Alt+F4', onClick: () => window.close() },
    ],
    编辑: [
      {
        label: tt('标记为已读'),
        onClick: () => {
          if (selectedMessageId) void toggleFlag([selectedMessageId], '\\Seen', true);
        },
        disabled: !selectedMessageId,
      },
      {
        label: tt('标记为未读'),
        onClick: () => {
          if (selectedMessageId) void toggleFlag([selectedMessageId], '\\Seen', false);
        },
        disabled: !selectedMessageId,
      },
      {
        label: tt('添加星标'),
        onClick: () => {
          if (selectedMessageId) void toggleFlag([selectedMessageId], '\\Flagged', true);
        },
        disabled: !selectedMessageId,
      },
      { divider: true, label: tt('') },
      {
        label: tt('删除邮件'),
        shortcut: 'Delete',
        onClick: () => {
          if (selectedMessageId) void deleteMessages([selectedMessageId]);
        },
        disabled: !selectedMessageId,
      },
      { divider: true, label: tt('') },
      {
        label: tt('全选当前列表'),
        onClick: () => {
          if (messages[0]) void store.selectMessage(messages[0].id);
        },
        disabled: !messages.length,
      },
    ],
    查看: [
      { label: tt('刷新列表'), shortcut: 'F5', onClick: () => void loadMessages() },
      {
        label: threadMode ? '切换为单封显示' : '按会话聚合显示',
        onClick: () => void setThreadMode(!threadMode),
      },
      {
        label: settings?.ui.readingPane === false ? '显示阅读窗格' : '隐藏阅读窗格',
        onClick: () => void store.updateSettings({ ui: { ...settings?.ui, readingPane: !settings?.ui.readingPane } }),
      },
      { divider: true, label: tt('') },
      { label: tt('邮件简报中心'), onClick: () => setView('briefs') },
      { label: tt('待办事项'), onClick: () => setView('todos') },
    ],
    工具: [
      { label: tt('AI 汇总分析'), shortcut: 'Ctrl+Shift+A', onClick: () => setAIPanel(true, 'analysis') },
      {
        label: tt('生成当前邮件摘要'),
        onClick: () => void store.runSummarize(),
        disabled: !selectedMessageId,
      },
      {
        label: tt('生成会话串摘要'),
        onClick: () => void store.runThreadSummary(),
        disabled: !selectedMessageId,
      },
      {
        label: tt('AI 回复建议'),
        onClick: () => void store.runReplies(),
        disabled: !selectedMessageId,
      },
      { divider: true, label: tt('') },
      {
        label: tt('翻译邮件为中文'),
        onClick: () => selectedMessageId && void store.runTranslate(selectedMessageId, '中文'),
        disabled: !selectedMessageId,
      },
      {
        label: tt('翻译邮件为英文'),
        onClick: () => selectedMessageId && void store.runTranslate(selectedMessageId, 'English'),
        disabled: !selectedMessageId,
      },
      { divider: true, label: tt('') },
      { label: tt('回复'), shortcut: 'Ctrl+R', onClick: () => replyToMessage('reply'), disabled: !selectedMessageId },
      { divider: true, label: tt('') },
      { label: tt('设置…'), onClick: () => openSettings('account') },
    ],
    帮助: [
      { label: tt('检查更新…'), onClick: () => void store.checkUpdate() },
      { label: tt('版本更新日志'), onClick: () => store.openChangelog() },
      { divider: true, label: tt('') },
      { label: tt('使用说明'), onClick: () => openSettings('about') },
      { label: tt('关于知邮 ZhiMail'), onClick: () => openSettings('about') },
    ],
  };

  return (
    <div
      ref={containerRef}
      className="relative z-30 flex h-8 shrink-0 items-center gap-1 border-b border-shell-line bg-shell-chrome px-2 text-xs text-shell-sub"
    >
      <div className="mr-1 h-4 w-[1px] bg-shell-line" />

      {Object.entries(menus).map(([title, items]) => (
        <div key={title} className="relative">
          <button
            type="button"
            className={`rounded px-2 py-[3px] transition-colors duration-120 hover:bg-black/[0.07] ${
              openMenu === title ? 'bg-black/[0.09] text-shell-text' : ''
            }`}
            onClick={() => setOpenMenu(openMenu === title ? null : title)}
            onMouseEnter={() => openMenu && setOpenMenu(title)}
          >
            {tt(title)}
          </button>
          {openMenu === title && (
            <div className="absolute left-0 top-[calc(100%+3px)] z-40 min-w-[196px] animate-fade-in rounded-md border border-shell-line bg-white py-1 shadow-card">
              {items.map((item, index) =>
                item.divider ? (
                  <div key={`divider-${index}`} className="my-1 h-px bg-shell-lineSoft" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    className="flex w-full items-center justify-between gap-6 px-3 py-[6px] text-left text-xs text-shell-text transition-colors duration-120 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => {
                      setOpenMenu(null);
                      item.onClick?.();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="text-[10px] text-shell-faint">{item.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
