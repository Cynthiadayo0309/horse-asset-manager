import type { Context } from 'hono';
import type { ZodType } from 'zod';

import type { AppBindings } from '../types';

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422,
    readonly code: string,
    message: string,
    readonly details: Array<{ path?: string; message: string }> = [],
  ) {
    super(message);
  }
}

export function ok<T>(c: Context<AppBindings>, data: T, message = 'OK', status: 200 | 201 = 200) {
  return c.json({ data, message }, status);
}

export function paginated<T>(
  c: Context<AppBindings>,
  data: T[],
  pagination: { page: number; pageSize: number; total: number },
) {
  return c.json({
    data,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.pageSize),
    },
    message: 'OK',
  });
}

export async function parseJson<T>(c: Context<AppBindings>, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'JSON形式の入力を送信してください。');
  }
  return parseValue(value, schema);
}

export function parseValue<T>(value: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      '入力内容を確認してください。',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export function getIp(c: Context<AppBindings>): string | null {
  return c.req.header('cf-connecting-ip') ?? null;
}

export function jsonChanges(value: Record<string, unknown>): string {
  const sensitive = new Set(['password', 'passwordHash', 'token', 'cookie']);
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sensitive.has(key) ? '[REDACTED]' : item]),
    ),
  );
}
