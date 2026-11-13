/** 阅读窗格：邮件头信息、AI 操作条、正文渲染、附件与会话上下文 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { AttachmentPreview } from '@/components/AttachmentPreview';
import { Icon } from '@/components/Icon';
import { addressLabel, fileSize, fullTime, senderName } from '@/lib/format';
import { buildMailDocument, renderMarkdown, textToHtml } from '@/lib/markdown';
import { api } from '@/lib/api';
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu';
import {
  DEFAULT_READER_ACTIONS,
  READER_ACTION_LIMIT_MAX,
  READER_ACTION_LIMIT_MIN,
  READER_ACTION_VISIBLE_LIMIT,
  findReaderAction,
} from '@/lib/readerActions';
import type { MessageMeta } from '@/types/zhimail';

function EmptyReading() {
  const store = useAppStore();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-shell-bg px-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-500">
        <Icon name="mail" size={30} strokeWidth={1.3} />
      </div>
      <h2 className="text-base font-semibold text-shell-text">选择一封邮件开始阅读</h2>
      <p className="max-w-[320px] text-xs leading-5 text-shell-faint">
        选中邮件后，可在此阅读正文、查看附件，并使用 AI 生成摘要、会话串摘要、回复建议与待办事项。
      </p>
      <div className="mt-1 flex gap-2">
        <button type="button" className="ghost-btn" onClick={() => store.setAIPanel(true, 'analysis')}>
          <Icon name="sparkles" size={13} className="text-brand-500" />
          打开 AI 汇总分析
        </button>
        <button type="button" className="ghost-btn" onClick={() => store.setView('briefs')}>
          <Icon name="document" size={13} />
          查看邮件简报
        </button>
      </div>
    </div>
  );
}


/** 正文是否明显乱码（与主进程判定保持一致，用于提示一键重新解码） */
function looksGarbled(text: string | undefined | null): boolean {
  if (!text) return false;
  if (/[\uff61-\uff9f]/.test(text) || text.includes('\ufffd')) return true;
  if (/锟斤拷|烫烫烫|ï¿½/.test(text)) return true;
  const shapes = (text.match(/[\u25A0-\u25FF]/g) ?? []).length;
  return shapes >= 4 && shapes > text.length * 0.02;
}

