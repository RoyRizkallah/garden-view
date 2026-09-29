type IconProps = {
  size?: number;
  className?: string;
};

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconCheck({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function IconDocument({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  );
}

export function IconHome({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function IconWallet({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v2" />
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M15 13.5h3M14.5 13.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z" />
    </svg>
  );
}

export function IconChart({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconBallot({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8.5 12 2.3 2.3L16 9" />
    </svg>
  );
}

export function IconCalendar({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14h2M8 17.5h2M14 14h2M14 17.5h2" />
    </svg>
  );
}

export function IconClipboard({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4Z" />
      <path d="M8.5 12h7M8.5 16h7" />
    </svg>
  );
}

export function IconSparkle({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

export function IconWrench({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2Z" />
    </svg>
  );
}

export function IconHammer({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m14 7 3.5-3.5a2 2 0 0 1 2.8 2.8L17 10" />
      <path d="m3 21 7.5-7.5" />
      <path d="M12.5 8.5 6 15l3 3 6.5-6.5-3-3Z" />
    </svg>
  );
}

export function IconLogout({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function IconUsers({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M16 8.2a3.2 3.2 0 1 1 0 6.4M18.5 20c0-2.5-1.8-4.6-4-5.3" />
    </svg>
  );
}

export function IconLeaf({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 19c8 1 14-5 14-14C10 5 4 11 5 19Z" />
      <path d="M5 19c3-6 6-9 12-12" />
    </svg>
  );
}

export function IconDumbbell({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 9v6M2 10.5v3M20 9v6M22 10.5v3" />
      <path d="M7 9v6M17 9v6" />
      <path d="M7 12h10" />
    </svg>
  );
}

export function IconSofa({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
      <path d="M3 12h18v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z" />
      <path d="M5 17v2M19 17v2" />
    </svg>
  );
}

export function IconCar({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 16V11l2-5h12l2 5v5" />
      <path d="M4 16h16v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2Z" />
      <circle cx="7.5" cy="16" r="1.2" />
      <circle cx="16.5" cy="16" r="1.2" />
    </svg>
  );
}

export function IconShield({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconBuilding({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01" />
      <path d="M10 21v-4h4v4" />
    </svg>
  );
}

export function IconElevator({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="m10 9 2-2 2 2M10 15l2 2 2-2" />
    </svg>
  );
}

export function IconConcierge({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 19h18" />
      <path d="M4 19a8 8 0 0 1 16 0" />
      <path d="M12 8v3" />
      <circle cx="12" cy="6" r="1.4" />
    </svg>
  );
}

export function IconMapPin({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  );
}

export function IconMail({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 6.5 8 6 8-6" />
    </svg>
  );
}

export function IconPhone({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 3h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2L20 14v3a2 2 0 0 1-2 2A15 15 0 0 1 4 5a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function IconWhatsapp({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 17.5 4 20l2.6-2.9A8 8 0 1 1 12 20a8 8 0 0 1-5-1.7Z" />
      <path d="M9 9.3c0 3 2.7 5.7 5.7 5.7.5 0 .9-.6.6-1.1l-.7-1.2c-.2-.3-.6-.4-.9-.3l-.9.4a5 5 0 0 1-2.6-2.6l.4-.9c.1-.3 0-.7-.3-.9L9.1 7.7c-.5-.3-1.1.1-1.1.6v1Z" />
    </svg>
  );
}

export function IconArrowRight({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}

export function IconExpand({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
    </svg>
  );
}

export function IconClose({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function IconChevronLeft({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconChevronRight({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconLayers({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 12l9 5 9-5" strokeDasharray="1 0" />
      <path d="M3 16l9 5 9-5" />
    </svg>
  );
}

export function IconTag({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M11.5 3H5a2 2 0 0 0-2 2v6.5a2 2 0 0 0 .6 1.4l8.5 8.5a2 2 0 0 0 2.8 0l6-6a2 2 0 0 0 0-2.8l-8.5-8.5a2 2 0 0 0-1.4-.6Z" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  );
}

export function IconImage({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m5 18 5-5.5 3.5 3.5L18 11l3 4" />
    </svg>
  );
}

export function IconClock({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconAlertCircle({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="15.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSearch({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.6-4.6" />
    </svg>
  );
}

export function IconUser({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
    </svg>
  );
}

export function IconPieChart({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v9h9a9 9 0 1 1-9-9Z" />
      <path d="M21 8.5A9 9 0 0 0 15.5 3" />
    </svg>
  );
}

export function IconLamp({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 4h10l3 7H4l3-7Z" />
      <path d="M12 11v7M9 21h6" />
    </svg>
  );
}

export function IconWaves({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 8c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
      <path d="M3 12.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
      <path d="M3 17c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
    </svg>
  );
}

export function IconSun({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function IconBox({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 8l8-4 8 4-8 4-8-4Z" />
      <path d="M4 8v8l8 4 8-4V8M12 12v8" />
    </svg>
  );
}

export function IconPlay({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" stroke="none">
      <path d="M8 5.5v13a.6.6 0 0 0 .9.5l10.3-6.5a.6.6 0 0 0 0-1L8.9 5a.6.6 0 0 0-.9.5Z" />
    </svg>
  );
}
