const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const PlusIcon = (p) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const MenuIcon = (p) => (
  <svg {...base} {...p}><path d="M4 7h16M4 12h10M4 17h16" /></svg>
);
export const CloseIcon = (p) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const ArrowUpIcon = (p) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
);
export const StopIcon = (p) => (
  <svg {...base} {...p}><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" /></svg>
);
export const TrashIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
);
export const PencilIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
);
export const CopyIcon = (p) => (
  <svg {...base} width={15} height={15} {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>
);
export const CheckIcon = (p) => (
  <svg {...base} width={15} height={15} {...p}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);
export const RetryIcon = (p) => (
  <svg {...base} width={15} height={15} {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>
);
export const LogoutIcon = (p) => (
  <svg {...base} width={16} height={16} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></svg>
);

export function Drop({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="dropGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--alkaline)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path d="M256 40c-74 102-150 182-150 274a150 150 0 0 0 300 0c0-92-76-172-150-274z" fill="url(#dropGrad)" />
    </svg>
  );
}
