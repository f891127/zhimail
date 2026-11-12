/** 写信窗口：回复/转发、草稿自动保存、写作提示与 AI 结果预览后插入 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { htmlToPlain, renderMarkdown } from '@/lib/markdown';
import { api } from '@/lib/api';

const ASSIST_ACTIONS: { id: string; label: string; hint: string }[] = [
  { id: 'continue', label: '续写', hint: '接着当前内容往下写' },
  { id: 'polish', label: '润色', hint: '更准确通顺' },
  { id: 'formalize', label: '正式化', hint: '商务严谨语气' },
  { id: 'shorten', label: '精简', hint: '去掉冗余' },
  { id: 'expand', label: '扩写', hint: '补充细节依据' },
  { id: 'bullets', label: '要点化', hint: '背景/结论/请求' },
  { id: 'translate', label: '译英', hint: '翻译为英文' },
];

export function ComposeWindow() {
  const store = useAppStore();
  const { compose, accounts, aiBusy, aiProgress } = store;
  const editorRef = useRef<HTMLDivElement>(null);
  const initialHtml = useRef(compose.html);
  const [showCc, setShowCc] = useState(Boolean(compose.cc));
  const [showBcc, setShowBcc] = useState(Boolean(compose.bcc));
  const [assistOpen, setAssistOpen] = useState(compose.assistOpen);
  const [assistResult, setAssistResult] = useState<string | null>(null);
  const [assistAction, setAssistAction] = useState<string>('polish');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (compose.open) {
      initialHtml.current = compose.html;
      setAssistResult(null);
      setShowCc(Boolean(compose.cc));
      setShowBcc(Boolean(compose.bcc));
    }
  }, [compose.open, compose.html]);

  // 草稿自动保存
  useEffect(() => {
    if (!compose.open) return;
    const timer = setInterval(() => {
      void store.saveComposeDraft();
    }, 20000);
    return () => clearInterval(timer);
  }, [compose.open]);

  if (!compose.open) return null;

  const syncHtml = () => {
    if (editorRef.current) store.updateCompose({ html: editorRef.current.innerHTML });
  };

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncHtml();
  };

  const runAssist = async () => {
    const text = editorRef.current ? htmlToPlain(editorRef.current.innerHTML) : '';
    const result = await store.composeAssist(assistAction, text, {
      subject: compose.subject,
      to: compose.to,
      targetLanguage: assistAction === 'translate' ? 'English' : undefined,
    });
    if (result) setAssistResult(result);
  };

  const insertResult = (mode: 'append' | 'replace') => {
    if (!assistResult || !editorRef.current) return;
    const html = assistResult
      .split('\n')
      .map((line) => `<p>${line || '<br/>'}</p>`)
      .join('');
    editorRef.current.innerHTML = mode === 'replace' ? html : `${editorRef.current.innerHTML}${html}`;
    syncHtml();
    setAssistResult(null);
  };

  const pickAttachments = async () => {
    try {
      const files = await api.system.pickFiles();
      if (files?.length) {
        store.updateCompose({ attachments: [...new Set([...(compose.attachments ?? []), ...files])] });
      }
    } catch (error) {
      store.pushToast({ type: 'error', title: '选择附件失败', message: (error as Error).message });
    }
  };

  const send = async () => {
    setSending(true);
    try {
      await store.sendCompose();
    } finally {
      setSending(false);
    }
  };

  const titleMap = { new: '写邮件', reply: '回复', replyAll: '回复全部', forward: '转发' } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6">
      <div className="flex h-[min(760px,92vh)] w-[min(980px,94vw)] animate-rise-in flex-col overflow-hidden rounded-lg border border-shell-line bg-white shadow-[0_16px_48px_rgba(16,24,40,0.22)]">
        {/* 标题栏 */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-shell-line bg-shell-chrome px-3">
          <Icon name="compose" size={13} className="text-brand-600" />
          <span className="text-xs font-semibold text-shell-text">{titleMap[compose.mode]}</span>
          {compose.mode !== 'new' && (
            <span className="truncate text-[11px] text-shell-sub">{compose.subject}</span>
          )}
          <button
            type="button"
            className="ml-auto rounded p-1 text-shell-faint hover:bg-black/5 hover:text-shell-text"
            onClick={() => {
              void store.saveComposeDraft();
              store.closeCompose();
            }}
            title="关闭并保存草稿"
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        {/* 收件人区 */}
        <div className="shrink-0 border-b border-shell-lineSoft px-3 py-1.5">
          <div className="flex items-center gap-2 border-b border-shell-lineSoft py-1">
            <span className="w-14 shrink-0 text-[11px] text-shell-faint">发件人</span>
            <select
              value={compose.accountId}
              onChange={(event) => store.updateCompose({ accountId: event.target.value })}
              className="flex-1 bg-transparent text-xs text-shell-text outline-none"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName} &lt;{account.email}&gt;
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 border-b border-shell-lineSoft py-1">
            <span className="w-14 shrink-0 text-[11px] text-shell-faint">收件人</span>
            <input
              value={compose.to}
              onChange={(event) => store.updateCompose({ to: event.target.value })}
              placeholder="多个地址用逗号或分号分隔"
              className="flex-1 bg-transparent text-xs text-shell-text outline-none placeholder:text-shell-faint"
            />
            <button type="button" className="text-[10px] text-shell-faint hover:text-brand-600" onClick={() => setShowCc((v) => !v)}>
              抄送
            </button>
            <button type="button" className="text-[10px] text-shell-faint hover:text-brand-600" onClick={() => setShowBcc((v) => !v)}>
              密送
            </button>
          </div>
          {showCc && (
            <div className="flex items-center gap-2 border-b border-shell-lineSoft py-1">
              <span className="w-14 shrink-0 text-[11px] text-shell-faint">抄送</span>
              <input
                value={compose.cc}
                onChange={(event) => store.updateCompose({ cc: event.target.value })}
                className="flex-1 bg-transparent text-xs text-shell-text outline-none"
              />
            </div>
          )}
          {showBcc && (
            <div className="flex items-center gap-2 border-b border-shell-lineSoft py-1">
              <span className="w-14 shrink-0 text-[11px] text-shell-faint">密送</span>
              <input
                value={compose.bcc}
                onChange={(event) => store.updateCompose({ bcc: event.target.value })}
                className="flex-1 bg-transparent text-xs text-shell-text outline-none"
              />
            </div>
          )}
          <div className="flex items-center gap-2 py-1">
            <span className="w-14 shrink-0 text-[11px] text-shell-faint">主题</span>
            <input
              value={compose.subject}
              onChange={(event) => store.updateCompose({ subject: event.target.value })}
              placeholder="邮件主题"
              className="flex-1 bg-transparent text-xs font-medium text-shell-text outline-none placeholder:font-normal placeholder:text-shell-faint"
            />
          </div>
        </div>

        {/* 编辑工具条 */}
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-shell-line bg-[#fafbfc] px-2">
          <button type="button" className="primary-btn" disabled={sending || !compose.to.trim()} onClick={() => void send()}>
            <Icon name="send" size={12} />
            {sending ? '发送中…' : '发送'}
          </button>
          <button type="button" className="tool-btn" onClick={() => void store.saveComposeDraft()}>
            保存草稿
          </button>
          <button type="button" className="tool-btn" onClick={() => void pickAttachments()}>
            <Icon name="paperclip" size={13} /> 附件
          </button>

          <div className="mx-1 h-3.5 w-px bg-shell-lineSoft" />

          <button type="button" className="tool-btn font-bold" onClick={() => exec('bold')} title="加粗">
            B
          </button>
          <button type="button" className="tool-btn italic" onClick={() => exec('italic')} title="斜体">
            I
          </button>
          <button type="button" className="tool-btn underline" onClick={() => exec('underline')} title="下划线">
            U
          </button>
          <button type="button" className="tool-btn" onClick={() => exec('insertUnorderedList')} title="项目符号">
            <Icon name="checklist" size={13} />
          </button>

          <button
            type="button"
            className={`tool-btn ml-auto ${assistOpen ? 'chrome-btn-active' : ''}`}
            onClick={() => setAssistOpen((value) => !value)}
          >
            <Icon name="sparkles" size={13} className="text-brand-500" />
            写作提示
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 正文编辑 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncHtml}
              onBlur={syncHtml}
              className="scroll-area flex-1 px-4 py-3 text-sm leading-[1.8] text-shell-text outline-none"
              style={{ userSelect: 'text' }}
              dangerouslySetInnerHTML={{ __html: initialHtml.current }}
            />
            {(compose.attachments ?? []).length > 0 && (
              <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-shell-lineSoft bg-[#fafbfc] px-3 py-1.5">
                {(compose.attachments ?? []).map((file) => (
                  <span
                    key={file}
                    className="flex items-center gap-1 rounded border border-shell-line bg-white px-1.5 py-[2px] text-[11px] text-shell-text"
                  >
                    <Icon name="paperclip" size={10} className="text-brand-500" />
                    <span className="max-w-[220px] truncate">{file.split(/[\\/]/).pop()}</span>
                    <button
                      type="button"
                      className="text-shell-faint hover:text-accent-600"
                      onClick={() =>
                        store.updateCompose({
                          attachments: (compose.attachments ?? []).filter((item) => item !== file),
                        })
                      }
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 写作提示面板 */}
          {assistOpen && (
            <div className="flex w-[300px] shrink-0 flex-col border-l border-shell-line bg-[#fbfcfd]">
              <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-shell-line px-2.5">
                <Icon name="sparkles" size={12} className="text-brand-500" />
                <span className="text-[11px] font-medium text-shell-text">写作提示</span>
                {aiBusy && <span className="ml-auto text-[10px] text-brand-600">生成中…</span>}
              </div>
              <div className="shrink-0 px-2.5 py-2">
                <div className="grid grid-cols-3 gap-1">
                  {ASSIST_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      title={action.hint}
                      onClick={() => setAssistAction(action.id)}
                      className={`rounded border px-1 py-[3px] text-[11px] transition-colors duration-120 ${
                        assistAction === action.id
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-shell-line bg-white text-shell-sub hover:border-brand-300 hover:text-brand-600'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="primary-btn mt-1.5 w-full justify-center"
                  disabled={aiBusy}
                  onClick={() => void runAssist()}
                >
                  <Icon name="sparkles" size={12} />
                  {aiBusy ? '生成中…' : '生成建议'}
                </button>
                {aiBusy && aiProgress && (
                  <p className="mt-1 text-[10px] text-shell-faint">{aiProgress}</p>
                )}
              </div>

              <div className="scroll-area flex-1 border-t border-shell-lineSoft px-2.5 py-2">
                {!assistResult && (
                  <p className="text-[11px] leading-5 text-shell-faint">
                    选择上方的写作动作后点击「生成建议」。结果会先在此预览，确认后再插入正文，不会直接覆盖你的内容。
                  </p>
                )}
                {assistResult && (
                  <>
                    <div
                      className="md-body mb-2 rounded border border-shell-lineSoft bg-white p-2 text-[11.5px]"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(assistResult) }}
                    />
                    <div className="flex gap-1">
                      <button type="button" className="ghost-btn flex-1 justify-center" onClick={() => insertResult('append')}>
                        插入正文
                      </button>
                      <button type="button" className="ghost-btn flex-1 justify-center" onClick={() => insertResult('replace')}>
                        替换正文
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => setAssistResult(null)}>
                        放弃
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
