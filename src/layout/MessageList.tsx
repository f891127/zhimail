/** 中部邮件列表：支持单封与会话聚合两种视图，含筛选与排序 */

import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { ZH_LABEL_KEYS } from '@/lib/i18n';
import { useT } from '@/lib/useT';
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu';
import { listTime, senderName, addressLabel } from '@/lib/format';
import type { MessageMeta } from '@/types/zhimail';
import { useState } from 'react';

function UnreadDot({ unread }: { unread: boolean }) {
  return (
    <span
      className={`inline-block h-[6px] w-[6px] shrink-0 rounded-full ${
        unread ? 'bg-brand-500' : 'bg-transparent'
      }`}
    />
  );
}

function StarCell({ flagged, onToggle }: { flagged: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`flex h-4 w-4 items-center justify-center transition-colors duration-120 ${
        flagged ? 'text-accent-500' : 'text-shell-line hover:text-accent-400'
      }`}
    >
      <Icon name={flagged ? 'star-filled' : 'star'} size={13} strokeWidth={1.5} />
    </button>
  );
}

function MessageRow({
  message,
  active,
  multi,
  onContext,
}: {
  message: MessageMeta;
  active: boolean;
  multi: boolean;
  onContext: (event: React.MouseEvent, message: MessageMeta) => void;
}) {
  const store = useAppStore();
  const unread = !message.flags.includes('\\Seen');
  const flagged = message.flags.includes('\\Flagged');
  const density = store.settings?.ui.listDensity ?? 'compact';
  const showSnippet = store.settings?.ui.showSnippet ?? true;

  return (
    <div
      onClick={(event) =>
        void store.selectMessage(message.id, {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        })
      }
      onContextMenu={(event) => onContext(event, message)}
      className={`group flex cursor-default items-start gap-2 border-b border-l-[3px] border-shell-lineSoft px-2.5 ${
        density === 'compact' ? 'py-[7px]' : 'py-[11px]'
      } transition-colors duration-120 ${
        multi
          ? 'border-l-brand-600 bg-brand-100'
          : active
            ? 'border-l-brand-500 bg-brand-100'
            : unread
              ? 'border-l-transparent bg-white hover:bg-brand-50'
              : 'border-l-transparent bg-[#fcfcfd] hover:bg-brand-50'
      }`}
    >
      <div className="flex w-[13px] shrink-0 justify-center pt-[5px]">
        <UnreadDot unread={unread} />
      </div>
      <div className="w-[16px] shrink-0 pt-[3px]">
        <StarCell
          flagged={flagged}
          onToggle={() => void store.toggleFlag([message.id], '\\Flagged', !flagged)}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`min-w-0 max-w-[46%] truncate text-xs ${
              unread ? 'font-semibold text-shell-text' : 'text-shell-sub'
            }`}
            title={addressLabel(message.from)}
          >
            {senderName(message.from)}
          </span>
          {message.hasAttachments && <Icon name="paperclip" size={11} className="text-shell-faint" />}
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-shell-faint">
            {listTime(message.date)}
          </span>
        </div>
        <div className="mt-[2px] flex items-baseline gap-1.5">
          <span
            className={`min-w-0 flex-1 truncate text-xs ${
              multi || active ? 'font-semibold text-brand-900' : unread ? 'font-medium text-shell-text' : 'text-shell-sub'
            }`}
            title={message.subject}
          >
            {message.subject || '(无主题)'}
          </span>
          {message.labels?.slice(0, 1).map((label) => (
            <span key={label} className="shrink-0 rounded bg-brand-50 px-1 text-[10px] text-brand-600">
              {label}
            </span>
          ))}
        </div>
        {showSnippet && density !== 'compact' && (
          <div className="mt-[3px] line-clamp-2 text-[11px] leading-[16px] text-shell-faint">
            {message.snippet || '（正文尚未下载，打开后自动获取）'}
          </div>
        )}
        {showSnippet && density === 'compact' && (
          <div className="mt-[1px] truncate text-[11px] leading-[16px] text-shell-faint">
            {message.snippet || '（正文尚未下载，打开后自动获取）'}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  onContext,
}: {
  thread: ReturnType<typeof useAppStore.getState>['threads'][number];
  onContext: (event: React.MouseEvent, message: MessageMeta) => void;
}) {
  const store = useAppStore();
  const expanded = store.expandedThreadIds.includes(thread.threadId);
  const active = thread.messages.some((message) => message.id === store.selectedMessageId);
  const latest = thread.messages[thread.messages.length - 1];

  return (
    <div>
      <div
        onClick={(event) =>
          void store.selectMessage(latest.id, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
          })
        }
        onContextMenu={(event) => onContext(event, latest)}
        className={`group flex cursor-default items-start gap-2 border-b border-l-[3px] border-shell-lineSoft px-2.5 py-[8px] transition-colors duration-120 ${
          store.selectedIds.includes(latest.id)
            ? 'border-l-brand-600 bg-brand-100'
            : active
              ? 'border-l-brand-500 bg-brand-100'
              : thread.unread > 0
                ? 'border-l-transparent bg-white hover:bg-brand-50'
                : 'border-l-transparent bg-[#fcfcfd] hover:bg-brand-50'
        }`}
      >
        <button
          type="button"
          className="mt-[3px] flex h-4 w-4 items-center justify-center text-shell-faint hover:text-shell-text"
          onClick={(event) => {
            event.stopPropagation();
            store.toggleThreadExpanded(thread.threadId);
          }}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`min-w-0 max-w-[52%] truncate text-xs ${
                thread.unread > 0 ? 'font-semibold text-shell-text' : 'text-shell-sub'
              }`}
            >
              {thread.participants.map((item) => item.name || item.address).join('、')}
            </span>
            {thread.hasAttachments && <Icon name="paperclip" size={11} className="text-shell-faint" />}
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-shell-faint">
              {listTime(thread.latestDate)}
            </span>
          </div>
          <div className="mt-[2px] flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-shell-text">{thread.subject}</span>
            <span className="shrink-0 rounded bg-shell-chrome px-1 text-[10px] tabular-nums text-shell-sub">
              {thread.count}
            </span>
          </div>
        </div>
      </div>
      {expanded &&
        thread.messages.map((message) => (
          <div key={message.id} className="pl-5">
            <MessageRow
              message={message}
              active={message.id === store.selectedMessageId}
              multi={store.selectedIds.includes(message.id) && store.selectedIds.length > 1}
              onContext={onContext}
            />
          </div>
        ))}
    </div>
  );
}

