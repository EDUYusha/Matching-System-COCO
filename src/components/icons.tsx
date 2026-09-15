import type { ReactNode } from 'react';

/**
 * Outline icons for the tab bar, headers and the chat composer.
 *
 * They are drawn on a 24px grid in currentColor, so a parent's text colour
 * sets them and a heavier `strokeWidth` marks the active tab. Emoji rendered
 * differently on every platform; these do not.
 */

interface IconProps {
  className?: string;
  strokeWidth?: number;
}

function Svg({ className, strokeWidth = 1.8, children }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-6 w-6'}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M12 4.5c-4.97 0-9 3.02-9 6.75 0 2.2 1.4 4.15 3.57 5.38L6 20l3.8-2.08c.7.1 1.44.16 2.2.16 4.97 0 9-3.02 9-6.83S16.97 4.5 12 4.5z" />
    </Svg>
  );
}

export function PostIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </Svg>
  );
}

export function PersonIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-3.9 3.36-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="m15 5-7 7 7 7" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Svg>
  );
}

export function ImageIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="m20.5 15.5-4.5-4.5-8.5 8.5" />
    </Svg>
  );
}

export function GiftIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <rect x="3.5" y="8" width="17" height="4.5" rx="1" />
      <path d="M5.5 12.5V20h13v-7.5M12 8v12" />
      <path d="M12 8c-1-2.8-3.6-4.2-4.8-3-1.1 1.1.2 3 4.8 3zm0 0c1-2.8 3.6-4.2 4.8-3 1.1 1.1-.2 3-4.8 3z" />
    </Svg>
  );
}

export function SendIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M4 11.5 20 4l-6.5 16-2.8-6.2z" />
      <path d="M10.7 13.8 20 4" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function MailIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </Svg>
  );
}

export function BadgeCheckIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <circle cx="12" cy="9" r="5.5" />
      <path d="m9.8 9 1.5 1.5 2.9-3" />
      <path d="m8.6 13.9-1.6 6.6 5-2.5 5 2.5-1.6-6.6" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.3c2 .8 3.5 2.6 3.5 5.2" />
    </Svg>
  );
}

export function ReceiptIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M6.5 3.5h11v17l-2.75-1.6-2.75 1.6-2.75-1.6-2.75 1.6z" />
      <path d="M9.5 8.5h5M9.5 12h5" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function SlidersIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  );
}

export function ShieldCheckIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.9 7 9 4.1-1.1 7-4.7 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </Svg>
  );
}

export function BlockIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function HeadsetIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="16.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M18.5 19c0 1.4-1.8 2-4 2H13" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function MapPinIcon(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}
