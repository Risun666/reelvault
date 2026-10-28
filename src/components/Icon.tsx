interface Props {
  name: IconName
  className?: string
  size?: number
}

export type IconName =
  | 'home'
  | 'compass'
  | 'chart'
  | 'gear'
  | 'lock'
  | 'unlock'
  | 'star'
  | 'starFill'
  | 'plus'
  | 'search'
  | 'close'
  | 'check'
  | 'trash'
  | 'edit'
  | 'download'
  | 'upload'
  | 'chevronLeft'
  | 'chevronRight'
  | 'film'
  | 'tv'
  | 'filter'
  | 'grid'
  | 'list'
  | 'calendar'
  | 'clock'
  | 'image'
  | 'tag'
  | 'eyeOff'
  | 'refresh'
  | 'share'

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.6 5.4-2.1 5.1-5.1 2.1 2.1-5.1Z',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5c0 .6-.06 1.18-.18 1.74l1.9 1.47-2 3.46-2.24-.9a8 8 0 0 1-1.5.87L15.6 21h-4l-.38-2.36a8 8 0 0 1-1.5-.87l-2.24.9-2-3.46 1.9-1.47A8.2 8.2 0 0 1 7 12c0-.6.06-1.18.18-1.74l-1.9-1.47 2-3.46 2.24.9a8 8 0 0 1 1.5-.87L11.6 3h4l.38 2.36c.53.22 1.03.51 1.5.87l2.24-.9 2 3.46-1.9 1.47c.12.56.18 1.14.18 1.74Z',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2h.5A1.5 1.5 0 0 1 19 11.5v8A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10Zm2 0h6V8a3 3 0 0 0-6 0Z',
  unlock: 'M7 10V8a5 5 0 0 1 9.2-2.8l-1.7 1.7A3 3 0 0 0 9 8v2h.5A1.5 1.5 0 0 1 11 11.5v8A1.5 1.5 0 0 1 9.5 21h-5A1.5 1.5 0 0 1 3 19.5v-8A1.5 1.5 0 0 1 4.5 10Zm7.1 4.3 1.4-1.4 1.4 1.4 1.4-1.4 1.1 1.1-1.4 1.4 1.4 1.4-1.1 1.1-1.4-1.4-1.4 1.4-1.1-1.1 1.4-1.4Z',
  star: 'M12 4.5 14.6 9.6l5.4.7-4 3.9 1 5.5-5-2.8-5 2.8 1-5.5-4-3.9 5.4-.7Z',
  starFill: 'M12 4.5 14.6 9.6l5.4.7-4 3.9 1 5.5-5-2.8-5 2.8 1-5.5-4-3.9 5.4-.7Z',
  plus: 'M12 5v14M5 12h14',
  search: 'M10.5 3a7.5 7.5 0 1 1-4.6 13.4l-2.3 2.3-1.4-1.4 2.3-2.3A7.5 7.5 0 0 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 13l4 4L19 7',
  trash: 'M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13h8l1-13',
  edit: 'M4 20h4l10.5-10.5-4-4L4 16v4Zm12-14 4 4 2-2-4-4Z',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 19h16',
  upload: 'M12 21V9m0 0 4 4m-4-4-4 4M4 5h16',
  chevronLeft: 'M15 5 8 12l7 7',
  chevronRight: 'M9 5l7 7-7 7',
  film: 'M3 5h18v14H3zM7 5v14m10-14v14M3 9h4m10 0h4M3 15h4m10 0h4',
  tv: 'M3 6h18v11H3zm6 15h6M12 6v15',
  filter: 'M4 6h16l-6 7v6l-4 2v-8Z',
  grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  list: 'M4 7h16M4 12h16M4 17h16',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v5m6-5v5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3.5 2',
  image: 'M4 5h16v14H4zm0 11 5-5 4 4 3-3 4 4',
  tag: 'M4 11.5 11.5 4H20v8.5L12.5 20 4 11.5ZM15.5 8.5h.01',
  eyeOff: 'M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.4 3M6.5 7.9A15.6 15.6 0 0 0 3 12s4 6 9 6a9.3 9.3 0 0 0 3.4-.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  refresh: 'M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4',
  share: 'M12 3v13m0-13 4 4m-4-4-4 4M5 15v4h14v-4'
}

const STROKE_ONLY: IconName[] = [
  'home', 'chart', 'plus', 'search', 'close', 'check', 'trash', 'edit', 'download', 'upload',
  'chevronLeft', 'chevronRight', 'film', 'tv', 'filter', 'grid', 'list', 'calendar', 'clock',
  'image', 'tag', 'eyeOff', 'refresh', 'share', 'star'
]

export default function Icon({ name, className = '', size = 22 }: Props) {
  const filled = !STROKE_ONLY.includes(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
