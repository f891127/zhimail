/**
 * PDF 预览：用 pdf.js 自己渲染到 canvas。
 *
 * 为什么不用 Electron 内置的 PDF 阅读器（plugins: true）：它是 Chromium 的插件进程，
 * 在我们这种无边框窗口 + 复杂布局里经常只画出外壳、页面一片灰，而且 file:// 父页面
 * 不允许嵌入 file:// 子文档、自定义协议它也不认。改成自己渲染后行为完全可控，
 * 还能做页码跳转与缩放。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
// pdf.js 的 worker 通过 Vite 的 ?url 打进产物，避免运行时找不到文件
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfDocument = Awaited<ReturnType<typeof import('pdfjs-dist')['getDocument']>['promise']>;

export function PdfViewer({ url, filename }: { url: string; filename: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PdfDocument | null>(null);
  // 同一块 canvas 上不能并发渲染，缩放连点时要先取消上一次
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 载入文档
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    setPage(1);
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdfjs.getDocument({ url, isEvalSupported: false, useSystemFonts: true });
        const loaded = await task.promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        docRef.current = loaded;
        setDoc(loaded);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || '无法解析该 PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      void docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url]);

  // 渲染当前页
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void (async () => {
      try {
        renderTaskRef.current?.cancel();
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext('2d');
        if (!context) return;
        const task = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (!cancelled) setError((err as Error).message || '页面渲染失败');
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [doc, page, scale]);

  const total = doc?.numPages ?? 0;
  const toolbar = useMemo(
    () => (
      <div className="flex h-8 shrink-0 items-center justify-center gap-2 border-b border-shell-lineSoft bg-shell-chrome px-3 text-[11px] text-shell-sub">
        <button
          type="button"
          className="rounded p-1 hover:bg-black/[0.06] disabled:opacity-40"
          title="上一页"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <Icon name="chevron-down" size={12} className="rotate-90" />
        </button>
        <span className="tabular-nums">
          {total ? `${page} / ${total}` : '—'}
        </span>
        <button
          type="button"
          className="rounded p-1 hover:bg-black/[0.06] disabled:opacity-40"
          title="下一页"
          disabled={!total || page >= total}
          onClick={() => setPage((value) => Math.min(total, value + 1))}
        >
          <Icon name="chevron-right" size={12} />
        </button>
        <span className="mx-1 h-3 w-px bg-shell-line" />
        <button
          type="button"
          className="rounded p-1 hover:bg-black/[0.06]"
          title="缩小"
          onClick={() => setScale((value) => Math.max(0.5, Number((value - 0.2).toFixed(2))))}
        >
          <span className="text-[13px] leading-none">−</span>
        </button>
        <span className="w-9 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="rounded p-1 hover:bg-black/[0.06]"
          title="放大"
          onClick={() => setScale((value) => Math.min(3, Number((value + 0.2).toFixed(2))))}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>
    ),
    [page, scale, total],
  );

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <Icon name="alert" size={26} className="text-amber-500" />
        <p className="text-xs text-shell-sub">PDF 渲染失败：{error}</p>
        <p className="text-[11px] text-shell-faint">
          可点右上角「打开」用系统默认阅读器打开，或「另存为」保存到本地。{filename ? '' : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f9]">
      {toolbar}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-shell-faint">
            <Icon name="refresh" size={13} className="animate-spin" />
            正在解析 PDF…
          </div>
        )}
        <div className="flex justify-center">
          <canvas ref={canvasRef} className="bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
