import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Recette のスキーマ定義（docs: requirements/data-model.md）。
 *
 * 方針:
 * - 主キーは text の UUID。ID をアプリ側で採番できるため INSERT の往復が不要で、
 *   後続の認証基盤（better-auth）が使う text ID とも型が揃う
 * - 日時は integer の Unix 秒（`{ mode: 'timestamp' }`）で保持し、TS 側では Date として扱う
 * - 「作った日」のような日付だけの値は `YYYY-MM-DD` の text（辞書順 = 時系列順）
 * - すべてのデータはユーザーに紐づく。所有者は `userId` を持つテーブルで直接、
 *   レシピ配下の行は `recipeId` 経由で辿る
 */

/** 主キー（アプリ側で採番する UUID） */
const primaryId = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** 作成日時。DB 側にもデフォルトを持たせ、生 SQL からの INSERT でも埋まるようにする */
const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`);

/** 並び順（0 始まりの昇順） */
const order = () => integer('order').notNull();

/** ストレージ上の画像キー。画像本体は R2（バインディング `IMAGES`）に置く */
const storageKey = () => text('storage_key').notNull();

// --- User ---------------------------------------------------------------

export const users = sqliteTable(
  'users',
  {
    id: primaryId(),
    /** OAuth プロバイダ名（例: `google`） */
    provider: text('provider').notNull(),
    /** プロバイダ内でのユーザー識別子 */
    providerId: text('provider_id').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('users_provider_provider_id_unique').on(
      table.provider,
      table.providerId,
    ),
  ],
);

// --- Recipe -------------------------------------------------------------

export const recipes = sqliteTable(
  'recipes',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    memo: text('memo'),
    /** ブックマーク型レシピの参照元 URL */
    url: text('url'),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  // 一覧は「自分のレシピを updatedAt 降順」で引くため複合インデックスを張る
  (table) => [
    index('recipes_user_id_updated_at_idx').on(table.userId, table.updatedAt),
  ],
);

/** 材料行。amount は「適量」「大さじ2」を許容するため text */
export const ingredients = sqliteTable(
  'ingredients',
  {
    id: primaryId(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    amount: text('amount'),
    order: order(),
  },
  (table) => [
    index('ingredients_recipe_id_order_idx').on(table.recipeId, table.order),
  ],
);

/** 手順行 */
export const steps = sqliteTable(
  'steps',
  {
    id: primaryId(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    order: order(),
  },
  (table) => [
    index('steps_recipe_id_order_idx').on(table.recipeId, table.order),
  ],
);

/** 参照用写真（本のページ・スクショ・完成イメージなど） */
export const photos = sqliteTable(
  'photos',
  {
    id: primaryId(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    storageKey: storageKey(),
    order: order(),
  },
  (table) => [
    index('photos_recipe_id_order_idx').on(table.recipeId, table.order),
  ],
);

// --- CookLog ------------------------------------------------------------

/** 作った記録。レシピの「作った回数」はこのテーブルの件数で算出する */
export const cookLogs = sqliteTable(
  'cook_logs',
  {
    id: primaryId(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    /** 作った日。`YYYY-MM-DD` 形式（時刻は持たない） */
    cookedAt: text('cooked_at').notNull(),
    memo: text('memo'),
    createdAt: createdAt(),
  },
  (table) => [
    index('cook_logs_recipe_id_cooked_at_idx').on(
      table.recipeId,
      table.cookedAt,
    ),
  ],
);

/** 作った記録の写真。1 件の CookLog につき 1 枚以上持つ（件数はアプリ側で担保する） */
export const cookLogPhotos = sqliteTable(
  'cook_log_photos',
  {
    id: primaryId(),
    cookLogId: text('cook_log_id')
      .notNull()
      .references(() => cookLogs.id, { onDelete: 'cascade' }),
    storageKey: storageKey(),
    order: order(),
  },
  (table) => [
    index('cook_log_photos_cook_log_id_order_idx').on(
      table.cookLogId,
      table.order,
    ),
  ],
);

// --- Tag ----------------------------------------------------------------

/** タグ。ユーザーごとに独立し、ユーザー内で名前がユニーク */
export const tags = sqliteTable(
  'tags',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [
    uniqueIndex('tags_user_id_name_unique').on(table.userId, table.name),
  ],
);

/** Recipe と Tag の多対多 */
export const recipeTags = sqliteTable(
  'recipe_tags',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.tagId] }),
    // タグからレシピを引く方向のインデックス（主キーは recipeId 始まりのため別途必要）
    index('recipe_tags_tag_id_idx').on(table.tagId),
  ],
);

// --- ShoppingItem -------------------------------------------------------

/** 買い物リスト項目。MVP ではリストはユーザーごとに 1 本なのでユーザーに直接紐づける */
export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 表示ラベル。材料から追加した場合は `name + amount` を結合したもの */
    label: text('label').notNull(),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    /** 由来レシピ（任意）。レシピが消えても項目は残す */
    recipeId: text('recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    index('shopping_items_user_id_created_at_idx').on(
      table.userId,
      table.createdAt,
    ),
  ],
);

// --- 型 -----------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type Ingredient = typeof ingredients.$inferSelect;
export type NewIngredient = typeof ingredients.$inferInsert;
export type Step = typeof steps.$inferSelect;
export type NewStep = typeof steps.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type CookLog = typeof cookLogs.$inferSelect;
export type NewCookLog = typeof cookLogs.$inferInsert;
export type CookLogPhoto = typeof cookLogPhotos.$inferSelect;
export type NewCookLogPhoto = typeof cookLogPhotos.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type RecipeTag = typeof recipeTags.$inferSelect;
export type NewRecipeTag = typeof recipeTags.$inferInsert;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type NewShoppingItem = typeof shoppingItems.$inferInsert;
