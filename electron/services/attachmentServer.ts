/**
 * 智邮 ZhiYou —— 附件预览用的本机回环服务。
 *
 * 为什么不用 file://：应用本身是以 file:// 载入的，Chromium 认为每个 file 都是独立的
 * 不透明源，父页面嵌一个 file:// 的 PDF 会被拦掉，表现是「PDF 阅读器外壳在、页面一片灰」。
 * 自定义 scheme 同样不被内置 PDF 阅读器接受（能拿到文件但不解析）。
 * 所以退一步：在 127.0.0.1 上开一个只读的小服务，用随机端口 + 随机令牌托管附件，
 * 只有主进程知道令牌，进程退出即失效。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.txt': 'text/plain; charset=utf-8',
  '.eml': 'message/rfc822',
};

/** token -> 磁盘绝对路径 */
const tokenToPath = new Map<string, string>();
let server: http.Server | null = null;
let port = 0;
let starting: Promise<void> | null = null;

function mimeFor(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const token = url.pathname.replace(/^\//, '');
  const file = tokenToPath.get(token);
  if (!file) {
    res.writeHead(404).end('attachment not found');
    return;
  }
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    res.writeHead(410).end('attachment missing');
    return;
  }
  const headers: Record<string, string> = {
    'content-type': mimeFor(file),
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  };
  // PDF 阅读器会按范围取数据，支持 Range 才能正常翻页
  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isFinite(start) || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${size}`,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': String(size) });
  fs.createReadStream(file).pipe(res);
}

async function ensureServer(): Promise<void> {
  if (port) return;
  if (starting) return starting;
  starting = new Promise<void>((resolve, reject) => {
    server = http.createServer(handleRequest);
    server.once('error', reject);
    // 只监听回环地址，外部网络访问不到
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      port = typeof address === 'object' && address ? address.port : 0;
      resolve();
    });
  });
  return starting;
}

/** 为一个本地文件生成可访问的地址（同步返回 Promise，首次调用会启动服务） */
export async function attachmentPreviewUrl(file: string): Promise<string> {
  await ensureServer();
  const token = crypto.randomUUID();
  tokenToPath.set(token, file);
  // 预览数量有限，超过 300 个就丢掉最早的，避免长期运行内存增长
  if (tokenToPath.size > 300) {
    const oldest = tokenToPath.keys().next().value;
    if (oldest) tokenToPath.delete(oldest);
  }
  return `http://127.0.0.1:${port}/${token}`;
}

export function stopAttachmentServer(): void {
  server?.close();
  server = null;
  port = 0;
  starting = null;
  tokenToPath.clear();
}
