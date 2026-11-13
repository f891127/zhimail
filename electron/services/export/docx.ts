/**
 * 简报导出为 Word（.docx）。
 * 生成的是真正的 Office Open XML 文档：标题、段落、表格、列表均为可编辑文本，不是图片。
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { parseMarkdown, type Block } from './markdown';

const FONT = '微软雅黑';

/** 去掉行内 Markdown 标记，保留纯文本（Word 中用样式表达加粗） */
function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1（$2）');
}

/** 把含 **加粗** 的文本转换为 TextRun 数组 */
function inlineRuns(text: string, options: { size?: number; color?: string } = {}): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: stripInline(text.slice(lastIndex, match.index)),
          font: FONT,
          size: options.size,
          color: options.color,
        }),
      );
    }
    runs.push(
      new TextRun({
        text: stripInline(match[1]),
        bold: true,
        font: FONT,
        size: options.size,
        color: options.color,
      }),
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    runs.push(
      new TextRun({
        text: stripInline(text.slice(lastIndex)),
        font: FONT,
        size: options.size,
        color: options.color,
      }),
    );
  }
  return runs.length ? runs : [new TextRun({ text: stripInline(text), font: FONT, size: options.size })];
}

function cellParagraphs(text: string, bold = false): Paragraph[] {
  return [
    new Paragraph({
      children: bold
        ? [new TextRun({ text: stripInline(text), bold: true, font: FONT, size: 20, color: '123A6E' })]
        : inlineRuns(text, { size: 20 }),
      spacing: { before: 20, after: 20 },
    }),
  ];
}

function blockToDocx(block: Block): (Paragraph | Table)[] {
  switch (block.type) {
    case 'heading': {
      const level =
        block.level === 1
          ? HeadingLevel.HEADING_1
          : block.level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      return [
        new Paragraph({
          heading: level,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: stripInline(block.text),
              bold: true,
              font: FONT,
              size: block.level === 1 ? 36 : block.level === 2 ? 28 : 24,
              color: block.level === 1 ? '123A6E' : '164A8D',
            }),
          ],
        }),
      ];
    }
    case 'paragraph':
      return [
        new Paragraph({
          spacing: { after: 100, line: 320 },
          children: inlineRuns(block.text, { size: 21 }),
        }),
      ];
    case 'list':
      return block.items.map((item, index) => {
        const prefix =
          item.checked === undefined
            ? block.ordered
              ? `${index + 1}. `
              : '• '
            : item.checked
              ? '☑ '
              : '☐ ';
        return new Paragraph({
          spacing: { after: 60, line: 300 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: prefix, font: FONT, size: 21, color: item.checked ? '1F6FD0' : '1F2329' }),
            ...inlineRuns(item.text, { size: 21 }),
          ],
        });
      });
    case 'table': {
      const headerRow = new TableRow({
        tableHeader: true,
        children: block.header.map(
          (cell) =>
            new TableCell({
              shading: { fill: 'EEF5FD' },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: cellParagraphs(cell, true),
            }),
        ),
      });
      const rows = block.rows.map(
        (row) =>
          new TableRow({
            children: block.header.map(
              (_header, columnIndex) =>
                new TableCell({
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: cellParagraphs(row[columnIndex] ?? ''),
                }),
            ),
          }),
      );
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: 'D9DDE2' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D9DDE2' },
            left: { style: BorderStyle.SINGLE, size: 4, color: 'D9DDE2' },
            right: { style: BorderStyle.SINGLE, size: 4, color: 'D9DDE2' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'D9DDE2' },
            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'D9DDE2' },
          },
          rows: [headerRow, ...rows],
        }),
        new Paragraph({ text: '', spacing: { after: 80 } }),
      ];
    }
    case 'quote':
      return [
        new Paragraph({
          spacing: { after: 100 },
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'B0CDF3', space: 8 } },
          children: inlineRuns(block.text, { size: 20, color: '5F6772' }),
        }),
      ];
    case 'code':
      return [
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: block.text, font: 'Consolas', size: 19 })],
        }),
      ];
    case 'hr':
      return [new Paragraph({ text: '', border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E8EBEE', space: 1 } } })];
    default:
      return [];
  }
}

export async function buildDocxBuffer(options: {
  title: string;
  meta: string;
  markdown: string;
}): Promise<Buffer> {
  const blocks = parseMarkdown(options.markdown);
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: options.title, bold: true, font: FONT, size: 40, color: '123A6E' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1F6FD0', space: 6 } },
      children: [new TextRun({ text: options.meta, font: FONT, size: 18, color: '5F6772' })],
    }),
  ];

  for (const block of blocks) {
    children.push(...blockToDocx(block));
  }

  children.push(
    new Paragraph({
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E8EBEE', space: 6 } },
      children: [new TextRun({ text: '由智邮 ZhiYou 自动生成', font: FONT, size: 16, color: '8D959F' })],
    }),
  );

  const doc = new Document({
    creator: '智邮 ZhiYou',
    title: options.title,
    description: options.meta,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 21 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
