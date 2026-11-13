/** 待办事项面板：统计、筛选、勾选完成、跳转来源邮件 */

import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from '@/components/Icon';
import { dueLabel, fullTime, PRIORITY_LABEL } from '@/lib/format';

const FILTERS = [
  { id: 'pending', label: '待处理' },
  { id: 'today', label: '今天到期' },
  { id: 'overdue', label: '已逾期' },
  { id: 'done', label: '已完成' },
  { id: 'all', label: '全部' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export function TodoPanel() {
  const store = useAppStore();
  const { todos, todoStats } = store;
  const [filter, setFilter] = useState<FilterId>('pending');

  const filtered = useMemo(() => {
    const now = Date.now();
    return todos.filter((todo) => {
      switch (filter) {
        case 'pending':
          return !todo.done;
        case 'done':
          return todo.done;
        case 'today': {
          if (!todo.due || todo.done) return false;
          const due = Date.parse(todo.due);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return due >= today.getTime() && due < today.getTime() + 86400000;
        }
        case 'overdue':
          return !todo.done && Boolean(todo.due) && Date.parse(todo.due as string) < now;
        default:
          return true;
      }
    });
  }, [todos, filter]);

  const openSource = (todoId: string, messageId?: string) => {
    if (!messageId) {
      store.pushToast({
        type: 'info',
        title: '这条待办没有关联的来源邮件',
        message: '较早生成的待办未记录来源，可在简报中查看对应内容',
      });
      return;
    }
    void store.openMessageById(messageId).then((ok) => {
      if (!ok) store.pushToast({ type: 'error', title: '打不开来源邮件', message: messageId });
    });
    void todoId;
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-shell-line px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Icon name="checklist" size={16} className="text-emerald-600" />
          <h1 className="text-base font-semibold text-shell-text">待办事项</h1>
          <span className="text-[11px] text-shell-faint">
            由 AI 从邮件汇总、简报与单封邮件中提取
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="ghost-btn" onClick={() => void store.clearCompletedTodos()}>
              <Icon name="trash" size={12} /> 清理已完成
            </button>
            <button type="button" className="ghost-btn" onClick={() => store.setAIPanel(true, 'analysis')}>
              <Icon name="sparkles" size={12} className="text-brand-500" /> 从邮件提取
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex gap-2">
          <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
            <div className="text-[15px] font-semibold tabular-nums text-shell-text">{todoStats.pending}</div>
            <div className="text-[10px] text-shell-faint">待处理</div>
          </div>
          <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
            <div className="text-[15px] font-semibold tabular-nums text-accent-600">{todoStats.high}</div>
            <div className="text-[10px] text-shell-faint">高优先级</div>
          </div>
          <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
            <div className="text-[15px] font-semibold tabular-nums text-rose-600">{todoStats.overdue}</div>
            <div className="text-[10px] text-shell-faint">已逾期</div>
          </div>
          <div className="flex-1 rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-1.5">
            <div className="text-[15px] font-semibold tabular-nums text-emerald-600">{todoStats.done}</div>
            <div className="text-[10px] text-shell-faint">已完成</div>
          </div>
        </div>

        <div className="mt-2 flex gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded px-2 py-[3px] text-[11px] transition-colors duration-120 ${
                filter === item.id ? 'bg-brand-500 text-white' : 'text-shell-sub hover:bg-black/[0.05]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area flex-1">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-shell-faint">
            <Icon name="check-circle" size={30} className="text-emerald-500/40" strokeWidth={1.2} />
            <p className="text-xs">没有符合条件的待办事项</p>
            <p className="text-[11px]">可在「AI 助手 → 汇总分析」生成，或在阅读窗格点击「提取待办」</p>
          </div>
        )}

        {filtered.map((todo) => {
          const due = dueLabel(todo.due);
          return (
            <div
              key={todo.id}
              className={`group flex items-start gap-2.5 border-b border-shell-lineSoft px-4 py-2.5 transition-colors duration-120 hover:bg-brand-50/40 ${
                todo.done ? 'bg-[#fcfcfd]' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={todo.done}
                onChange={(event) => void store.toggleTodo(todo.id, event.target.checked)}
                className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-brand-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2 pr-2">
                  <span
                    className={`min-w-0 text-xs leading-5 ${
                      todo.done ? 'text-shell-faint line-through' : 'font-medium text-shell-text'
                    }`}
                  >
                    {todo.title}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1 py-[1px] text-[10px] ${
                      todo.priority === 'high'
                        ? 'bg-rose-50 text-rose-600'
                        : todo.priority === 'low'
                          ? 'bg-shell-chrome text-shell-sub'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {PRIORITY_LABEL[todo.priority]}
                  </span>
                  <span className="flex-1" />
                </div>
                {todo.detail && (
                  <p className="mt-0.5 text-[11px] leading-4 text-shell-sub">{todo.detail}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-shell-faint">
                  <span
                    className={
                      due.tone === 'overdue'
                        ? 'text-rose-600'
                        : due.tone === 'soon'
                          ? 'text-amber-600'
                          : ''
                    }
                  >
                    <Icon name="clock" size={10} className="mr-0.5 inline" />
                    {due.text}
                  </span>
                  {todo.sourceSubject && (
                    <button
                      type="button"
                      className="flex max-w-[320px] items-center gap-0.5 truncate text-brand-600 hover:underline"
                      onClick={() => openSource(todo.id, todo.sourceMessageId)}
                      title={todo.sourceSubject}
                    >
                      <Icon name="mail" size={10} />
                      来源：{todo.sourceSubject}
                    </button>
                  )}
                  {todo.createdAt > 0 && <span>创建于 {fullTime(todo.createdAt)}</span>}
                </div>
              </div>
              <button
                type="button"
                className="hidden shrink-0 rounded p-1 text-shell-faint hover:bg-black/5 hover:text-accent-600 group-hover:block"
                onClick={() => void store.removeTodo(todo.id)}
                title="删除待办"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
