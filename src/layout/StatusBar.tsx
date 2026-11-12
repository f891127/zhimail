/** 底部状态栏：同步状态、邮件统计、AI 模型与隐私状态 */

import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';

export function StatusBar() {
  const { syncProgress, messageTotal, folders, selectedFolderId, settings, info, aiBusy, todoStats } =
    useAppStore();

  const folder = folders.find((item) => item.id === selectedFolderId);
  const syncLabel = (() => {
    if (!syncProgress) return '就绪';
    switch (syncProgress.phase) {
      case 'connecting':
        return '正在连接服务器…';
      case 'listing':
        return syncProgress.message ?? '正在读取文件夹…';
      case 'fetching':
        return syncProgress.message ?? `正在下载邮件 ${syncProgress.current}/${syncProgress.total}`;
      case 'done':
        return syncProgress.message ?? '同步完成';
      case 'error':
        return `同步失败：${syncProgress.message ?? ''}`;
      case 'cancelled':
        return '同步已取消';
      default:
        return '就绪';
    }
  })();

  const syncing = syncProgress && ['connecting', 'listing', 'fetching'].includes(syncProgress.phase);
  const progressPct =
    syncProgress && syncProgress.total > 0
      ? Math.min(100, Math.round((syncProgress.current / syncProgress.total) * 100))
      : null;

  return (
    <div className="relative flex h-[24px] shrink-0 items-center gap-3 border-t border-shell-line bg-shell-chrome px-3 text-[11px] text-shell-sub">
      {syncing && progressPct !== null && (
        <div className="absolute left-0 top-0 h-[2px] bg-brand-100" style={{ width: '100%' }}>
          <div className="h-full bg-brand-500 transition-all duration-180" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <span className="flex items-center gap-1">
        <Icon
          name={syncing ? 'refresh' : syncProgress?.phase === 'error' ? 'alert' : 'check-circle'}
          size={11}
          className={syncing ? 'animate-spin text-brand-500' : syncProgress?.phase === 'error' ? 'text-accent-500' : 'text-emerald-600'}
        />
        <span className={syncProgress?.phase === 'error' ? 'text-accent-600' : ''}>{syncLabel}</span>
      </span>

      <span className="h-3 w-px bg-shell-line" />

      <span className="tabular-nums">
        {folder?.name ?? '全部邮件'}：{messageTotal} 封
      </span>

      <span className="h-3 w-px bg-shell-line" />

      <span className="flex items-center gap-1 tabular-nums">
        <Icon name="checklist" size={11} />
        待办 {todoStats.pending} 项待处理
        {todoStats.overdue > 0 && <span className="text-accent-600">（逾期 {todoStats.overdue}）</span>}
      </span>

      <div className="ml-auto flex items-center gap-3">
        {aiBusy && (
          <span className="flex items-center gap-1 text-brand-600">
            <Icon name="sparkles" size={11} className="animate-pulse-soft" />
            AI 正在处理…
          </span>
        )}
        <span className="flex items-center gap-1">
          <Icon name="sparkles" size={11} className={settings?.ai.hasApiKey ? 'text-brand-500' : 'text-shell-faint'} />
          {settings?.ai.hasApiKey ? `${settings.ai.model}` : 'AI 未配置'}
        </span>
        <span className="flex items-center gap-1" title={info?.dataDir}>
          <Icon name="shield" size={11} className={info?.strongEncryption ? 'text-emerald-600' : 'text-amber-500'} />
          {info?.strongEncryption ? '凭据已加密' : '凭据为本地编码'}
        </span>
        <span className="text-shell-faint">v{info?.version ?? '1.0.0'}</span>
      </div>
    </div>
  );
}
