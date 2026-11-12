#!/usr/bin/env node
/**
 * 开发模式：先启动 Vite 开发服务器，端口就绪后再拉起 Electron，
 * Electron 通过 VITE_DEV_SERVER_URL 加载带热更新的界面。
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = Number(process.env.PORT || 5173);
const URL = `http://127.0.0.1:${PORT}`;

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
  env: process.env,
});
children.push(vite);
vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

async function waitForServer(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL, { method: 'GET' });
      if (response.ok) return true;
    } catch {
      /* 服务器尚未就绪 */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

const ready = await waitForServer();
if (!ready) {
  console.error('[dev] Vite 开发服务器启动超时');
  shutdown(1);
} else {
  console.log(`[dev] Vite 已就绪：${URL}，正在启动 Electron…`);
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: URL, NODE_ENV: 'development' },
  });
  children.push(electron);
  electron.on('exit', (code) => shutdown(code ?? 0));
}
