/** 左侧文件夹树：账户 / 内置文件夹 / 自定义文件夹 / 邮件简报 / 待办入口 */

import { useAppStore } from '@/store/useAppStore';
import { Icon, type IconName } from '@/components/Icon';
import type { Folder } from '@/types/zhimail';

const KIND_ICON: Record<string, IconName> = {
  inbox: 'inbox',
  sent: 'send',
  draft: 'draft',
  trash: 'trash',
  junk: 'junk',
  archive: 'archive',
  custom: 'folder',
  brief: 'document',
};

const KIND_COLOR: Record<string, string> = {
  inbox: 'text-brand-500',
  sent: 'text-emerald-600',
  draft: 'text-amber-600',
  trash: 'text-shell-faint',
  junk: 'text-rose-500',
  archive: 'text-violet-500',
  custom: 'text-amber-500',
  brief: 'text-brand-600',
};

function FolderRow({
  folder,
  active,
  indent = 0,
  onClick,
}: {
  folder: Folder;
  active: boolean;
  indent?: number;
  onClick: () => void;
}) {
  const icon = KIND_ICON[folder.kind] ?? 'folder';
  const color = KIND_COLOR[folder.kind] ?? 'text-shell-sub';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex h-[27px] w-full items-center gap-1.5 rounded-[3px] pr-2 text-left text-xs transition-colors duration-120 ${
        active ? 'bg-brand-500 text-white' : 'text-shell-text hover:bg-black/[0.045]'
      }`}
      style={{ paddingLeft: 8 + indent * 14 }}
    >
      <Icon
        name={icon}
        size={14}
        className={active ? 'text-white' : color}
        strokeWidth={active ? 1.9 : 1.6}
      />
      <span className={`flex-1 truncate ${active ? 'font-medium' : ''}`}>{folder.name}</span>
      {folder.unread > 0 && (
        <span
          className={`badge ${
            active ? 'bg-white/25 text-white' : 'bg-brand-500 text-white'
          }`}
        >
          {folder.unread > 99 ? '99+' : folder.unread}
        </span>
      )}
      {folder.unread === 0 && folder.total > 0 && (
        <span className={`text-[10px] tabular-nums ${active ? 'text-white/70' : 'text-shell-faint'}`}>
          {folder.total}
        </span>
      )}
    </button>
  );
}

export function FolderTree() {
  const store = useAppStore();
  const {
    accounts,
    folders,
    selectedFolderId,
    view,
    expandedAccounts,
    toggleAccount,
    selectFolder,
    syncNow,
    todoStats,
    setView,
    openSettings,
    info,
  } = store;

  const briefRoot = folders.find((folder) => folder.id === 'briefs');
  const briefGroups = folders.filter((folder) => folder.parentId === 'briefs');

  return (
    <div className="flex h-full w-full flex-col bg-shell-bg">
      <div className="scroll-area flex-1 py-1.5">
        {accounts.map((account) => {
          const accountFolders = folders
            .filter((folder) => folder.accountId === account.id)
            .sort((a, b) => a.order - b.order);
          const expanded = expandedAccounts[account.id] ?? true;
          const totalUnread = accountFolders.reduce((sum, folder) => sum + folder.unread, 0);
          return (
            <div key={account.id} className="mb-1">
              <div className="group flex h-[28px] items-center gap-1.5 px-1.5">
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center text-shell-faint hover:text-shell-text"
                  onClick={() => toggleAccount(account.id)}
                >
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
                </button>
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-gradient-to-br from-brand-400 to-brand-600 text-[9px] font-bold text-white">
                  {account.displayName.slice(0, 1) || '邮'}
                </span>
                <span className="flex-1 truncate text-xs font-medium text-shell-text" title={account.email}>
                  {account.name}
                </span>
                {totalUnread > 0 && <span className="badge bg-accent-500 text-white">{totalUnread}</span>}
                <button
                  type="button"
                  className="hidden text-shell-faint hover:text-brand-600 group-hover:block"
                  title={account.demo ? '演示邮箱（无需同步）' : '同步此账户'}
                  onClick={() => void syncNow(account.id)}
                >
                  <Icon name="refresh" size={12} />
                </button>
              </div>

              {expanded &&
                accountFolders.map((folder) => (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    active={selectedFolderId === folder.id && view === 'mail'}
                    indent={1}
                    onClick={() => void selectFolder(folder.id)}
                  />
                ))}
            </div>
          );
        })}

        {/* 邮件简报：独立分组，不可删除 */}
        {briefRoot && (
          <div className="mt-2 border-t border-shell-lineSoft pt-2">
            <button
              type="button"
              onClick={() => void selectFolder('briefs')}
              className={`flex h-[27px] w-full items-center gap-1.5 px-2 text-left text-xs transition-colors duration-120 ${
                view === 'briefs' && selectedFolderId === 'briefs'
                  ? 'bg-brand-500 text-white'
                  : 'text-shell-text hover:bg-black/[0.045]'
              }`}
            >
              <Icon name="document" size={14} className="text-brand-600" />
              <span className="flex-1 font-medium">邮件简报</span>
              <span
                className={`text-[10px] tabular-nums ${
                  view === 'briefs' && selectedFolderId === 'briefs' ? 'text-white/70' : 'text-shell-faint'
                }`}
              >
                {briefRoot.total}
              </span>
            </button>
            {briefGroups.map((group) => (
              <FolderRow
                key={group.id}
                folder={group}
                active={selectedFolderId === group.id && view === 'briefs'}
                indent={1}
                onClick={() => void selectFolder(group.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-2 border-t border-shell-lineSoft pt-2">
          <button
            type="button"
            onClick={() => setView('todos')}
            className={`flex h-[27px] w-full items-center gap-1.5 px-2 text-left text-xs transition-colors duration-120 ${
              view === 'todos' ? 'bg-brand-500 text-white' : 'text-shell-text hover:bg-black/[0.045]'
            }`}
          >
            <Icon name="checklist" size={14} className={view === 'todos' ? 'text-white' : 'text-emerald-600'} />
            <span className="flex-1 font-medium">待办事项</span>
            {todoStats.pending > 0 && (
              <span className={`badge ${view === 'todos' ? 'bg-white/25 text-white' : 'bg-accent-500 text-white'}`}>
                {todoStats.pending}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="shrink-0 border-t border-shell-line px-2 py-2">
        <button
          type="button"
          onClick={() => openSettings('account')}
          className="flex h-[26px] w-full items-center gap-1.5 rounded px-1.5 text-xs text-shell-sub transition-colors duration-120 hover:bg-black/[0.045] hover:text-shell-text"
        >
          <Icon name="settings" size={13} />
          <span className="flex-1 text-left">设置</span>
          <span className="text-[10px] text-shell-faint">v{info?.version ?? '1.0.0'}</span>
        </button>
      </div>
    </div>
  );
}
