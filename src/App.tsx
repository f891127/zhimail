/** 知邮 ZhiMail —— 应用外壳：菜单栏 + 工具栏 + 三栏主体 + AI 抽屉 + 状态栏 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { MenuBar } from '@/layout/MenuBar';
import { ToolBar } from '@/layout/ToolBar';
import { FolderTree } from '@/layout/FolderTree';
import { MessageList } from '@/layout/MessageList';
import { ReadingPane } from '@/layout/ReadingPane';
import { StatusBar } from '@/layout/StatusBar';
import { AIAssistantPanel } from '@/features/ai/AIAssistantPanel';
import { BriefCenter } from '@/features/brief/BriefCenter';
import { TodoPanel } from '@/features/todos/TodoPanel';
import { ComposeWindow } from '@/features/compose/ComposeWindow';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { ChangelogDialog } from '@/features/changelog/ChangelogDialog';
import { LAST_SEEN_VERSION_KEY } from '@/lib/changelog';
import { ToastHost } from '@/components/ToastHost';
import { UpdateInstallingOverlay } from '@/components/UpdateInstallingOverlay';
import { UpdateDialog } from '@/components/UpdateDialog';
import { applySkin } from '@/lib/skin';

function Splitter({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const delta = event.clientX - lastX.current;
      lastX.current = event.clientX;
      onDrag(delta);
    };
    const handleUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onDrag]);

  return (
    <div
      className="group relative w-px shrink-0 cursor-col-resize bg-shell-line"
      onMouseDown={(event) => {
        dragging.current = true;
        lastX.current = event.clientX;
        document.body.classList.add('resizing');
      }}
    >
      <div className="absolute -left-[3px] top-0 h-full w-[7px] transition-colors duration-120 group-hover:bg-brand-300/50" />
    </div>
  );
}

export default function App() {
  // 皮肤：设置变化时立即应用（写入 <html data-skin>）
  const skinSetting = useAppStore((state) => state.settings?.ui?.skin);
  useEffect(() => {
    applySkin(skinSetting);
  }, [skinSetting]);

  const store = useAppStore();
  const { ready, view, settings, aiPanelOpen, aiPanelMaximized, init } = store;
  const [folderWidth, setFolderWidth] = useState(212);
  const [listWidth, setListWidth] = useState(424);

  useEffect(() => {
    void init();
  }, [init]);

  // 版本更新日志：版本号变化时首次启动自动展示本次更新内容
  useEffect(() => {
    if (!ready) return;
    const version = store.info?.version;
    if (!version) return;
    let lastSeen: string | null = null;
    try {
      lastSeen = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
    } catch {
      lastSeen = null;
    }
    if (lastSeen === version) return;
    const isFirstRun = lastSeen === null;
    try {
      window.localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
    } catch {
      /* 忽略存储异常 */
    }
    // 首次安装不弹窗，仅在版本发生变化时提示更新内容
    if (!isFirstRun) store.openChangelog({ auto: true, version });
  }, [ready, store, store.info?.version]);

  const focusSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>('input[placeholder^="搜索邮件"]');
    input?.focus();
    input?.select();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        store.openCompose();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        store.setAIPanel(!aiPanelOpen, 'analysis');
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        store.replyToMessage('reply');
        return;
      }
      if (event.key === 'F5') {
        event.preventDefault();
        void store.syncNow();
        return;
      }
      if (event.key === 'Escape') {
        if (store.changelogOpen) store.closeChangelog();
        else if (store.compose.open) store.closeCompose();
        else if (store.settingsOpen) store.closeSettings();
        else if (aiPanelOpen) store.setAIPanel(false);
        return;
      }
      if (typing) return;

      if (event.key === 'Delete' && store.selectedMessageId) {
        event.preventDefault();
        void store.deleteMessages([store.selectedMessageId]);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!store.messages.length) return;
        event.preventDefault();
        const index = store.messages.findIndex((message) => message.id === store.selectedMessageId);
        const nextIndex =
          event.key === 'ArrowDown'
            ? Math.min(store.messages.length - 1, index < 0 ? 0 : index + 1)
            : Math.max(0, index <= 0 ? 0 : index - 1);
        const next = store.messages[nextIndex];
        if (next) void store.selectMessage(next.id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [aiPanelOpen, focusSearch, store]);

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-shell-bg">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-card">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
            <path d="M3 6.5l9 6.2 9-6.2" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-shell-text">知邮 ZhiMail</div>
        <div className="text-xs text-shell-faint">正在加载邮箱数据…</div>
      </div>
    );
  }

  const readingPane = settings?.ui.readingPane ?? true;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-shell-bg">
      <MenuBar />
      <ToolBar />

      <div className="flex min-h-0 flex-1">
        {/* AI 助手最大化时，其余区域暂时隐藏，只保留 AI 面板 */}
        {!aiPanelMaximized && (
          <>
            <div
              className="shrink-0 overflow-hidden border-r border-shell-line shadow-[inset_-1px_0_0_rgba(255,255,255,0.6)]"
              style={{ width: folderWidth }}
            >
              <FolderTree />
            </div>
            <Splitter
              onDrag={(delta) => setFolderWidth((width) => Math.min(320, Math.max(170, width + delta)))}
            />

            <div className="relative flex min-w-0 flex-1">
              {view === 'mail' && (
                <>
                  <div
                    className="shrink-0 overflow-hidden border-r border-shell-line"
                    style={{ width: readingPane ? listWidth : undefined }}
                  >
                    <MessageList />
                  </div>
                  {readingPane && (
                    <>
                      <Splitter
                        onDrag={(delta) => setListWidth((width) => Math.min(560, Math.max(260, width + delta)))}
                      />
                      <div className="min-w-0 flex-1 bg-shell-bg">
                        <ReadingPane />
                      </div>
                    </>
                  )}
                </>
              )}
              {view === 'briefs' && <BriefCenter />}
              {view === 'todos' && <TodoPanel />}
            </div>
          </>
        )}

        <AIAssistantPanel />
      </div>

      <StatusBar />

      <UpdateDialog />
      <UpdateInstallingOverlay />
      <ComposeWindow />
      <SettingsDialog />
      <ChangelogDialog />
      <ToastHost />
    </div>
  );
}
