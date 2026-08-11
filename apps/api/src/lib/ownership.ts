import { categories, clubs, createDatabase, horses } from '@horse-asset-manager/database';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { AppBindings } from '../types';
import { ApiError } from './http';

export async function assertClub(c: Context<AppBindings>, id: number | null | undefined) {
  if (id == null) return null;
  const row = (
    await createDatabase(c.env.DB)
      .select()
      .from(clubs)
      .where(and(eq(clubs.id, id), eq(clubs.userId, c.get('user').id)))
      .limit(1)
  )[0];
  if (!row) throw new ApiError(404, 'CLUB_NOT_FOUND', 'クラブが見つかりません。');
  return row;
}

export async function assertHorse(c: Context<AppBindings>, id: number | null | undefined) {
  if (id == null) return null;
  const row = (
    await createDatabase(c.env.DB)
      .select()
      .from(horses)
      .where(and(eq(horses.id, id), eq(horses.userId, c.get('user').id)))
      .limit(1)
  )[0];
  if (!row) throw new ApiError(404, 'HORSE_NOT_FOUND', '馬情報が見つかりません。');
  return row;
}

export async function assertCategory(c: Context<AppBindings>, id: number | null | undefined) {
  if (id == null) return null;
  const row = (
    await createDatabase(c.env.DB)
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, c.get('user').id)))
      .limit(1)
  )[0];
  if (!row) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'カテゴリーが見つかりません。');
  return row;
}
