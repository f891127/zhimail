/** Markdown 渲染与邮件 HTML 净化 */

import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

const MD_ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'span', 'div', 'sup', 'sub',
];

/** 渲染 AI 返回的 Markdown（已净化，链接会在外部浏览器打开） */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return '';
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: MD_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
  });
}

const MAIL_ALLOWED_TAGS = [
  ...MD_ALLOWED_TAGS,
  'img', 'figure', 'figcaption', 'small', 'b', 'i', 'u', 's', 'font', 'center',
  'caption', 'colgroup', 'col', 'tbody', 'tfoot', 'address', 'dl', 'dt', 'dd',
];

/** 净化邮件 HTML，用于 iframe srcdoc 渲染 */
export function sanitizeMailHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: MAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'width', 'height', 'style', 'align', 'valign', 'colspan', 'rowspan', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'color', 'face', 'size'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'base'],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcdoc'],
  });
}

/** 把净化后的邮件 HTML 包装为完整的 iframe 文档 */
export function buildMailDocument(html: string, options: { dark?: boolean } = {}): string {
  const safe = sanitizeMailHtml(html);
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<base target="_blank" />
<style>
  html, body { margin: 0; padding: 0; background: ${options.dark ? '#1f2329' : '#ffffff'}; }
  body {
    font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
    font-size: 14px; line-height: 1.75; color: ${options.dark ? '#e8eaed' : '#1f2329'};
    padding: 20px 24px; word-break: break-word;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 8px; }
  a { color: #1f6fd0; }
  blockquote { margin: 8px 0; padding: 6px 12px; border-left: 3px solid #d9dde2; color: #5f6772; }
  pre { background: #f5f6f7; padding: 10px; overflow: auto; border-radius: 4px; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: #c9cfd6; border-radius: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
</style></head>
<body>${safe}</body></html>`;
}

/** 纯文本邮件渲染为等宽段落 */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre style="white-space:pre-wrap;font-family:'Microsoft YaHei UI','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.75;margin:0;">${escaped}</pre>`;
}

/** 富文本编辑器内容提取为纯文本（用于 AI 与草稿预览） */
export function htmlToPlain(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
