import type { ApiError, FlashMessage } from '@/lib';

/**
 * Thin fetch wrapper over the API.
 *
 * The API answers an error with `{ error, details?, redirect?, flash? }`, which
 * mirrors what the Rails controllers did with `redirect_to … alert:`. ApiRequestError
 * carries that through so a caller can show the toast and follow the redirect.
 */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly details?: Record<string, string[]>;
  readonly redirect?: string;
  readonly flash?: FlashMessage;

  constructor(status: number, body: ApiError) {
    super(body.error || 'エラーが発生しました');
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = body.details;
    this.redirect = body.redirect;
    this.flash = body.flash;
  }
}

const BASE = '/api';

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(method: string, path: string, body?: unknown, options: { raw?: boolean } = {}): Promise<T> {
  const isFormData = body instanceof FormData;

  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    ...(body !== undefined && !isFormData ? { headers: { 'Content-Type': 'application/json' } } : {}),
    ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const parsed = (await parse(response)) as ApiError | null;
    throw new ApiRequestError(response.status, parsed ?? { error: response.statusText });
  }

  if (options.raw) return response as unknown as T;
  return (await parse(response)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  /** For downloads (the receipt PDF, the admin CSVs). */
  download: (path: string) => {
    window.open(`${BASE}${path}`, '_blank', 'noopener');
  },
};

/** Builds a query string, dropping empty values so the API sees the same shape as before. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}