export function MessageList() {
  const store = useAppStore();
  const listMode = store.settings?.mail?.listMode ?? 'conversation';
  // 搜索结果按普通列表平铺展示；清空搜索后恢复按设置的会话 / 相关邮件模式
  const threadMode = listMode === 'conversation' && !store.searchActive;
  const {
    messages: rawMessages,
    threads,
    loadingMessages,
    filters,
    messageTotal,
    searchActive,
    searchExplain,
    selectedFolderId,
    selectedMessage,
  } =
    store;

  // 相关邮件模式：只看与当前选中邮件同话题或同发件人的邮件
  const messages =
    listMode === 'related' && selectedMessage
      ? rawMessages.filter(
          (message) =>
            (message.threadId && message.threadId === selectedMessage.threadId) ||
            (message.from[0]?.address && message.from[0]?.address === selectedMessage.from[0]?.address),
        )
      : rawMessages;

  const folder = store.folders.find((item) => item.id === selectedFolderId);
  const [menu, setMenu] = useState<{ x: number; y: number; message: MessageMeta } | null>(null);

  const openContextMenu = (event: React.MouseEvent, message: MessageMeta) => {
    event.preventDefault();
    if (store.selectedMessageId !== message.id) void store.selectMessage(message.id);
    setMenu({ x: event.clientX, y: event.clientY, message });
  };

  const moveTargets = store.folders
    .filter((item) => !['drafts', 'sent', 'outbox'].includes(item.kind) && item.id !== menu?.message.folderId)
    .slice(0, 12)
    .map<ContextMenuItem>((item) => ({
      label: item.name,
      onClick: () => void store.moveMessages([menu!.message.id], item.id),
    }));

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          label: 'AI 摘要这封邮件',
          onClick: () => void store.runSummarize(menu.message.id),
        },
        {
          label: '提取待办事项',
          onClick: () => void store.extractTodosFromMessage(menu.message.id),
        },
        { divider: true },
        {
          label: menu.message.flags.includes('\\Seen') ? '标记为未读' : '标记为已读',
          onClick: () =>
            void store.toggleFlag(
              [menu.message.id],
              '\\Seen',
              !menu.message.flags.includes('\\Seen'),
            ),
        },
        {
          label: menu.message.flags.includes('\\Flagged') ? '取消星标' : '加星标',
          onClick: () =>
            void store.toggleFlag(
              [menu.message.id],
              '\\Flagged',
              !menu.message.flags.includes('\\Flagged'),
            ),
        },
        { divider: true },
        { label: '回复', shortcut: 'Ctrl+R', onClick: () => store.replyToMessage('reply') },
        { label: '回复全部', onClick: () => store.replyToMessage('replyAll') },
        { label: '转发', onClick: () => store.replyToMessage('forward') },
        { divider: true },
        { label: '移动到…', submenu: moveTargets.length ? moveTargets : [{ label: '无可用目标', disabled: true }] },
        { label: '删除', danger: true, shortcut: 'Delete', onClick: () => void store.deleteMessages([menu.message.id]) },
      ]
    : [];

  const multiCount = store.selectedIds.length;
  return (
    <div className="flex h-full min-w-0 flex-col bg-white">
      {multiCount > 1 && (
        <div className="flex h-[30px] shrink-0 items-center gap-2 border-b border-brand-200 bg-brand-50 px-2 text-[11px] text-brand-800">
          <span className="shrink-0 font-medium">已选 {multiCount} 封</span>
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-[2px] hover:bg-brand-100"
            onClick={() => void store.deleteMessages(store.selectedIds)}
          >
            删除
          </button>
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-[2px] hover:bg-brand-100"
            onClick={() => void store.toggleFlag(store.selectedIds, '\\Seen', true)}
          >
            标记已读
          </button>
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-[2px] hover:bg-brand-100"
            onClick={() => void store.toggleFlag(store.selectedIds, '\\Flagged', true)}
          >
            加星标
          </button>
          <button
            type="button"
            className="ml-auto shrink-0 rounded px-1.5 py-[2px] hover:bg-brand-100"
            onClick={() => store.clearSelection()}
          >
            取消选择
          </button>
        </div>
      )}
      <div className="flex h-[30px] shrink-0 items-center gap-1 border-b border-shell-line bg-[#fafbfc] px-2 text-[11px] text-shell-sub">
        <span className="max-w-[72px] shrink-0 truncate font-medium text-shell-text">{folder?.name ?? '邮件列表'}</span>
        <span className="shrink-0 whitespace-nowrap tabular-nums text-shell-faint">{messageTotal}</span>

        <div className="mx-0.5 h-3.5 w-px shrink-0 bg-shell-lineSoft" />

        <button
          type="button"
          onClick={() => store.setFilters({ unreadOnly: !filters.unreadOnly })}
          className={`shrink-0 whitespace-nowrap rounded px-1.5 py-[2px] transition-colors duration-120 ${
            filters.unreadOnly ? 'bg-brand-100 text-brand-700' : 'hover:bg-black/[0.05]'
          }`}
        >
          未读
        </button>
        <button
          type="button"
          onClick={() => store.setFilters({ flaggedOnly: !filters.flaggedOnly })}
          className={`shrink-0 whitespace-nowrap rounded px-1.5 py-[2px] transition-colors duration-120 ${
            filters.flaggedOnly ? 'bg-brand-100 text-brand-700' : 'hover:bg-black/[0.05]'
          }`}
        >
          星标
        </button>
        <button
          type="button"
          onClick={() => store.setFilters({ hasAttachment: !filters.hasAttachment })}
          className={`shrink-0 whitespace-nowrap rounded px-1.5 py-[2px] transition-colors duration-120 ${
            filters.hasAttachment ? 'bg-brand-100 text-brand-700' : 'hover:bg-black/[0.05]'
          }`}
        >
          附件
        </button>

        <button
          type="button"
          onClick={() => store.setFilters({ sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' })}
          className="ml-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-[2px] hover:bg-black/[0.05]"
          title="切换时间排序"
        >
          <Icon name="sort" size={11} />
          {filters.sortDir === 'desc' ? '最新' : '最早'}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <select
            value={listMode}
            onChange={(event) =>
              void store.applySystemSettings({
                mail: { ...store.settings?.mail, listMode: event.target.value as 'normal' | 'conversation' | 'related' },
              })
            }
            title="邮件列表显示模式"
            className="shrink-0 rounded border border-shell-lineSoft bg-white px-1 py-[1px] text-[11px] text-shell-sub hover:bg-black/[0.03]"
          >
            <option value="normal">普通模式</option>
            <option value="conversation">会话模式</option>
            <option value="related">相关邮件模式</option>
          </select>
          <button
            type="button"
            onClick={() => void store.loadMessages()}
            className="rounded p-1 hover:bg-black/[0.05]"
            title="刷新"
          >
            <Icon name="refresh" size={11} />
          </button>
        </div>
      </div>

      {searchActive && searchExplain && (
        <div className="flex items-center gap-1.5 border-b border-brand-100 bg-brand-50/60 px-2.5 py-1 text-[11px] text-brand-700">
          <Icon name="sparkles" size={11} />
          <span className="min-w-0 flex-1 truncate">{searchExplain}</span>
          <button type="button" onClick={() => void store.clearSearch()} className="text-brand-600 hover:underline">
            清除
          </button>
        </div>
      )}

      <div className="scroll-area flex-1">
        {loadingMessages && (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-shell-faint">
            <Icon name="refresh" size={12} className="animate-spin" />
            正在加载…
          </div>
        )}
        {!loadingMessages && messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-shell-faint">
            <Icon name="inbox" size={30} className="text-shell-line" strokeWidth={1.2} />
            <p className="text-xs">
              {listMode === 'related' && selectedMessage
                ? '当前邮件没有其它相关邮件（同话题或同发件人）'
                : '当前文件夹没有符合条件的邮件'}
            </p>
            <p className="text-[11px]">
              {store.accounts.some((account) => account.demo)
                ? '演示邮箱已内置示例邮件；也可在「设置 → 账户」中添加真实邮箱并同步'
                : '可在工具栏点击「同步」从服务器获取邮件'}
            </p>
          </div>
        )}
        {!loadingMessages &&
          (threadMode
            ? threads.map((thread) => (
                <ThreadRow key={thread.threadId} thread={thread} onContext={openContextMenu} />
              ))
            : messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  active={message.id === store.selectedMessageId}
                  multi={store.selectedIds.includes(message.id) && store.selectedIds.length > 1}
                  onContext={openContextMenu}
                />
              )))}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}
