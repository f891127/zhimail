/** 待办事项：从 AI 抽取结果生成持久化条目，支持完成、删除与来源跳转 */

import crypto from 'node:crypto';
import { store } from './store';
import type { TodoDraft, TodoItem } from './types';

export function createTodoItems(
  drafts: TodoDraft[],
  context: { briefId?: string; messageId?: string; sourceSubject?: string; sourceFrom?: string; folderId?: string } = {},
): TodoItem[] {
  const now = Date.now();
  const items: TodoItem[] = drafts
    .filter((draft) => draft.title?.trim())
    .map((draft) => ({
      id: `todo-${now}-${crypto.randomBytes(4).toString('hex')}`,
      title: draft.title.trim().slice(0, 160),
      detail: draft.detail?.trim().slice(0, 600),
      due: draft.due ?? null,
      priority: draft.priority ?? 'medium',
      done: false,
      createdAt: now,
      briefId: context.briefId,
      sourceMessageId: draft.sourceMessageId ?? context.messageId,
      sourceSubject: draft.sourceSubject ?? context.sourceSubject,
      sourceFrom: draft.sourceFrom ?? context.sourceFrom,
      sourceFolderId: context.folderId,
    }));
  if (items.length) store.upsertTodos(items);
  return items;
}

export function listTodos(): TodoItem[] {
  return store.listTodos();
}

export function toggleTodo(id: string, done: boolean): TodoItem[] {
  const todo = store.listTodos().find((item) => item.id === id);
  if (todo) {
    store.upsertTodos([{ ...todo, done, doneAt: done ? Date.now() : undefined }]);
  }
  return store.listTodos();
}

export function updateTodo(id: string, patch: Partial<TodoItem>): TodoItem[] {
  const todo = store.listTodos().find((item) => item.id === id);
  if (todo) store.upsertTodos([{ ...todo, ...patch, id }]);
  return store.listTodos();
}

export function removeTodo(id: string): TodoItem[] {
  store.removeTodo(id);
  return store.listTodos();
}

export function clearCompleted(): TodoItem[] {
  for (const todo of store.listTodos()) {
    if (todo.done) store.removeTodo(todo.id);
  }
  return store.listTodos();
}

export function todoStats() {
  const todos = store.listTodos();
  const pending = todos.filter((todo) => !todo.done);
  const overdue = pending.filter((todo) => todo.due && Date.parse(todo.due) < Date.now());
  return {
    total: todos.length,
    pending: pending.length,
    done: todos.length - pending.length,
    overdue: overdue.length,
    high: pending.filter((todo) => todo.priority === 'high').length,
  };
}
