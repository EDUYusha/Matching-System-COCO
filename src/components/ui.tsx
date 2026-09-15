'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LevelRef } from '@/lib';

/**
 * The small pieces every screen reuses, on the light theme.
 *
 * Where v2 leaned on a dark ground to separate surfaces, this build separates
 * them with a hairline and a soft shadow instead — the card class in
 * globals.css. Text sits at ink-700/800 on paper, and the gold is used for
 * emphasis rather than as a background wash, so it keeps its weight.
 */

export function Spinner({ className }: { className?: string }): ReactNode {
  return (
    <span
      className={clsx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      role="status"
      aria-label="読み込み中"
    />
  );
}

export function PageLoading(): ReactNode {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-ink-300">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }): ReactNode {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm text-ink-500">{title}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }): ReactNode {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm text-red-600">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-secondary mt-3" onClick={onRetry}>
          もう一度試す
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: string;
}): ReactNode {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-ink-200/70 bg-paper-100/90 px-4 py-3 backdrop-blur">
      {back ? (
        <Link
          href={back}
          className="-ml-1 rounded-lg px-2 py-1 text-lg leading-none text-ink-500 no-underline hover:bg-ink-100"
          aria-label="戻る"
        >
          ‹
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-ink-900">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** The level chip, coloured from CastLevel#color / CustomerLevel#color. */
export function LevelBadge({ level }: { level: LevelRef | null }): ReactNode {
  if (!level) return null;
  const color = level.color?.startsWith('#') ? level.color : `#${level.color ?? 'e6b324'}`;
  return (
    <span
      className="badge"
      // the stored colours were picked for a dark ground, so on paper they get a
      // tinted pill with a full-strength border and darkened text
      style={{ backgroundColor: `${color}1f`, color: shade(color), border: `1px solid ${color}80` }}
    >
      {level.name}
    </span>
  );
}

/** Darkens an arbitrary stored colour enough to read as text on white. */
function shade(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  // perceived luminance; only darken what is too light to read
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance < 0.55) return hex;
  const factor = 0.55 / luminance;
  return `#${[r, g, b].map((c) => Math.round(c * factor).toString(16).padStart(2, '0')).join('')}`;
}

/** The fallback `displayProfilePicUrl` uses; served from /public/system. */
export const NO_IMAGE = '/system/noimage.png';

export function Avatar({
  src,
  alt,
  size = 'md',
  online,
}: {
  src?: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
}): ReactNode {
  const dimension = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16', xl: 'h-24 w-24' }[size];
  return (
    <span className="relative inline-block shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src?.trim() ? src : NO_IMAGE}
        alt={alt}
        loading="lazy"
        // an upload that has gone missing should degrade to the placeholder
        // rather than to the browser's broken-image glyph
        onError={(event) => {
          const image = event.currentTarget;
          if (!image.src.endsWith(NO_IMAGE)) image.src = NO_IMAGE;
        }}
        className={clsx(dimension, 'rounded-full border border-ink-200 bg-ink-50 object-cover')}
      />
      {online ? (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
      ) : null}
    </span>
  );
}

export function Counter({ count, className }: { count: number; className?: string }): ReactNode {
  if (count <= 0) return null;
  return (
    <span
      className={clsx(
        'inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string[];
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink-400">{hint}</span> : null}
      {error?.length ? <span className="mt-1 block text-[11px] text-red-600">{error.join(' / ')}</span> : null}
    </label>
  );
}

/**
 * Renders server-authored HTML. The API sanitises every one of these (system
 * messages, sticker bubbles, rich-text profile attributes) with the same
 * allow-list the Rails scrubber used, so this is the one place that trusts it.
 */
export function RichText({ html, className }: { html: string; className?: string }): ReactNode {
  return <div className={clsx('system-message', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ value: T; label: string; count?: number }>;
  active: T;
  onChange: (value: T) => void;
}): ReactNode {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-200/70 bg-white px-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={clsx(
            'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-bold transition',
            active === tab.value
              ? 'border-gold-500 text-gold-700'
              : 'border-transparent text-ink-400 hover:text-ink-700',
          )}
        >
          {tab.label}
          {tab.count ? <Counter count={tab.count} /> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}): ReactNode {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="max-h-[85vh] w-full max-w-app overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-200/70 bg-white px-4 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-ink-200/70 bg-white p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}): ReactNode {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-2 py-5">
      <button
        type="button"
        className="btn-secondary px-3 py-1.5"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        &lt;
      </button>
      <span className="text-xs text-ink-500">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        className="btn-secondary px-3 py-1.5"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        &gt;
      </button>
    </nav>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return <div className={clsx('card', className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }): ReactNode {
  return (
    <div className="flex items-end justify-between px-4 pb-2 pt-5">
      <h2 className="text-sm font-bold text-ink-900">{children}</h2>
      {action}
    </div>
  );
}
