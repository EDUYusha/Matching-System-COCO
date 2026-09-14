'use client';

import type { ApiError, FlashMessage } from '@/lib';

/** Admin API client. Same envelope as the member API, under /api/admin. */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly details?: Record<string, string[]>;
  readonly flash?: FlashMessage;

  constructor(status: number, body: ApiError) {
    super(body.error || 'エラーが発生しました');
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = body.details;
    this.flash = body.flash;
  }
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isFormData = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    ...(body !== undefined && !isFormData ? { headers: { 'Content-Type': 'application/json' } } : {}),
    ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const parsed = (await parse(response)) as ApiError | null;
    throw new ApiRequestError(response.status, parsed ?? { error: response.statusText });
  }
  return (await parse(response)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  download: (path: string) => window.open(`/api${path}`, '_blank', 'noopener'),
};

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}
