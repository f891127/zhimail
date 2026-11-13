/** 更新弹窗：检查 → 发现新版本 → 开始下载 → 下载完成立即重装，全流程不用再去设置页找 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from './Icon';

function formatSpeed(bytes?: number): string {
  if (!bytes) return '';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB/s`;
}

export function UpdateDialog() {
  const store = useAppStore();
  const {
    updateDialogOpen,
    closeUpdateDialog,
    updateState,
    downloadUpdate,
    installUpdate,
    checkUpdate,
    settingsOpen,
    settingsTab,
  } = store;
  // 设置窗口已经停在「在线更新」页时，那里本身就有进度条，
  // 再叠一个更新弹窗会出现两个下载窗口，进度也只留一处展示
  const suppressed = settingsOpen && settingsTab === 'update';
  const [notesOpen, setNotesOpen] = useState(false);

  // 打开时若还没有状态，主动查一次
  useEffect(() => {
    if (updateDialogOpen && !updateState) void checkUpdate();
  }, [updateDialogOpen, updateState, checkUpdate]);

  // 被设置页接管时顺手关掉弹窗状态，避免用户关掉设置后弹窗又冒出来
  useEffect(() => {
    if (updateDialogOpen && suppressed) closeUpdateDialog();
  }, [updateDialogOpen, suppressed, closeUpdateDialog]);

  if (!updateDialogOpen || suppressed) return null;
  // 开始安装后自动让位给安装进度遮罩，避免挡住进度
  if (updateState?.phase === 'installing') return null;

  const phase = updateState?.phase ?? 'idle';
  const percent = Math.max(0, Math.min(100, Math.round(updateState?.percent ?? 0)));
  const current = updateState?.currentVersion ?? store.info?.version ?? '';

  const title =
    phase === 'available'
      ? `发现新版本 v${updateState?.version ?? ''}`
      : phase === 'downloaded'
        ? '更新已下载完成'
        : phase === 'downloading'
          ? '正在下载更新'
          : phase === 'checking'
            ? '正在检查更新'
            : phase === 'not-available'
              ? '已是最新版本'
              : phase === 'error'
                ? '检查更新失败'
                : phase === 'unsupported'
                  ? '开发模式不支持自动更新'
                  : '软件更新';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/25">
      <div className="w-[520px] overflow-hidden rounded-lg border border-shell-line bg-shell-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-shell-line bg-shell-chrome px-4 py-2.5">
          <Icon name="refresh" size={15} className="text-brand-600" />
          <span className="flex-1 text-sm font-semibold text-shell-text">{title}</span>
          <button type="button" className="chrome-btn px-1.5" onClick={closeUpdateDialog} title="关闭">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="px-4 py-4 text-xs leading-6 text-shell-text">
          {phase === 'checking' && (
            <div className="flex items-center gap-2 text-shell-sub">
              <Icon name="refresh" size={14} className="animate-spin text-brand-500" />
              正在向更新服务器查询最新版本…
            </div>
          )}

          {phase === 'available' && (
            <div className="space-y-3">
              <div className="text-shell-sub">
                当前版本 <span className="tabular-nums">v{current}</span> → 最新版本{' '}
                <span className="font-semibold text-brand-700 tabular-nums">v{updateState?.version}</span>
                {updateState?.releaseDate && (
                  <span className="ml-2 text-shell-faint">发布于 {new Date(updateState.releaseDate).toLocaleDateString('zh-CN')}</span>
                )}
              </div>
              {updateState?.releaseNotes && (
                <div className="rounded border border-shell-lineSoft bg-[#fafbfc]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 px-2.5 py-1.5 text-[11px] text-shell-sub"
                    onClick={() => setNotesOpen((open) => !open)}
                  >
                    <Icon name={notesOpen ? 'chevron-down' : 'chevron-right'} size={11} />
                    本次更新内容
                  </button>
                  {notesOpen && (
                    <div className="max-h-[180px] overflow-auto whitespace-pre-wrap border-t border-shell-lineSoft px-2.5 py-2 text-[11px] leading-5 text-shell-sub">
                      {String(updateState.releaseNotes).replace(/<[^>]+>/g, '')}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button type="button" className="primary-btn" onClick={() => void downloadUpdate()}>
                  <Icon name="download" size={13} />
                  开始下载
                </button>
                <button type="button" className="ghost-btn" onClick={closeUpdateDialog}>
                  稍后再说
                </button>
              </div>
            </div>
          )}

          {phase === 'downloading' && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded bg-shell-lineSoft">
                <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-shell-sub tabular-nums">
                <span>{percent}%</span>
                <span>{formatSpeed(updateState?.bytesPerSecond)}</span>
              </div>
              <p className="text-[11px] text-shell-faint">下载完成后会提示立即重启安装，不影响当前使用。</p>
            </div>
          )}

          {phase === 'downloaded' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Icon name="check-circle" size={16} className="mt-0.5 text-emerald-600" />
                <div>
                  <div className="font-medium text-shell-text">v{updateState?.version} 已下载完成</div>
                  <div className="text-[11px] text-shell-sub">
                    重启后自动完成安装（约 10–30 秒），邮件与设置都会保留。
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="primary-btn" onClick={() => void installUpdate()}>
                  <Icon name="refresh" size={13} />
                  立即重启并安装
                </button>
                <button type="button" className="ghost-btn" onClick={closeUpdateDialog}>
                  稍后
                </button>
              </div>
            </div>
          )}

          {phase === 'not-available' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-shell-sub">
                <Icon name="check-circle" size={15} className="text-emerald-600" />
                当前已是最新版本（v{current}）。
              </div>
              <button type="button" className="ghost-btn" onClick={closeUpdateDialog}>
                关闭
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-3">
              <div className="rounded border border-accent-500/30 bg-accent-500/[0.06] px-2.5 py-2 text-[11px] leading-5 text-accent-600">
                {updateState?.error ?? '未知错误'}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="primary-btn" onClick={() => void checkUpdate()}>
                  重试
                </button>
                <button type="button" className="ghost-btn" onClick={() => store.openSettings('update')}>
                  更换更新源
                </button>
                <button type="button" className="ghost-btn" onClick={closeUpdateDialog}>
                  关闭
                </button>
              </div>
            </div>
          )}

          {phase === 'unsupported' && (
            <div className="space-y-3">
              <div className="text-shell-sub">{updateState?.error ?? '开发模式不检查更新。'}</div>
              <button type="button" className="ghost-btn" onClick={closeUpdateDialog}>
                关闭
              </button>
            </div>
          )}

          {phase === 'idle' && (
            <div className="space-y-3">
              <div className="text-shell-sub">当前版本 v{current}</div>
              <button type="button" className="primary-btn" onClick={() => void checkUpdate()}>
                检查更新
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-shell-line bg-shell-chrome px-4 py-2 text-[11px] text-shell-faint">
          <span>当前版本 v{current}</span>
          <button type="button" className="hover:text-brand-600" onClick={() => store.openSettings('update')}>
            更新设置
          </button>
        </div>
      </div>
    </div>
  );
}
