/** 左侧文件夹树：账户 / 内置文件夹 / 自定义文件夹 / 邮件简报 / 待办入口 */

import { useState } from 'react';
import { ZH_LABEL_KEYS, folderDisplayName } from '@/lib/i18n';
import { useT } from '@/lib/useT';
import { useAppStore } from '@/store/useAppStore';
import { Icon, type IconName } from '@/components/Icon';
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu';
import { api } from '@/lib/api';
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

/** 常用文件夹（虚拟视图）的图标与配色 */
const COMMON_STYLE: Record<string, { icon: IconName; color: string }> = {
  'common/unread': { icon: 'mail', color: 'text-brand-500' },
  'common/flagged': { icon: 'star-filled', color: 'text-amber-500' },
  'common/labels': { icon: 'tag', color: 'text-violet-500' },
  'common/important': { icon: 'alert', color: 'text-rose-500' },
  'common/todo': { icon: 'checklist', color: 'text-emerald-600' },
};

function FolderRow({
  folder,
  active,
  indent = 0,
  onClick,
  onContext,
  expandable,
  expanded,
  onToggle,
}: {
  folder: Folder;
  active: boolean;
  indent?: number;
  onClick: () => void;
  onContext?: (event: React.MouseEvent, folder: Folder) => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const t = useT();
  const locale = useAppStore((state) => state.locale);
  const tt = (label: string) => (ZH_LABEL_KEYS[label] ? t(ZH_LABEL_KEYS[label]) : label);
  const icon = COMMON_STYLE[folder.id]?.icon ?? KIND_ICON[folder.kind] ?? 'folder';
  const color = COMMON_STYLE[folder.id]?.color ?? KIND_COLOR[folder.kind] ?? 'text-shell-sub';
  // 内置文件夹与常用文件夹的显示名随界面语言切换，自定义文件夹保留用户命名
  const displayName =
    COMMON_STYLE[folder.id] || folder.kind === 'brief'
      ? tt(folder.name)
      : folder.kind === 'custom' || folder.kind === 'virtual'
        ? folder.name
        : folderDisplayName(locale, folder.kind, folder.name);
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(event) => onContext?.(event, folder)}
      className={`group flex h-[27px] w-full items-center gap-1.5 rounded-[3px] pr-2 text-left text-xs transition-colors duration-120 ${
        active ? 'bg-brand-500 text-white' : 'text-shell-text hover:bg-black/[0.045]'
      }`}
      style={{ paddingLeft: 8 + indent * 14 }}
    >
      {expandable && (
        <span
          role="presentation"
          className={`flex h-3.5 w-3.5 items-center justify-center ${active ? 'text-white' : 'text-shell-faint'}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={10} />
        </span>
      )}
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
  const t = useT();
  /** 按中文原文取当前语言文案，未收录的原样显示 */
  const tt = (label: string) => (ZH_LABEL_KEYS[label] ? t(ZH_LABEL_KEYS[label]) : label);
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
    removeAccount,
    pushToast,
    info,
  } = store;

  const [commonExpanded, setCommonExpanded] = useState(true);
  const [labelsExpanded, setLabelsExpanded] = useState(true);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  /** 账户行右键菜单 */
  const [accountMenu, setAccountMenu] = useState<{ x: number; y: number; accountId: string; name: string; demo: boolean } | null>(null);
  /** 删除账户确认 */
  const [removing, setRemoving] = useState<{ accountId: string; name: string } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!creatingIn || !name) {
      setCreatingIn(null);
      setNewName('');
      return;
    }
    try {
      await api.folders.create({ accountId: creatingIn, name });
      await store.reloadFolders();
      store.pushToast({ type: 'success', title: `已创建文件夹「${name}」` });
    } catch (error) {
      store.pushToast({ type: 'error', title: '创建失败', message: (error as Error).message });
    } finally {
      setCreatingIn(null);
      setNewName('');
    }
  };

  const removeFolder = async (folder: Folder) => {
    if (!window.confirm(`删除文件夹「${folder.name}」？文件夹内的邮件会一并删除，此操作不可撤销。`)) return;
    try {
      await api.folders.remove(folder.id);
      await store.reloadFolders();
      store.pushToast({ type: 'success', title: `已删除文件夹「${folder.name}」` });
    } catch (error) {
      store.pushToast({ type: 'error', title: '删除失败', message: (error as Error).message });
    }
  };

  const folderMenuItems = (folder: Folder): ContextMenuItem[] => [
    { label: '在此新建子文件夹…', onClick: () => { setCreatingIn(folder.accountId); setNewName(''); } },
    { label: '删除文件夹', disabled: folder.kind !== 'custom', onClick: () => void removeFolder(folder) },
  ];

  const commonRoot = folders.find((folder) => folder.id === 'common');
  const commonChildren = folders.filter((folder) => folder.parentId === 'common');
  const labelChildren = folders.filter((folder) => folder.parentId === 'common/labels');
  const briefRoot = folders.find((folder) => folder.id === 'briefs');
  const briefGroups = folders.filter((folder) => folder.parentId === 'briefs');

  return (
    <div className="flex h-full w-full flex-col bg-shell-bg">
      <div className="scroll-area flex-1 py-1.5">
        {commonRoot && (
          <div className="mb-1 border-b border-shell-lineSoft pb-1">
            <button
              type="button"
              onClick={() => setCommonExpanded((value) => !value)}
              className="group flex h-[28px] w-full items-center gap-1.5 rounded-[3px] px-1.5 text-left hover:bg-black/[0.03]"
            >
              <span className="flex h-4 w-4 items-center justify-center text-shell-faint">
                <Icon name={commonExpanded ? 'chevron-down' : 'chevron-right'} size={12} />
              </span>
              <Icon name="folder-open" size={14} className="text-amber-500" />
              <span className="flex-1 truncate text-xs font-medium text-shell-text">{tt('常用文件夹')}</span>
            </button>

            {commonExpanded &&
              commonChildren.map((folder) =>
                folder.id === 'common/labels' ? (
                  <div key={folder.id}>
                    <FolderRow
                      folder={folder}
                      active={selectedFolderId === folder.id && view === 'mail'}
                      indent={1}
                      expandable
                      expanded={labelsExpanded}
                      onToggle={() => setLabelsExpanded((value) => !value)}
                      onClick={() => void selectFolder(folder.id)}
                    />
                    {labelsExpanded &&
                      labelChildren.map((child) => (
                        <FolderRow
                          key={child.id}
                          folder={child}
                          active={selectedFolderId === child.id && view === 'mail'}
                          indent={2}
                          onClick={() => void selectFolder(child.id)}
                        />
                      ))}
                  </div>
                ) : (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    active={selectedFolderId === folder.id && view === 'mail'}
                    indent={1}
                    onClick={() => void selectFolder(folder.id)}
                  />
                ),
              )}
          </div>
        )}

        {accounts.map((account) => {
          const accountFolders = folders
            .filter((folder) => folder.accountId === account.id && folder.kind !== 'virtual')
            .sort((a, b) => a.order - b.order);
          const expanded = expandedAccounts[account.id] ?? true;
          const totalUnread = accountFolders.reduce((sum, folder) => sum + folder.unread, 0);
          return (
            <div key={account.id} className="mb-1">
              <div
                className="group flex h-[28px] items-center gap-1.5 px-1.5"
                onContextMenu={(event) => {
                  event.preventDefault();
                  setAccountMenu({
                    x: event.clientX,
                    y: event.clientY,
                    accountId: account.id,
                    name: account.name,
                    demo: Boolean(account.demo),
                  });
                }}
              >
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
                  title="在此账户下新建文件夹"
                  onClick={() => {
                    setCreatingIn(account.id);
                    setNewName('');
                  }}
                >
                  <Icon name="plus" size={12} />
                </button>
                <button
                  type="button"
                  className="hidden text-shell-faint hover:text-brand-600 group-hover:block"
                  title={account.demo ? '演示邮箱（无需同步）' : '同步此账户'}
                  onClick={() => void syncNow(account.id)}
                >
                  <Icon name="refresh" size={12} />
                </button>
              </div>

              {creatingIn === account.id && (
                <div className="flex items-center gap-1 py-1 pl-7 pr-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submitCreate();
                      if (event.key === 'Escape') {
                        setCreatingIn(null);
                        setNewName('');
                      }
                    }}
                    placeholder="文件夹名称，回车确认"
                    className="h-[22px] flex-1 rounded border border-brand-300 bg-white px-1.5 text-[11px] text-shell-text outline-none"
                  />
                  <button type="button" className="text-brand-600" title="创建" onClick={() => void submitCreate()}>
                    <Icon name="check" size={12} />
                  </button>
                  <button
                    type="button"
                    className="text-shell-faint hover:text-shell-text"
                    title="取消"
                    onClick={() => {
                      setCreatingIn(null);
                      setNewName('');
                    }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              )}

              {expanded &&
                accountFolders.map((folder) => (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    active={selectedFolderId === folder.id && view === 'mail'}
                    indent={1}
                    onClick={() => void selectFolder(folder.id)}
                    onContext={(event, target) => {
                      event.preventDefault();
                      setMenu({ x: event.clientX, y: event.clientY, folder: target });
                    }}
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
              <span className="flex-1 font-medium">{tt('邮件简报')}</span>
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
            <span className="flex-1 font-medium">{tt('待办事项')}</span>
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
          <span className="flex-1 text-left">{tt('设置')}</span>
          <span className="text-[10px] text-shell-faint">v{info?.version ?? '1.0.0'}</span>
        </button>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={folderMenuItems(menu.folder)}
          onClose={() => setMenu(null)}
        />
      )}

      {accountMenu && (
        <ContextMenu
          x={accountMenu.x}
          y={accountMenu.y}
          items={[
            {
              label: accountMenu.demo ? '演示邮箱（无需同步）' : '立即收取此账户',
              disabled: accountMenu.demo,
              onClick: () => void syncNow(accountMenu.accountId),
            },
            { label: '在此账户下新建文件夹…', onClick: () => { setCreatingIn(accountMenu.accountId); setNewName(''); } },
            { divider: true },
            { label: '账户设置…', onClick: () => openSettings('account') },
            { divider: true },
            {
              label: '删除账户',
              danger: true,
              onClick: () => setRemoving({ accountId: accountMenu.accountId, name: accountMenu.name }),
            },
          ]}
          onClose={() => setAccountMenu(null)}
        />
      )}

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25" onClick={() => (removeBusy ? null : setRemoving(null))}>
          <div className="w-[360px] rounded-lg border border-shell-line bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-shell-text">
              <Icon name="alert" size={15} className="text-rose-500" />
              删除账户「{removing.name}」
            </div>
            <p className="text-[11px] leading-5 text-shell-sub">
              将删除该账户及其本地已下载的邮件、文件夹与简报，服务器上的邮件不受影响。此操作不可撤销。
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="ghost-btn" disabled={removeBusy} onClick={() => setRemoving(null)}>
                取消
              </button>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                disabled={removeBusy}
                onClick={async () => {
                  setRemoveBusy(true);
                  try {
                    await removeAccount(removing.accountId);
                    pushToast({ type: 'info', title: '账户已删除', message: `「${removing.name}」已从本机移除` });
                    setRemoving(null);
                  } finally {
                    setRemoveBusy(false);
                  }
                }}
              >
                {removeBusy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
