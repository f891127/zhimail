/**
 * 运行日志：把主进程异常与渲染层报错写到 <dataDir>/logs/app.log，
 * 便于用户反馈「白屏 / 闪退」时定位问题（超过 2 MB 自动轮转一次）。
 */
import fs from 'node:fs';
import path from 'node:path';

let logDir: string | null = null;
let logFile: string | null = null;
const MAX_SIZE = 2 * 1024 * 1024;

export function initLogger(dataDir: string): void {
  try {
    logDir = path.join(dataDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    logFile = path.join(logDir, 'app.log');
    const stat = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
    if (stat && stat.size > MAX_SIZE) {
      fs.renameSync(logFile, path.join(logDir, 'app.prev.log'));
    }
  } catch {
    logDir = null;
    logFile = null;
  }
}

export function getLogPath(): string {
  return logFile ?? '';
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function logLine(scope: string, message: string): void {
  const line = `[${stamp()}] [${scope}] ${message}\n`;
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {
    /* 日志写不进去不能影响主流程 */
  }
}

/** 渲染层上报的异常 */
export function logRendererError(payload: { message: string; stack?: string; source?: string }): void {
  const detail = [payload.message, payload.stack, payload.source ? `来源：${payload.source}` : '']
    .filter(Boolean)
    .join('\n    ');
  logLine('renderer-error', detail);
}