export function ReadingPane() {
  const store = useAppStore();
  const { selectedMessage, selectedMessageId, aiOutputs, aiBusy } = store;
  const [threadMessages, setThreadMessages] = useState<MessageMeta[]>([]);
  const [showThread, setShowThread] = useState(false);
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  /** 附件预览弹窗（受设置中的「附件预览」开关控制） */
  const [preview, setPreview] = useState<{ filename: string; size?: number } | null>(null);
  /** 附件右键菜单 */
  const [attachMenu, setAttachMenu] = useState<{
    x: number;
    y: number;
    filename: string;
    size?: number;
  } | null>(null);
  /** 单击延迟：若紧接着是双击，就不再弹预览 */
  const attachClickTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (attachClickTimer.current) window.clearTimeout(attachClickTimer.current);
    },
    [],
  );

  useEffect(() => {
    setShowThread(false);
    setShowAllRecipients(false);
    if (selectedMessage?.threadId) {
      void api.messages.thread(selectedMessage.threadId).then(setThreadMessages);
    } else {
      setThreadMessages([]);
    }
  }, [selectedMessage?.threadId, selectedMessageId]);

  const htmlDoc = useMemo(() => {
    if (!selectedMessage) return '';
    const html = selectedMessage.body.html;
    if (html) return buildMailDocument(html);
    const text = selectedMessage.body.text ?? selectedMessage.snippet ?? '';
    return buildMailDocument(textToHtml(text || '（此邮件没有正文内容）'));
  }, [selectedMessage]);

  const summary = aiOutputs.message?.id === selectedMessageId ? aiOutputs.message.markdown : null;
  const triage = aiOutputs.triage?.id === selectedMessageId ? aiOutputs.triage.result : null;
  const translation = aiOutputs.translate?.id === selectedMessageId ? aiOutputs.translate : null;
  const showTranslation = store.translationVisible && Boolean(translation);
  const flagged = selectedMessage?.flags.includes('\\Flagged') ?? false;
  const garbled = looksGarbled(selectedMessage?.body.text ?? selectedMessage?.body.html ?? '');

  if (!selectedMessage) return <EmptyReading />;

  // 操作条配置：未配置时使用默认组合
  const configuredIds =
    store.settings?.ui?.readerActions && store.settings.ui.readerActions.length
      ? store.settings.ui.readerActions
      : DEFAULT_READER_ACTIONS;
  const configuredActions = configuredIds
    .map((id) => findReaderAction(id))
    .filter((action): action is NonNullable<typeof action> => Boolean(action));
  // 最多显示几项由「设置 → 界面」决定，默认 7 项
  const actionLimit = Math.min(
    READER_ACTION_LIMIT_MAX,
    Math.max(READER_ACTION_LIMIT_MIN, store.settings?.ui?.readerActionLimit ?? READER_ACTION_VISIBLE_LIMIT),
  );
  const visibleActions = configuredActions.slice(0, actionLimit);
  const overflowActions = configuredActions.slice(actionLimit);

  const readerHandlers: Record<string, () => void> = {
    reply: () => store.replyToMessage('reply'),
    replyAll: () => store.replyToMessage('replyAll'),
    forward: () => store.replyToMessage('forward'),
    analysis: () => store.setAIPanel(true, 'analysis'),
    summarize: () => void store.runSummarize(selectedMessage.id),
    threadSummary: () => void store.runThreadSummary(selectedMessage.threadId),
    replies: () => void store.runReplies(selectedMessage.id),
    triage: () => void store.runTriage(selectedMessage.id),
    translateZh: () => void store.runTranslate(selectedMessage.id, '中文'),
    translateEn: () => void store.runTranslate(selectedMessage.id, 'English'),
    todos: () => void store.extractTodosFromMessage(selectedMessage.id),
  };

  const overflowItems: ContextMenuItem[] = overflowActions.map((action) => ({
    label: action.label,
    disabled: aiBusy,
    onClick: () => readerHandlers[action.id]?.(),
  }));



  return (
    <div className="flex h-full min-w-0 flex-col bg-shell-bg">
      {/* 主题与操作 */}
      <div className="shrink-0 border-b border-shell-line px-4 pt-3">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 text-base font-semibold leading-6 text-shell-text">
            {selectedMessage.subject || '(无主题)'}
            {selectedMessage.hasAttachments && (
              <Icon name="paperclip" size={13} className="ml-1.5 inline text-shell-faint" />
            )}
          </h1>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className={`tool-btn ${flagged ? 'text-accent-500' : ''}`}
              onClick={() => void store.toggleFlag([selectedMessage.id], '\\Flagged', !flagged)}
              title="星标"
            >
              <Icon name={flagged ? 'star-filled' : 'star'} size={14} />
            </button>
            <button
              type="button"
              className="tool-btn"
              onClick={() => void store.toggleFlag([selectedMessage.id], '\\Seen', !selectedMessage.flags.includes('\\Seen'))}
              title={selectedMessage.flags.includes('\\Seen') ? '标记为未读' : '标记为已读'}
            >
              <Icon name="mail" size={14} />
            </button>
            <button
              type="button"
              className="tool-btn"
              onClick={() => void store.deleteMessages([selectedMessage.id])}
              title="删除"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white">
            {senderName(selectedMessage.from).slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1 text-xs leading-5">
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 whitespace-nowrap font-semibold text-shell-text">
                {senderName(selectedMessage.from)}
              </span>
              <span className="truncate text-[11px] text-shell-faint">
                &lt;{selectedMessage.from[0]?.address}&gt;
              </span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-shell-faint">
                {fullTime(selectedMessage.date)}
              </span>
            </div>
            <div className="text-[11px] text-shell-sub">
              收件人：{addressLabel(selectedMessage.to)}
              {selectedMessage.cc.length > 0 && (
                <>
                  <span className="mx-1 text-shell-line">|</span>
                  抄送：
                  {showAllRecipients ? addressLabel(selectedMessage.cc) : `${selectedMessage.cc.length} 人`}
                </>
              )}
              {selectedMessage.cc.length > 0 && (
                <button
                  type="button"
                  className="ml-1 text-brand-600 hover:underline"
                  onClick={() => setShowAllRecipients((value) => !value)}
                >
                  {showAllRecipients ? '收起' : '展开'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 操作条：统一靠右排列，显示哪些操作、最多几项均可在「设置 → 界面」中配置 */}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1 border-t border-shell-lineSoft py-1.5">
          {visibleActions.length === 0 && overflowActions.length === 0 && (
            <button
              type="button"
              className="text-[11px] text-shell-faint hover:text-brand-600"
              onClick={() => store.openSettings('ui')}
            >
              操作条尚未配置，点击前往「设置 → 界面」添加常用操作
            </button>
          )}
          {visibleActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`tool-btn ${action.brand ? 'text-brand-600' : ''}`}
              disabled={aiBusy && action.id !== 'reply' && action.id !== 'replyAll' && action.id !== 'forward'}
              onClick={readerHandlers[action.id]}
              title={action.title}
            >
              <Icon name={action.icon} size={13} />
              {!action.iconOnly && action.label}
            </button>
          ))}
          {overflowActions.length > 0 && (
            <button
              type="button"
              className="tool-btn"
              title="更多操作"
              onClick={(event) => setMoreMenu({ x: event.clientX, y: event.clientY })}
            >
              <Icon name="more" size={13} />
              更多
            </button>
          )}
        </div>
      </div>

      {moreMenu && (
        <ContextMenu x={moreMenu.x} y={moreMenu.y} items={overflowItems} onClose={() => setMoreMenu(null)} />
      )}

      {/* 附件右键菜单：另存为 / 打开 / 预览 */}
      {attachMenu && selectedMessage && (
        <ContextMenu
          x={attachMenu.x}
          y={attachMenu.y}
          items={[
            {
              label: '打开（系统默认程序）',
              shortcut: '双击',
              onClick: () => {
                const target = attachMenu;
                setAttachMenu(null);
                void api.messages.attachmentOpen({
                  messageId: selectedMessage.id,
                  filename: target.filename,
                });
              },
            },
            {
              label: '另存为…',
              onClick: () => {
                const target = attachMenu;
                setAttachMenu(null);
                void (async () => {
                  const result = await api.messages.attachmentSave({
                    messageId: selectedMessage.id,
                    filename: target.filename,
                  });
                  if (result.ok) {
                    store.pushToast({ type: 'success', title: '附件已保存', message: result.path });
                  } else if (!result.canceled) {
                    store.pushToast({ type: 'error', title: '另存失败', message: result.error });
                  }
                })();
              },
            },
            {
              label: '在线预览',
              onClick: () => {
                const target = attachMenu;
                setAttachMenu(null);
                setPreview({ filename: target.filename, size: target.size });
              },
            },
            { divider: true },
            {
              label: '复制文件名',
              onClick: () => {
                const target = attachMenu;
                setAttachMenu(null);
                void navigator.clipboard?.writeText(target.filename);
                store.pushToast({ type: 'success', title: '已复制文件名', message: target.filename });
              },
            },
          ]}
          onClose={() => setAttachMenu(null)}
        />
      )}

      {/* 重要度提示 */}
      {triage && (
        <div className="flex shrink-0 items-start gap-2 border-b border-brand-100 bg-brand-50/50 px-4 py-1.5 text-[11px] text-brand-800">
          <Icon name="shield" size={12} className="mt-[2px] text-brand-600" />
          <span>
            重要度 <b>{triage.importance === 'high' ? '高' : triage.importance === 'low' ? '低' : '中'}</b>
            ，紧急度 <b>{triage.urgency === 'high' ? '高' : triage.urgency === 'low' ? '低' : '中'}</b>：
            {triage.reason}
            {triage.labels.length > 0 && (
              <span className="ml-1">
                {triage.labels.map((label) => (
                  <span key={label} className="ml-1 rounded bg-white px-1 py-[1px] text-[10px] text-brand-700">
                    {label}
                  </span>
                ))}
              </span>
            )}
          </span>
        </div>
      )}

      {/* 会话上下文 */}
      {threadMessages.length > 1 && (
        <div className="shrink-0 border-b border-shell-lineSoft bg-[#fafbfc]">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-4 py-1.5 text-[11px] text-shell-sub hover:text-brand-600"
            onClick={() => setShowThread((value) => !value)}
          >
            <Icon name={showThread ? 'chevron-down' : 'chevron-right'} size={11} />
            本会话共 {threadMessages.length} 封邮件
            <span className="ml-auto flex items-center gap-1 text-brand-600">
              <Icon name="sparkles" size={11} />
              一键生成会话摘要
            </span>
          </button>
          {showThread && (
            <div className="max-h-[132px] overflow-y-auto border-t border-shell-lineSoft bg-white">
              {threadMessages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void store.selectMessage(item.id)}
                  className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-[11px] transition-colors duration-120 hover:bg-brand-50 ${
                    item.id === selectedMessage.id ? 'bg-brand-50/70' : ''
                  }`}
                >
                  <span className="w-[92px] shrink-0 truncate text-shell-sub">{senderName(item.from)}</span>
                  <span className="min-w-0 flex-1 truncate text-shell-text">{item.subject}</span>
                  <span className="shrink-0 tabular-nums text-shell-faint">{fullTime(item.date).slice(5, 16)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 正文 */}
      {showTranslation && translation && (
        <div className="flex shrink-0 items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-1 text-[11px] text-brand-800">
          <Icon name="translate" size={12} className="text-brand-600" />
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">
            已翻译为{translation.target}
            <span className="ml-1 text-brand-600/70">
              （{translation.engine === 'builtin' ? '内置免费引擎' : '大模型'}）
            </span>
            {translation.subject && (
              <span className="ml-2 text-shell-sub">主题：{translation.subject}</span>
            )}
          </span>
          <button
            type="button"
            className="shrink-0 whitespace-nowrap text-brand-700 hover:underline"
            onClick={() => store.setTranslationVisible(false)}
          >
            显示原文
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {showTranslation && translation ? (
          <div className="scroll-area h-full bg-white px-5 py-4">
            <div className="mx-auto max-w-[760px] text-sm leading-[1.85] text-shell-text" style={{ userSelect: 'text' }}>
              {translation.text.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index} className="mb-3 whitespace-pre-wrap">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <>
            {garbled && (
              <div className="flex flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
                <Icon name="alert" size={12} className="text-amber-600" />
                <span>正文可能有编码问题，可尝试重新解码：</span>
                {[
                  { label: '自动修复', charset: undefined },
                  { label: 'UTF-8', charset: 'utf-8' },
                  { label: 'GBK', charset: 'gb18030' },
                  { label: 'Big5', charset: 'big5' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    disabled={store.redecoding}
                    onClick={() => void store.redecodeMessage(selectedMessage.id, option.charset)}
                    className="rounded border border-amber-400/70 bg-white px-1.5 py-0.5 text-[11px] text-amber-900 transition-colors duration-120 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
                {store.redecoding && <span className="text-amber-700">正在重新解码…</span>}
              </div>
            )}
          <iframe
            key={`${selectedMessage.id}-${htmlDoc.length}`}
            title="邮件正文"
            srcDoc={htmlDoc}
            sandbox={IFRAME_SANDBOX}
            className="h-full w-full border-0 bg-white"
          />
          </>
        )}
      </div>

      {preview && selectedMessage && (
        <AttachmentPreview
          messageId={selectedMessage.id}
          filename={preview.filename}
          size={preview.size}
          onClose={() => setPreview(null)}
        />
      )}

      {/* 附件 */}
      {selectedMessage.body.attachments.length > 0 && (
        <div className="shrink-0 border-t border-shell-line bg-[#fafbfc] px-4 py-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-shell-sub">
            <Icon name="paperclip" size={11} />
            附件（{selectedMessage.body.attachments.length}）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedMessage.body.attachments.map((attachment) => (
              <button
                key={`${attachment.index}-${attachment.filename}`}
                type="button"
                onDoubleClick={() => {
                  // 双击：取消待执行的预览，直接交给系统默认程序打开
                  if (attachClickTimer.current) {
                    window.clearTimeout(attachClickTimer.current);
                    attachClickTimer.current = null;
                  }
                  setPreview(null);
                  void api.messages.attachmentOpen({
                    messageId: selectedMessage.id,
                    filename: attachment.filename,
                  });
                }}
                onClick={() => {
                  if (attachClickTimer.current) window.clearTimeout(attachClickTimer.current);
                  attachClickTimer.current = window.setTimeout(() => {
                    attachClickTimer.current = null;
                    const previewOn = store.settings?.mail?.attachmentPreview ?? true;
                    if (previewOn) {
                      setPreview({ filename: attachment.filename, size: attachment.size });
                      return;
                    }
                    void api.messages.attachmentOpen({
                      messageId: selectedMessage.id,
                      filename: attachment.filename,
                    });
                  }, 240);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (attachClickTimer.current) {
                    window.clearTimeout(attachClickTimer.current);
                    attachClickTimer.current = null;
                  }
                  setAttachMenu({
                    x: event.clientX,
                    y: event.clientY,
                    filename: attachment.filename,
                    size: attachment.size,
                  });
                }}
                className="flex items-center gap-1.5 rounded border border-shell-line bg-white px-2 py-1 text-[11px] text-shell-text transition-colors duration-120 hover:border-brand-300 hover:text-brand-600"
                title={`${attachment.filename}\n双击用系统程序打开 · 右键可另存为`}
              >
                <Icon name="document" size={12} className="text-brand-500" />
                <span className="max-w-[180px] truncate">{attachment.filename}</span>
                <span className="text-shell-faint">{fileSize(attachment.size)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 内联摘要卡片 */}
      {summary && (
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-t border-brand-100 bg-gradient-to-b from-brand-50/70 to-white px-4 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-brand-700">
            <Icon name="sparkles" size={12} />
            AI 摘要
            <button
              type="button"
              className="ml-auto text-[10px] font-normal text-shell-faint hover:text-brand-600"
              onClick={() => store.setAIOutput('message', null)}
            >
              收起
            </button>
          </div>
          <div
            className="md-body text-[12.5px]"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }}
          />
        </div>
      )}
    </div>
  );
}
/**
 * 邮件正文在 iframe 中渲染。默认启用沙箱（不给 allow-same-origin），
 * 使恶意邮件脚本无法访问应用上下文；仅在截图构建中放开，
 * 因为 Electron 的 capturePage 无法截取沙箱 iframe 的合成层。
 */
const IFRAME_SANDBOX =
  import.meta.env.VITE_SCREENSHOT === '1' ? undefined : 'allow-popups allow-popups-to-escape-sandbox';
