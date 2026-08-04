import type { SVGProps } from 'react';

export type IconName =
  | 'sheet'
  | 'chevron-down'
  | 'undo'
  | 'redo'
  | 'sort'
  | 'filter'
  | 'clear'
  | 'panel'
  | 'share'
  | 'close'
  | 'search'
  | 'folder'
  | 'list'
  | 'grid'
  | 'table'
  | 'activity'
  | 'account'
  | 'plus'
  | 'import'
  | 'open';

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };
  const paths = {
    sheet: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 8h16M9 8v13M9 13h11M9 17h11" /></>,
    'chevron-down': <path d="m7 10 5 5 5-5" />,
    undo: <><path d="M9 7 4 12l5 5" /><path d="M5 12h9a5 5 0 0 1 5 5" /></>,
    redo: <><path d="m15 7 5 5-5 5" /><path d="M19 12h-9a5 5 0 0 0-5 5" /></>,
    sort: <><path d="M8 6h9M8 12h7M8 18h5" /><path d="M4 4v16m0 0-2-2m2 2 2-2" /></>,
    filter: <path d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3L4 5Z" />,
    clear: <><path d="m5 5 14 14M19 5 5 19" /></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16M18 8h-1M18 12h-1" /></>,
    share: <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    folder: <path d="M3 7.5h7l2-2h9v13H3z" />,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 9v11" /></>,
    activity: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6M12 8v4l3 2" /></>,
    account: <><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    import: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M5 19h14" /></>,
    open: <><path d="M8 16 16 8M10 8h6v6" /><path d="M19 13v6H5V5h6" /></>
  };
  return <svg {...common} {...props}>{paths[name]}</svg>;
}
