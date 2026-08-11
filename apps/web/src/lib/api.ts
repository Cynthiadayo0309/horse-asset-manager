import type { ApiErrorResponse, ApiSuccess, PaginatedSuccess } from '@horse-asset-manager/shared';

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Array<{ path?: string; message: string }> = [],
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  const body = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiErrorResponse | null;
  if (!response.ok || !body || 'error' in body) {
    const error = body && 'error' in body ? body.error : null;
    throw new ApiClientError(
      error?.code ?? 'NETWORK_ERROR',
      error?.message ?? '通信に失敗しました。',
      response.status,
      error?.details ?? [],
    );
  }
  return body.data;
}

export async function apiList<T>(path: string): Promise<PaginatedSuccess<T>> {
  const response = await fetch(path, { credentials: 'include' });
  const body = (await response.json()) as PaginatedSuccess<T> | ApiErrorResponse;
  if (!response.ok || 'error' in body) {
    const error = 'error' in body ? body.error : null;
    throw new ApiClientError(
      error?.code ?? 'NETWORK_ERROR',
      error?.message ?? '通信に失敗しました。',
      response.status,
      error?.details ?? [],
    );
  }
  return body;
}

export function postJson<T>(path: string, value: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(value) });
}

export function patchJson<T>(path: string, value: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(value) });
}

export function deleteRequest<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

export function deleteJson<T>(path: string, value: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE', body: JSON.stringify(value) });
}

export function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
}

export function currentDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}
