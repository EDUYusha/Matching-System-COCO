'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Spinner(): ReactNode {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

export function Loading(): ReactNode {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Spinner />
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({ message }: { message: string }): ReactNode {
  return <div className="py-12 text-center text-[13px] text-slate-400">{message}</div>;
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string[];
}): ReactNode {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span> : null}
      {error?.length ? <span className="mt-0.5 block text-[11px] text-rose-600">{error.join(' / ')}</span> : null}
    </label>
  );
}

export function Badge({ tone, children }: { tone?: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }): ReactNode {
  return (
    <span
      className={clsx(
        'badge',
        tone === 'ok' && 'bg-emerald-100 text-emerald-700',
        tone === 'warn' && 'bg-amber-100 text-amber-700',
        tone === 'bad' && 'bg-rose-100 text-rose-700',
        tone === 'info' && 'bg-sky-100 text-sky-700',
        !tone && 'bg-slate-100 text-slate-600',
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}): ReactNode {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className={clsx('card w-full', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[14px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer ? <div className="border-t border-slate-200 px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  totalCount,
  onChange,
}: {
  page: number;
  totalPages: number;
  totalCount?: number;
  onChange: (page: number) => void;
}): ReactNode {
  return (
    <div className="flex items-center justify-between px-3 py-3 text-[12px] text-slate-500">
      <span>{totalCount !== undefined ? `${totalCount.toLocaleString()} 件` : ''}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          前へ
        </button>
        <span>
          {page} / {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          className="btn-secondary px-2 py-1"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          次へ
        </button>
      </div>
    </div>
  );
}

export function DataTable<T>({
  rows,
  columns,
  empty,
  rowKey,
}: {
  rows: T[];
  columns: Array<{ header: string; cell: (row: T) => ReactNode; className?: string }>;
  empty?: string;
  rowKey: (row: T) => string | number;
}): ReactNode {
  if (!rows.length) return <Empty message={empty ?? 'データがありません'} />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} className={column.className}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.header} className={column.className}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
