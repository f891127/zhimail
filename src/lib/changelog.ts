/**
 * 版本更新日志：直接读取仓库根目录的 CHANGELOG.md，
 * 保证「客户端内看到的日志」与「发布说明」永远同源。
 */
import raw from '../../CHANGELOG.md?raw';

export interface ChangelogGroup {
  title: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  groups: ChangelogGroup[];
}

const VERSION_HEADING = /^##\s*\[?v?([0-9][^\]\s]*)\]?(?:\s*[-—]\s*(\S+))?\s*$/;

export function parseChangelog(markdown: string = raw): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let group: ChangelogGroup | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = VERSION_HEADING.exec(line.trim());
    if (heading) {
      current = { version: heading[1], date: heading[2] ?? '', groups: [] };
      group = null;
      entries.push(current);
      continue;
    }
    if (!current) continue;

    const groupHeading = /^###\s+(.+)$/.exec(line.trim());
    if (groupHeading) {
      group = { title: groupHeading[1].trim(), items: [] };
      current.groups.push(group);
      continue;
    }

    const item = /^[-*]\s+(.+)$/.exec(line.trim());
    if (item) {
      if (!group) {
        group = { title: '变更', items: [] };
        current.groups.push(group);
      }
      group.items.push(item[1].trim());
    }
  }

  return entries;
}

export const changelogEntries = parseChangelog();

export function findChangelogEntry(version?: string | null): ChangelogEntry | undefined {
  if (!version) return undefined;
  const normalized = version.replace(/^v/, '').trim();
  return (
    changelogEntries.find((entry) => entry.version === normalized) ??
    changelogEntries.find((entry) => normalized.startsWith(entry.version))
  );
}

/** 版本号比较：a 比 b 新返回 1，相同返回 0，更旧返回 -1 */
export function compareVersion(a: string, b: string): number {
  const left = a.replace(/^v/, '').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const right = b.replace(/^v/, '').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export const LAST_SEEN_VERSION_KEY = 'zhimail.lastSeenVersion';
