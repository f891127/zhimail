import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

/** 渲染层异常统一上报到主进程日志，便于定位「白屏 / 点了没反应」 */
function report(message: string, stack?: string, source?: string): void {
  try {
    void window.zhimail?.app?.reportError?.({ message, stack, source });
  } catch {
    /* 忽略 */
  }
}

window.addEventListener('error', (event) => {
  const target = event.target as HTMLElement | null;
  if (target && target !== (window as unknown as HTMLElement)) {
    // 资源加载失败（图片、iframe）不当作崩溃处理
    return;
  }
  report(event.message || '未知脚本错误', event.error?.stack, 'window.error');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: string; stack?: string } | string;
  report(
    typeof reason === 'string' ? reason : reason?.message ?? '未处理的 Promise 异常',
    typeof reason === 'string' ? undefined : reason?.stack,
    'unhandledrejection',
  );
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
