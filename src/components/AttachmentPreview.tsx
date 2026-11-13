/** 附件预览：图片 / PDF / 文本直接在客户端内查看，其它类型提示保存到本地打开 */
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PdfViewer } from '@/components/PdfViewer';
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
  const [busy, setBusy] = useState<'open' | 'save' | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function handleOpen() {
    setBusy('open');
    setHint(null);
    const result = await api.messages.attachmentOpen({ messageId, filename });
    setBusy(null);
    if (!result.ok) setHint(result.error ?? '打开失败');
  }

  async function handleSave() {
    setBusy('save');
    setHint(null);
    const result = await api.messages.attachmentSave({ messageId, filename });
    setBusy(null);
    if (result.ok) setHint(`已保存到 ${result.path}`);
    else if (!result.canceled) setHint(result.error ?? '保存失败');
  }

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
          <button
            type="button"
            className="tool-btn h-6 px-2 text-[11px]"
            disabled={busy !== null}
            onClick={() => void handleOpen()}
          >
            <Icon name="external" size={12} />
            打开
          </button>
          <button
            type="button"
            className="tool-btn h-6 px-2 text-[11px]"
            disabled={busy !== null}
            onClick={() => void handleSave()}
          >
            <Icon name="download" size={12} />
            另存为
          </button>
          <button type="button" className="rounded p-1 hover:bg-black/[0.06]" title="关闭" onClick={onClose}>
            <Icon name="close" size={12} />
          </button>
        </div>

        {hint && (
          <div className="flex shrink-0 items-center gap-2 border-b border-shell-lineSoft bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            <Icon name="info" size={12} />
            <span className="min-w-0 flex-1 truncate">{hint}</span>
          </div>
        )}
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
              <p className="text-[11px] text-shell-faint">可点右上角「打开」用系统默认程序打开，或「另存为」保存到本地。</p>
            </div>
          )}

          {!state.loading && state.result?.kind === 'image' && (
            <div className="flex h-full items-center justify-center p-4">
              <img src={state.result.dataUrl} alt={filename} className="max-h-full max-w-full object-contain shadow-sm" />
            </div>
          )}

          {!state.loading && state.result?.kind === 'pdf' && (
            <PdfViewer url={state.result.url ?? state.result.dataUrl ?? ''} filename={filename} />
          )}

          {!state.loading && state.result?.kind === 'text' && (
            <pre className="h-full w-full overflow-auto whitespace-pre-wrap bg-white p-4 text-[11px] leading-5 text-shell-text">
              {state.result.text}
            </pre>
          )}

          {!state.loading && state.result?.kind === 'docx' && (
            <div className="mx-auto max-w-[760px] bg-white px-8 py-6 text-[13px] leading-7 text-shell-text [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-1.5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-shell-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-shell-line [&_th]:bg-shell-chrome [&_th]:px-2 [&_th]:py-1">
              <div
                // 内容来自 mammoth 的 docx→HTML 转换，仅保留排版标签
                dangerouslySetInnerHTML={{ __html: state.result.html ?? '' }}
              />
            </div>
          )}
          {!state.loading && state.result?.kind === 'sheet' && (
            <div className="flex h-full flex-col">
              {(state.result.sheets ?? []).map((sheet) => (
                <div key={sheet.name} className="min-h-0 flex-1 overflow-auto border-b border-shell-line last:border-b-0">
                  <div className="sticky left-0 top-0 z-10 border-b border-shell-line bg-shell-chrome px-3 py-1 text-[11px] font-medium text-shell-sub">
                    工作表：{sheet.name}
                  </div>
                  <div
                    className="p-2 text-[11px] [&_table]:border-collapse [&_td]:border [&_td]:border-shell-line [&_td]:px-2 [&_td]:py-0.5 [&_td]:align-top [&_td]:whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: sheet.html }}
                  />
                </div>
              ))}
            </div>
          )}
          {!state.loading && state.result?.kind === 'slides' && (
            <div className="mx-auto max-w-[820px] space-y-3 p-4">
              {(state.result.slides ?? []).map((slide) => (
                <div key={slide.index} className="rounded border border-shell-line bg-white p-4">
                  <div className="mb-2 text-[11px] font-medium text-shell-faint">第 {slide.index} 页</div>
                  {slide.texts.length === 0 ? (
                    <p className="text-[11px] text-shell-faint">（这一页没有文字，可能是图片或图表）</p>
                  ) : (
                    <ul className="space-y-1 text-[12px] leading-6 text-shell-text">
                      {slide.texts.map((line, index) => (
                        <li key={index} className={index === 0 ? 'font-semibold' : undefined}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {!state.loading && state.result?.kind === 'other' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <Icon name="document" size={26} className="text-shell-line" />
              <p className="text-xs text-shell-sub">该类型暂不支持在线预览</p>
              <p className="text-[11px] text-shell-faint">可点右上角「打开」用系统默认程序打开，或「另存为」保存到本地。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
