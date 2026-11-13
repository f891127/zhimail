/** 附件预览：图片 / PDF / 文本直接在客户端内查看，其它类型提示保存到本地打开 */
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { fileSize } from '@/lib/format';
import type { AttachmentDataResult } from '@/types/zhimail';

export function AttachmentPreview({
  messageId,
  filename,
  size,
  onClose,
}: {
  messageId: string;
  filename: string;
  size?: number;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ loading: boolean; result?: AttachmentDataResult }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    void api.messages
      .attachmentData({ messageId, filename })
      .then((result) => {
        if (!cancelled) setState({ loading: false, result });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ loading: false, result: { ok: false, error: error.message } });
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, filename]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-6" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[980px] flex-col overflow-hidden rounded-lg border border-shell-line bg-white shadow-menu"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-shell-lineSoft bg-shell-chrome px-3">
          <Icon name="paperclip" size={13} className="text-shell-sub" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-shell-text">{filename}</span>
          {typeof size === 'number' && <span className="text-[11px] text-shell-faint">{fileSize(size)}</span>}
          <button type="button" className="rounded p-1 hover:bg-black/[0.06]" title="关闭" onClick={onClose}>
            <Icon name="close" size={12} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f6f7f9]">
          {state.loading && (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-shell-faint">
              <Icon name="refresh" size={13} className="animate-spin" />
              正在读取附件…
            </div>
          )}

          {!state.loading && state.result && !state.result.ok && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <Icon name="alert" size={26} className="text-amber-500" />
              <p className="text-xs text-shell-sub">{state.result.error ?? '无法预览该附件'}</p>
              <p className="text-[11px] text-shell-faint">可在阅读窗格中双击附件，用系统默认程序打开。</p>
            </div>
          )}

          {!state.loading && state.result?.kind === 'image' && (
            <div className="flex h-full items-center justify-center p-4">
              <img src={state.result.dataUrl} alt={filename} className="max-h-full max-w-full object-contain shadow-sm" />
            </div>
          )}

          {!state.loading && state.result?.kind === 'pdf' && (
            <iframe title={filename} src={state.result.dataUrl} className="h-full w-full border-0 bg-white" />
          )}

          {!state.loading && state.result?.kind === 'text' && (
            <pre className="h-full w-full overflow-auto whitespace-pre-wrap bg-white p-4 text-[11px] leading-5 text-shell-text">
              {state.result.text}
            </pre>
          )}

          {!state.loading && state.result?.kind === 'other' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <Icon name="document" size={26} className="text-shell-line" />
              <p className="text-xs text-shell-sub">该类型暂不支持在线预览</p>
              <p className="text-[11px] text-shell-faint">可在阅读窗格中双击附件，用系统默认程序打开。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
