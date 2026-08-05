import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'account'
  | 'activity'
  | 'align-bottom'
  | 'align-center'
  | 'align-left'
  | 'align-middle'
  | 'align-right'
  | 'align-top'
  | 'bold'
  | 'borders'
  | 'canceled'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'clear'
  | 'clip'
  | 'close'
  | 'database'
  | 'ellipsis'
  | 'ellipsis-vertical'
  | 'file-down'
  | 'file-spreadsheet'
  | 'filter'
  | 'folder'
  | 'grid'
  | 'import'
  | 'italic'
  | 'list'
  | 'loader'
  | 'minus'
  | 'mixed'
  | 'open'
  | 'operation'
  | 'overflow'
  | 'paint-bucket'
  | 'panel'
  | 'plus'
  | 'redo'
  | 'search'
  | 'share'
  | 'sheet'
  | 'sort'
  | 'success'
  | 'table'
  | 'text'
  | 'underline'
  | 'undo'
  | 'warning'
  | 'wrap';

const fileSpreadsheetPaths = (
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M8 13h8M8 17h8M11 9v12" />
  </>
);

const ICON_PATHS: Record<IconName, ReactNode> = {
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  activity: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  'align-bottom': <><path d="M4 20h16M12 4v11M8 11l4 4 4-4" /></>,
  'align-center': <path d="M4 5h16M7 8.5h10M4 12h16M7 15.5h10M4 19h16" />,
  'align-left': <path d="M4 5h16M4 8.5h10M4 12h16M4 15.5h10M4 19h16" />,
  'align-middle': <><path d="M4 12h16M12 3v5M9 5l3 3 3-3M12 21v-5M9 19l3-3 3 3" /></>,
  'align-right': <path d="M4 5h16M10 8.5h10M4 12h16M10 15.5h10M4 19h16" />,
  'align-top': <><path d="M4 4h16M12 20V9M8 13l4-4 4 4" /></>,
  bold: <><path d="M6 4h8a4 4 0 0 1 0 8H6Z" /><path d="M6 12h9a4 4 0 0 1 0 8H6Z" /></>,
  borders: <><rect x="4" y="4" width="16" height="16" /><path d="M12 4v16M4 12h16" /></>,
  canceled: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  clear: <><path d="m7 21-4-4 10.5-10.5 4 4Z" /><path d="m11.5 8.5 4 4M7 21h12" /></>,
  clip: <><path d="M4 6h9M4 11h9M4 16h7M16 3v18" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  ellipsis: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  'ellipsis-vertical': <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  'file-down': <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 11v7m-3-3 3 3 3-3" /></>,
  'file-spreadsheet': fileSpreadsheetPaths,
  filter: <path d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3Z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  import: <><path d="M12 3v12M8 11l4 4 4-4" /><path d="M5 19h14" /></>,
  italic: <><path d="M19 4h-9M14 20H5M15 4 9 20" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  loader: <path d="M21 12a9 9 0 1 1-6.2-8.6" />,
  minus: <path d="M5 12h14" />,
  mixed: <path d="M5 12h14" />,
  open: <><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  operation: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  overflow: <><path d="M4 6h8M4 12h15M16 9l3 3-3 3M4 18h7M13 3v18" /></>,
  'paint-bucket': <><path d="m19 11-8-8-8 8 8 8Z" /><path d="m5 9 8 8M19 15s2 2.2 2 3.5a2 2 0 0 1-4 0c0-1.3 2-3.5 2-3.5" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  redo: <><path d="m15 7 5 5-5 5" /><path d="M19 12h-9a5 5 0 0 0-5 5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
  share: <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>,
  sheet: fileSpreadsheetPaths,
  sort: <><path d="M8 6h11M8 12h8M8 18h5" /><path d="M4 4v16M2 18l2 2 2-2" /></>,
  success: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 9v11" /></>,
  text: <><path d="M4 7V4h16v3M9 20h6M12 4v16" /></>,
  underline: <><path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" /></>,
  undo: <><path d="M9 7 4 12l5 5" /><path d="M5 12h9a5 5 0 0 1 5 5" /></>,
  warning: <><path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  wrap: <><path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-3M17 15l-3 3 3 3M4 18h6" /></>
};

/** Renders one decorative, dependency-free Lucide-informed SVG mark. */
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
      {...props}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
