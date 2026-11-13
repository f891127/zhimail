/** 正在安装更新时的全屏遮罩：给出明确的进度反馈，避免“点了没反应”的错觉 */
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';

export function UpdateInstallingOverlay() {
  const { updateState } = useAppStore();
  const [seconds, setSeconds] = useState(0);

  const visible = updateState?.phase === 'installing';

  useEffect(() => {
    if (!visible) {
      setSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45">
      <div className="w-[360px] rounded-lg border border-shell-line bg-white px-5 py-5 shadow-menu">
        <div className="flex items-center gap-2">
          <Icon name="refresh" size={16} className="animate-spin text-brand-500" />
          <span className="text-sm font-semibold text-shell-text">
            正在安装 v{updateState?.version ?? ''}
          </span>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-shell-lineSoft">
          <div className="h-full w-1/3 animate-pulse-soft rounded bg-brand-500" />
        </div>

        <div className="mt-3 space-y-1 text-[11px] leading-4 text-shell-sub">
          <div>1. 关闭知邮，启动安装程序（静默安装，约 5~20 秒）</div>
          <div>2. 安装完成后自动打开新版本（无需手动重启）</div>
          <div className="text-shell-faint">
            已等待 {seconds} 秒。若窗口长时间无变化，说明安装程序未能接管，可在「设置 → 在线更新」点击「手动运行安装包」，
            安装包已下载到本地。
          </div>
        </div>
      </div>
    </div>
  );
}
