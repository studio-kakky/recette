import type { CookLogStore } from '~/db/cook-log-store';
import type { ImageStore } from '~/db/image-store';
import type { RecipeStore } from '~/db/recipe-store';

import type { NormalizedCookLog } from './cook-log-input';
import { requireOwnedImageKeys } from './image-service';
import { requireOwnedRecipe } from './recipe-service';

/**
 * 作った記録の作成・更新・取得・削除のユースケース（docs: requirements/functional.md §3）。
 *
 * DB は `RecipeStore` / `CookLogStore` 越しに、画像の実体は `ImageStore` 越しにしか
 * 触らないので、偽の store を渡せば認可も並び順も R2 の始末もユニットテストで確かめられる。
 *
 * 認可は必ず「記録 → レシピ → 持ち主」と辿る。写真の行は FK のカスケードで消えるが、
 * R2 のオブジェクトは消えないため、記録を消すとき・写真を外したときにここから明示的に削除する。
 */

/**
 * 対象の記録が見つからない、または他ユーザーのものだったときのエラー。
 *
 * 「他人の記録が存在すること」を知られないよう、両方を同じエラーで扱う。
 */
export class CookLogNotFoundError extends Error {
  constructor() {
    super('作った記録が見つかりません');
    this.name = 'CookLogNotFoundError';
  }
}

/**
 * 写真の無い記録を保存しようとしたときのエラー。
 *
 * 入口（`cookLogInputSchema`）でも弾いているが、写真必須はこの機能の要なので
 * ユースケース側でも最後に確かめる。
 */
export class CookLogPhotoRequiredError extends Error {
  constructor() {
    super('写真を 1 枚以上選んでください');
    this.name = 'CookLogPhotoRequiredError';
  }
}

/** レシピ側に求めるのは持ち主の判定だけなので、本体を引ければ足りる */
type RecipeOwnerStore = Pick<RecipeStore, 'findRecipe'>;

/** 詳細画面に出す作った記録 1 件分 */
export type CookLogEntry = {
  readonly id: string;
  /** 作った日（`YYYY-MM-DD`）。表示の形は画面側で決める */
  readonly cookedAt: string;
  readonly memo: string | null;
  /** 写真（`order` 昇順）。1 枚以上あることが保証される */
  readonly photos: ReadonlyArray<{ readonly storageKey: string }>;
};

/** 記録の操作者が、記録の属するレシピの持ち主であることを確かめる */
const requireOwnedCookLog = async (
  store: RecipeOwnerStore,
  cookLogStore: CookLogStore,
  userId: string,
  cookLogId: string,
) => {
  const cookLog = await cookLogStore.findCookLog(cookLogId);

  if (!cookLog) {
    throw new CookLogNotFoundError();
  }

  const recipe = await store.findRecipe(cookLog.recipeId);

  // 他人のレシピの記録は「無い」と同じ扱いにして、存在を伏せる
  if (!recipe || recipe.userId !== userId) {
    throw new CookLogNotFoundError();
  }

  return cookLog;
};

/** 保存しようとしている写真が、自分のもので 1 枚以上あることを確かめる */
const requireOwnedPhotos = (
  userId: string,
  photos: NormalizedCookLog['photos'],
): void => {
  if (photos.length === 0) {
    throw new CookLogPhotoRequiredError();
  }

  // 他人の画像キーを自分の記録に繋がせない（削除時に他人の実体を消してしまうため）
  requireOwnedImageKeys(
    userId,
    photos.map((photo) => photo.storageKey),
  );
};

/**
 * レシピ 1 件分の作った記録を新しい順に返す。
 *
 * 並びは作った日（`cookedAt`）の降順。同じ日の記録は、あとから書いたものが上に来る。
 * 写真は記録ごとに引かず、レシピ単位でまとめて取ってから割り当てる。
 */
export const listCookLogEntries = async (
  store: RecipeOwnerStore,
  cookLogStore: CookLogStore,
  userId: string,
  recipeId: string,
): Promise<CookLogEntry[]> => {
  await requireOwnedRecipe(store, userId, recipeId);

  const [logs, photoRows] = await Promise.all([
    cookLogStore.listCookLogs(recipeId),
    cookLogStore.listCookLogPhotosByRecipe(recipeId),
  ]);

  const photosByCookLog = [...photoRows]
    .sort((a, b) => a.order - b.order)
    .reduce(
      (acc, row) =>
        acc.set(row.cookLogId, [
          ...(acc.get(row.cookLogId) ?? []),
          { storageKey: row.storageKey },
        ]),
      new Map<string, Array<{ storageKey: string }>>(),
    );

  return (
    [...logs]
      // store も同じ順で返すが、並び順は画面の仕様なのでここで確定させる。
      // `cookedAt` は `YYYY-MM-DD` なので辞書順の比較がそのまま時系列順になる
      .sort(
        (a, b) =>
          b.cookedAt.localeCompare(a.cookedAt) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .map((log) => ({
        id: log.id,
        cookedAt: log.cookedAt,
        memo: log.memo,
        photos: photosByCookLog.get(log.id) ?? [],
      }))
  );
};

/** 作った記録を新規作成し、作成された ID を返す */
export const addCookLog = async (
  store: RecipeOwnerStore,
  cookLogStore: CookLogStore,
  userId: string,
  recipeId: string,
  cookLog: NormalizedCookLog,
): Promise<string> => {
  await requireOwnedRecipe(store, userId, recipeId);
  requireOwnedPhotos(userId, cookLog.photos);

  const cookLogId = await cookLogStore.insertCookLog({
    recipeId,
    cookedAt: cookLog.cookedAt,
    memo: cookLog.memo,
  });

  await cookLogStore.replaceCookLogPhotos(cookLogId, cookLog.photos);

  return cookLogId;
};

/**
 * 既存の記録を更新する。
 *
 * 写真は delete → insert で丸ごと差し替える（写真の追加・削除・並べ替えを
 * まとめて反映できる）。外された写真は R2 の実体も消す。
 */
export const editCookLog = async (
  store: RecipeOwnerStore,
  cookLogStore: CookLogStore,
  images: ImageStore,
  userId: string,
  cookLogId: string,
  cookLog: NormalizedCookLog,
): Promise<void> => {
  await requireOwnedCookLog(store, cookLogStore, userId, cookLogId);
  requireOwnedPhotos(userId, cookLog.photos);

  const previousPhotos = await cookLogStore.findCookLogPhotos(cookLogId);

  await cookLogStore.updateCookLog(cookLogId, {
    cookedAt: cookLog.cookedAt,
    memo: cookLog.memo,
  });
  await cookLogStore.replaceCookLogPhotos(cookLogId, cookLog.photos);

  // DB から外れた写真は、そのままだと R2 に残り続けるので消す
  const keptKeys = new Set(cookLog.photos.map((photo) => photo.storageKey));

  await images.deleteMany(
    previousPhotos
      .map((photo) => photo.storageKey)
      .filter((key) => !keptKeys.has(key)),
  );
};

/**
 * 作った記録を削除する。写真の行は FK のカスケードで消えるが、
 * R2 の実体はカスケードが効かないので、行が消える前にキーを控えて消す。
 */
export const removeCookLog = async (
  store: RecipeOwnerStore,
  cookLogStore: CookLogStore,
  images: ImageStore,
  userId: string,
  cookLogId: string,
): Promise<void> => {
  await requireOwnedCookLog(store, cookLogStore, userId, cookLogId);

  const photos = await cookLogStore.findCookLogPhotos(cookLogId);

  await cookLogStore.deleteCookLog(cookLogId);
  await images.deleteMany(photos.map((photo) => photo.storageKey));
};
