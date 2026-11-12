/** 右下角消息提示 */

import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';

const ICONS = {
  info: 'info',
  success: 'check-circle',
  error: 'alert',
} as const;

const TONES = {
  info: 'text-brand-600',
  success: 'text-emerald-600',
  error: 'text-accent-600',
} as const;

export function ToastHost() {
  const { toasts, dismissToast } = useAppStore();

  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-[60] flex w-[340px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-rise-in rounded-md border border-shell-line bg-white p-2.5 shadow-card"
        >
          <div className="flex items-start gap-2">
            <Icon name={ICONS[toast.type]} size={14} className={`mt-[1px] ${TONES[toast.type]}`} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-shell-text">{toast.title}</div>
              {toast.message && (
                <div className="mt-0.5 break-words text-[11px] leading-4 text-shell-sub">{toast.message}</div>
              )}
              {toast.action && (
                <button
                  type="button"
                  className="mt-1 text-[11px] font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    toast.action?.run();
                    dismissToast(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              className="text-shell-faint hover:text-shell-text"
              onClick={() => dismissToast(toast.id)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
