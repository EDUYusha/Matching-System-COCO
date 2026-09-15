'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LevelRef } from '@/lib';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@/components/icons';

/**
 * The small pieces every screen reuses, in the LINE-style theme.
 *
 * Surfaces are white and flat, separated by hairlines rather than shadows.
 * Text sits at ink-800/900, secondary text at ink-500, and the green is kept
 * for actions and unread marks so it stays meaningful.
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
    <div className="px-6 py-16 text-center">
      <p className="text-sm font-bold text-ink-600">{title}</p>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{hint}</p> : null}
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

/**
 * The screen header, in LINE's two forms: a tab's root screen puts a large
 * title on the left, and a pushed screen centres its title between a back
 * chevron and its action. The `chat` tone blends the header into the talk
 * room's wallpaper.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  back,
  tone = 'default',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: string;
  tone?: 'default' | 'chat';
}): ReactNode {
  const surface = tone === 'chat' ? 'bg-chat-wall/95' : 'bg-white/95';

  if (!back) {
    return (
      <header className={clsx('sticky top-0 z-20 flex min-h-14 items-center gap-2 px-4 py-2 backdrop-blur', surface)}>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-ink-900">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-ink-500">{subtitle}</p> : null}
        </div>
        {action}
      </header>
    );
  }

  return (
    <header
      className={clsx(
        'sticky top-0 z-20 flex min-h-12 items-center gap-1 px-1.5 py-1 backdrop-blur',
        tone === 'chat' ? surface : clsx(surface, 'border-b border-ink-200'),
      )}
    >
      <Link
        href={back}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-900 no-underline hover:bg-black/5"
        aria-label="戻る"
      >
        <ChevronLeftIcon className="h-6 w-6" strokeWidth={2.2} />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-base font-bold text-ink-900">{title}</h1>
        {subtitle ? (
          <p className={clsx('truncate text-[11px]', tone === 'chat' ? 'text-ink-800' : 'text-ink-500')}>{subtitle}</p>
        ) : null}
      </div>
      <div className="flex min-w-10 shrink-0 items-center justify-end pr-1.5">{action}</div>
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
      // the stored colours were picked for a dark ground, so on white they get a
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
        className={clsx(dimension, 'block rounded-full bg-ink-100 object-cover')}
      />
      {online ? (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
      ) : null}
    </span>
  );
}

/**
 * An unread count. Red on the tab bar, as LINE marks a tab; green beside a
 * talk in the list.
 */
export function Counter({
  count,
  className,
  tone = 'red',
}: {
  count: number;
  className?: string;
  tone?: 'red' | 'brand';
}): ReactNode {
  if (count <= 0) return null;
  return (
    <span
      className={clsx(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none text-white',
        tone === 'brand' ? 'bg-brand-500' : 'bg-red-500',
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
      {hint ? <span className="mt-1 block text-[11px] text-ink-500">{hint}</span> : null}
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

/**
 * Underlined tabs that share the width, with a dark bar under the active one.
 * Each tab keeps at least its label's width, so a long set scrolls sideways
 * instead of clipping the last label.
 */
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
    <div className="no-scrollbar flex overflow-x-auto border-b border-ink-200 bg-white px-2" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => onChange(tab.value)}
          className={clsx(
            'relative flex flex-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm transition',
            active === tab.value
              ? 'font-bold text-ink-900 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink-900'
              : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {tab.label}
          {tab.count ? <Counter count={tab.count} /> : null}
        </button>
      ))}
    </div>
  );
}

/** A bottom sheet on a phone, a centred dialog on a wider screen. */
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className="max-h-[85vh] w-full max-w-app overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 bg-white">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink-200 sm:hidden" aria-hidden />
          <div className="relative flex items-center justify-center px-12 py-3">
            <h2 className="truncate text-[15px] font-bold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
              aria-label="閉じる"
            >
              <CloseIcon className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="px-4 pb-4 pt-1">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-ink-200 bg-white p-4">{footer}</div> : null}
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
    <nav className="flex items-center justify-center gap-3 py-5">
      <button
        type="button"
        className="btn-secondary h-9 w-9 rounded-full p-0"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="前のページ"
      >
        <ChevronLeftIcon className="h-4 w-4" strokeWidth={2.2} />
      </button>
      <span className="text-xs text-ink-500">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        className="btn-secondary h-9 w-9 rounded-full p-0"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="次のページ"
      >
        <ChevronRightIcon className="h-4 w-4" strokeWidth={2.2} />
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
