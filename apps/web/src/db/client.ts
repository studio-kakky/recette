import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

import * as schema from './schema';

/** Recette のスキーマを型に持つ Drizzle インスタンス */
export type Database = DrizzleD1Database<typeof schema>;

/**
 * 任意の D1 バインディングから Drizzle インスタンスを作る。
 *
 * テストや、`env` を直接受け取れる文脈（Durable Object・スケジュールハンドラなど）で使う。
 */
export const createDatabase = (d1: D1Database): Database =>
  drizzle(d1, { schema });

/**
 * Server Function から使う D1 接続。
 *
 * `cloudflare:workers` の `env` は実行中のリクエストのバインディングに解決されるため、
 * Server Function の引数として env を引き回す必要がない。
 *
 * @example
 * const listRecipes = createServerFn().handler(async () => {
 *   const db = getDatabase();
 *   return db.select().from(recipes).orderBy(desc(recipes.updatedAt));
 * });
 */
export const getDatabase = (): Database => createDatabase(env.DB);
