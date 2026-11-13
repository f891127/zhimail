/**
 * 轻量 Markdown 解析器：把 AI 输出的 Markdown 解析为结构化块，
 * 供 HTML 导出与 Word（docx）导出复用，避免引入额外依赖。
 */

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: { text: string; checked?: boolean }[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'hr' };

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    // 表格：当前行含 | 且下一行是分隔行
    if (trimmed.includes('|') && /^\|?[\s:-]*-{2,}[\s:|-]*$/.test(lines[index + 1]?.trim() ?? '')) {
      const header = splitRow(trimmed);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quote.join(' ') });
      continue;
    }

    const bullet = trimmed.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /^\d/.test(bullet[1]);
      const items: { text: string; checked?: boolean }[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = current.match(/^([-*+]|\d+[.)])\s+(.*)$/);
        if (!match) break;
        let text = match[2].trim();
        let checked: boolean | undefined;
        const checkbox = text.match(/^\[( |x|X)\]\s*(.*)$/);
        if (checkbox) {
          checked = checkbox[1].toLowerCase() === 'x';
          text = checkbox[2];
        }
        items.push({ text, checked });
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // 普通段落：合并到空行为止
    const paragraph: string[] = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (
        !next ||
        /^(#{1,6})\s/.test(next) ||
        /^([-*+]|\d+[.)])\s/.test(next) ||
        /^```/.test(next) ||
        /^>\s?/.test(next)
      ) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 行内格式：粗体、斜体、行内代码、链接 */
export function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

export function renderBlocksHtml(blocks: Block[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.push(`<h${block.level}>${renderInline(block.text)}</h${block.level}>`);
        break;
      case 'paragraph':
        out.push(`<p>${renderInline(block.text)}</p>`);
        break;
      case 'list':
        out.push(
          `<${block.ordered ? 'ol' : 'ul'}>${block.items
            .map((item) =>
              item.checked === undefined
                ? `<li>${renderInline(item.text)}</li>`
                : `<li class="task"><span class="box">${item.checked ? '☑' : '☐'}</span>${renderInline(
                    item.text,
                  )}</li>`,
            )
            .join('')}</${block.ordered ? 'ol' : 'ul'}>`,
        );
        break;
      case 'table':
        out.push(
          `<table><thead><tr>${block.header
            .map((cell) => `<th>${renderInline(cell)}</th>`)
            .join('')}</tr></thead><tbody>${block.rows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody></table>`,
        );
        break;
      case 'quote':
        out.push(`<blockquote>${renderInline(block.text)}</blockquote>`);
        break;
      case 'code':
        out.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`);
        break;
      case 'hr':
        out.push('<hr />');
        break;
      default:
        break;
    }
  }
  return out.join('\n');
}

/** 生成完整 HTML 文档（用于导出 .html） */
export function renderHtmlDocument(title: string, markdown: string, meta: string): string {
  const body = renderBlocksHtml(parseMarkdown(markdown));
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 40px 56px; background: #ffffff; color: #1f2329;
    font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
    font-size: 14px; line-height: 1.75; }
  .doc-head { border-bottom: 2px solid #1f6fd0; padding-bottom: 14px; margin-bottom: 24px; }
  .doc-head h1 { font-size: 22px; margin: 0 0 6px; color: #123a6e; }
  .doc-head .meta { color: #5f6772; font-size: 12px; }
  h2 { font-size: 17px; margin: 26px 0 10px; color: #164a8d; border-left: 3px solid #1f6fd0; padding-left: 10px; }
  h3 { font-size: 15px; margin: 20px 0 8px; color: #1f2329; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 4px 0; }
  li.task { list-style: none; margin-left: -18px; }
  li.task .box { color: #1f6fd0; margin-right: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
  th, td { border: 1px solid #d9dde2; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #eef5fd; color: #123a6e; font-weight: 600; }
  tr:nth-child(even) td { background: #fafbfc; }
  blockquote { margin: 10px 0; padding: 8px 14px; background: #f5f6f7; border-left: 3px solid #b0cdf3; color: #5f6772; }
  code { background: #f2f4f6; padding: 1px 5px; border-radius: 3px; font-family: Consolas, monospace; font-size: 12.5px; }
  pre { background: #f2f4f6; padding: 12px; border-radius: 4px; overflow: auto; }
  hr { border: none; border-top: 1px solid #e8ebee; margin: 20px 0; }
  .foot { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e8ebee; color: #8d959f; font-size: 12px; }
</style>
</head>
<body>
  <div class="doc-head">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(meta)}</div>
  </div>
  ${body}
  <div class="foot">由智邮 ZhiYou 自动生成</div>
</body>
</html>`;
}
