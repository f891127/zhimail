/**
 * 错误边界：渲染期异常时不再整窗白屏，给出可恢复的提示并上报日志。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
  reported: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '', reported: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = `${error.stack ?? ''}\n组件栈：${info.componentStack ?? ''}`.slice(0, 8000);
    this.setState({ info: stack });
    // 上报到主进程写日志，用户反馈白屏时可直接查 logs/app.log
    try {
      void window.zhimail?.app?.reportError?.({ message: error.message, stack, source: 'react-boundary' });
    } catch {
      /* 忽略上报失败 */
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center bg-shell-bg p-6">
        <div className="w-[520px] rounded-lg border border-shell-line bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-shell-text">界面出现了一点问题</div>
          <p className="mt-2 text-xs leading-5 text-shell-sub">
            已把错误信息写入日志（设置 → 数据与备份 可查看日志位置）。点击下面的按钮即可恢复界面，邮件数据不会丢失。
          </p>
          <pre className="mt-3 max-h-[180px] overflow-auto rounded bg-[#fafbfc] p-2 text-[11px] leading-4 text-rose-700">
            {error.message}
          </pre>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                this.setState({ error: null, info: '', reported: false });
                window.location.reload();
              }}
            >
              重新加载界面
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => this.setState({ error: null, info: '', reported: false })}
            >
              返回并继续
            </button>
            <button
              type="button"
              className="ghost-btn ml-auto"
              onClick={() => void navigator.clipboard?.writeText(`${error.message}\n${this.state.info}`)}
            >
              复制错误信息
            </button>
          </div>
        </div>
      </div>
    );
  }
}
