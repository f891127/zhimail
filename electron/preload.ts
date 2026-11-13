/** preload：通过 contextBridge 暴露受控的 API 给渲染进程 */

import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const EVENT_CHANNELS = [
  'sync:progress',
  'mail:new',
  'send:progress',
  'mail:changed',
  'mail:open',
  'ai:progress',
  'brief:generated',
  'brief:error',
  'update:status',
] as const;

const api = {
  app: {
    info: () => invoke('app/info'),
    chooseDataDir: () => invoke('app/chooseDataDir'),
    dataSize: (options?: { force?: boolean }) => invoke('app/dataSize', options),
    resetDataDir: () => invoke('app/resetDataDir'),
    relaunch: () => invoke('app/relaunch'),
    system: () => invoke('app/system'),
    setSystem: (patch: Record<string, unknown>) => invoke('app/system/set', patch),
    setDefaultMailClient: (enabled: boolean) => invoke('app/defaultMailClient/set', enabled),
  },
  accounts: {
    list: () => invoke('accounts/list'),
    save: (input: unknown) => invoke('accounts/save', input),
    remove: (id: string) => invoke('accounts/remove', id),
    test: (input: unknown) => invoke('accounts/test', input),
  },
  folders: {
    list: () => invoke('folders/list'),
    create: (payload: { accountId: string; name: string }) => invoke('folders/create', payload),
    remove: (id: string) => invoke('folders/remove', id),
  },
  messages: {
    list: (query: unknown) => invoke('messages/list', query),
    attachmentData: (payload: { messageId: string; filename: string }) =>
      invoke('messages/attachmentData', payload),
    attachmentOpen: (payload: { messageId: string; filename: string }) =>
      invoke('messages/attachmentOpen', payload),
    attachmentSave: (payload: { messageId: string; filename: string }) =>
      invoke('messages/attachmentSave', payload),
    get: (id: string) => invoke('messages/get', id),
    thread: (threadId: string) => invoke('messages/thread', threadId),
    threads: (query: unknown) => invoke('messages/threads', query),
    setFlags: (payload: { ids: string[]; flag: string; value: boolean }) =>
      invoke('messages/flags', payload),
    move: (payload: { ids: string[]; folderId: string }) => invoke('messages/move', payload),
    remove: (ids: string[]) => invoke('messages/delete', ids),
    redecode: (payload: { messageId: string; charset?: string }) => invoke('messages/redecode', payload),
    exportSource: (messageId: string) => invoke('messages/exportSource', messageId),
    importSource: (messageId: string) => invoke('messages/importSource', messageId),
    send: (draft: unknown) => invoke('messages/send', draft),
    saveDraft: (draft: unknown) => invoke('messages/saveDraft', draft),
  },
  sync: {
    start: (accountId: string) => invoke('sync/start', accountId),
    cancel: (accountId: string) => invoke('sync/cancel', accountId),
    idle: (accountId: string) => invoke('sync/idle', accountId),
  },
  search: {
    run: (query: unknown) => invoke('search/run', query),
    ai: (text: string) => invoke('search/ai', text),
  },
  ai: {
    test: (config: unknown) => invoke('ai/test', config),
    balance: (force?: boolean) => invoke('ai/balance', force),
    testBalance: () => invoke('ai/testBalance'),
    summarize: (messageId: string) => invoke('ai/summarize', messageId),
    summarizeThread: (threadId: string) => invoke('ai/thread', threadId),
    analyze: (params: unknown) => invoke('ai/analyze', params),
    replies: (messageId: string) => invoke('ai/replies', messageId),
    compose: (params: unknown) => invoke('ai/compose', params),
    translate: (payload: { messageId: string; target: '中文' | 'English' }) =>
      invoke('ai/translate', payload),
    triage: (messageId: string) => invoke('ai/triage', messageId),
    todos: (messageId: string) => invoke('ai/todos', messageId),
  },
  brief: {
    list: (groupId?: string) => invoke('brief/list', groupId),
    get: (id: string) => invoke('brief/get', id),
    generate: (params: unknown) => invoke('brief/generate', params),
    remove: (id: string) => invoke('brief/remove', id),
    runSchedule: (scheduleId: string) => invoke('brief/runSchedule', scheduleId),
    export: (payload: { id: string; format: 'md' | 'html' | 'docx' }) =>
      invoke('brief/export', payload),
  },
  todos: {
    list: () => invoke('todos/list'),
    toggle: (payload: { id: string; done: boolean }) => invoke('todos/toggle', payload),
    update: (payload: { id: string; patch: Record<string, unknown> }) =>
      invoke('todos/update', payload),
    remove: (id: string) => invoke('todos/remove', id),
    clearCompleted: () => invoke('todos/clearCompleted'),
  },
  settings: {
    get: () => invoke('settings/get'),
    update: (patch: unknown) => invoke('settings/update', patch),
  },
  demo: {
    reset: () => invoke('demo/reset'),
  },
  backup: {
    overview: () => invoke('backup/overview'),
    export: (options?: unknown) => invoke('backup/export', options),
    inspect: () => invoke('backup/inspect'),
    import: (filePath: string) => invoke('backup/import', filePath),
    autoRun: () => invoke('backup/autoRun'),
    remove: (filePath: string) => invoke('backup/remove', filePath),
    openDir: () => invoke('backup/openDir'),
  },
  system: {
    openPath: (target: string) => invoke('shell/openPath', target),
    revealFile: (target: string) => invoke('shell/revealFile', target),
    openExternal: (url: string) => invoke('shell/openExternal', url),
    pickFiles: () => invoke('dialog/pickFiles'),
  },
  update: {
    state: () => invoke('update/state'),
    check: () => invoke('update/check'),
    download: () => invoke('update/download'),
    install: () => invoke('update/install'),
    openInstaller: () => invoke('update/openInstaller'),
    openRelease: () => invoke('update/openRelease'),
  },
  on: (channel: string, handler: (payload: unknown) => void) => {
    if (!EVENT_CHANNELS.includes(channel as (typeof EVENT_CHANNELS)[number])) {
      throw new Error(`不支持的事件通道：${channel}`);
    }
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on(channel, listener as never);
    return () => ipcRenderer.removeListener(channel, listener as never);
  },
};

contextBridge.exposeInMainWorld('zhimail', api);
