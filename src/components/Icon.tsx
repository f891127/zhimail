/** 内联 SVG 图标集，统一 1.6px 描边，保证在 13px 界面下的清晰度 */

import type { CSSProperties } from 'react';

export type IconName =
  | 'mail'
  | 'inbox'
  | 'send'
  | 'draft'
  | 'trash'
  | 'junk'
  | 'archive'
  | 'folder'
  | 'folder-open'
  | 'star'
  | 'star-filled'
  | 'paperclip'
  | 'search'
  | 'settings'
  | 'refresh'
  | 'compose'
  | 'reply'
  | 'reply-all'
  | 'forward'
  | 'sparkles'
  | 'chart'
  | 'checklist'
  | 'document'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'plus'
  | 'download'
  | 'check'
  | 'check-circle'
  | 'alert'
  | 'clock'
  | 'calendar'
  | 'user'
  | 'more'
  | 'external'
  | 'translate'
  | 'shield'
  | 'panel'
  | 'maximize'
  | 'minimize'
  | 'sort'
  | 'filter'
  | 'undo'
  | 'info';

const PATHS: Record<IconName, JSX.Element> = {
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M3 6.5l9 6.2 9-6.2" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 12h5l1.6 2.6h4.8L16 12h5" />
      <path d="M4.6 4.6h14.8L21.5 12v5.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V12z" />
    </>
  ),
  send: (
    <>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.4 18-4.1-7.5L3 9.4z" />
    </>
  ),
  draft: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6.5h17" />
      <path d="M9 6.5V4.2h6v2.3" />
      <path d="M5.5 6.5l1 13.3h11l1-13.3" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  junk: (
    <>
      <path d="M12 3.5l9 16.5H3z" />
      <path d="M12 9.5v5M12 17.2v.4" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M4.5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5" />
      <path d="M10 12.5h4" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  'folder-open': (
    <>
      <path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v1.5" />
      <path d="M3 9.5h18l-2.2 8.4a2 2 0 0 1-1.9 1.5H5.2a2 2 0 0 1-1.9-1.5z" />
    </>
  ),
  star: <path d="M12 3.6l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
  'star-filled': (
    <path
      d="M12 3.6l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"
      fill="currentColor"
    />
  ),
  paperclip: (
    <path d="M20.4 11.2l-8.3 8.3a5.4 5.4 0 0 1-7.6-7.6l8.3-8.3a3.6 3.6 0 1 1 5.1 5.1l-8.3 8.3a1.8 1.8 0 1 1-2.5-2.5l7.6-7.6" />
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="M20.5 20.5l-4.8-4.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 5.5v5h-5" />
      <path d="M3.5 18.5v-5h5" />
      <path d="M5.2 9.2a7.5 7.5 0 0 1 12.4-2.8l2.9 2.9" />
      <path d="M3.5 14.7l2.9 2.9a7.5 7.5 0 0 0 12.4-2.8" />
    </>
  ),
  compose: (
    <>
      <path d="M11 4.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2v-5" />
      <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.4 14.5l-3.6.9.9-3.6z" />
    </>
  ),
  reply: (
    <>
      <path d="M9 7L3.5 12 9 17" />
      <path d="M3.5 12h9a7 7 0 0 1 7 7v1" />
    </>
  ),
  'reply-all': (
    <>
      <path d="M8 7L2.5 12 8 17" />
      <path d="M13 7L7.5 12 13 17" />
      <path d="M7.5 12h6.5a6 6 0 0 1 6 6v1" />
    </>
  ),
  forward: (
    <>
      <path d="M15 7l5.5 5L15 17" />
      <path d="M20.5 12h-9a7 7 0 0 0-7 7v1" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.2l1.7 4.3 4.3 1.7-4.3 1.7L12 15.2l-1.7-4.3L6 9.2l4.3-1.7z" />
      <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      <path d="M5.5 16.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5L3.4 19.2l1.5-.6z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="7.5" y="12" width="3" height="5" />
      <rect x="12.5" y="8.5" width="3" height="8.5" />
      <rect x="17" y="10.5" width="3" height="6.5" />
    </>
  ),
  checklist: (
    <>
      <path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11" />
      <path d="M3.5 6.2l1.4 1.4 2.1-2.4" />
      <path d="M3.5 11.7l1.4 1.4 2.1-2.4" />
      <path d="M3.5 17.2l1.4 1.4 2.1-2.4" />
    </>
  ),
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'chevron-right': <path d="M9.5 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  download: (
    <>
      <path d="M12 3.5v11" />
      <path d="M7.5 10l4.5 4.5L16.5 10" />
      <path d="M4 19.5h16" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.3l2.6 2.6 5-5.4" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16.2v.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5" />
    </>
  ),
  translate: (
    <>
      <path d="M3.5 6h9M8 4v2c0 4-2 7-5 8.5" />
      <path d="M5.5 11c1.2 2.4 3 4.1 5.5 5" />
      <path d="M13 20l4-10 4 10" />
      <path d="M14.6 16.5h4.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 2.5v6c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5v-6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M14.5 4.5v15" />
    </>
  ),
  maximize: (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 15v5h-5" />
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </>
  ),
  minimize: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  sort: (
    <>
      <path d="M7 4.5v15M3.8 16.2L7 19.5l3.2-3.3" />
      <path d="M13 7h7M13 12h5M13 17h3" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.5 7.6V20l-4-2.2v-4.7z" />,
  undo: (
    <>
      <path d="M3.5 8.5h10a6 6 0 0 1 0 12h-3" />
      <path d="M7.5 4.5l-4 4 4 4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8v.3" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className = '', style, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
