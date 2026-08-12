import { beforeEach, describe, expect, it } from 'vitest';

import type { CookLogStore } from '~/db/cook-log-store';
import type { ImageStore } from '~/db/image-store';
import type { RecipeStore } from '~/db/recipe-store';

import type { NormalizedCookLog } from './cook-log-input';
import {
  CookLogNotFoundError,
  CookLogPhotoRequiredError,
  addCookLog,
  editCookLog,
  listCookLogEntries,
  removeCookLog,
} from './cook-log-service';
import { createImageKey } from './image-key';
import { ImageAccessDeniedError } from './image-service';
import { RecipeNotFoundError } from './recipe-service';

const OWNER = 'user-owner';
const OTHER = 'user-other';

const OWNED_RECIPE = 'recipe-owned';
const OTHERS_RECIPE = 'recipe-others';

/**
 * メモリ上のレシピ。作った記録のユースケースが見るのは持ち主だけなので、
 * `findRecipe` だけを備えた最小の store で足りる。
 */
const fakeRecipeStore: Pick<RecipeStore, 'findRecipe'> = {
  findRecipe: (recipeId) =>
    Promise.resolve(
      [
        { id: OWNED_RECIPE, userId: OWNER },
        { id: OTHERS_RECIPE, userId: OTHER },
      ]
        .map((recipe) => ({ ...recipe, title: '', memo: null, url: null }))
        .find((recipe) => recipe.id === recipeId),
    ),
};

/**
 * メモリ上の `CookLogStore`。
 *
 * D1 を立てずに、認可・並び順・写真の差し替えを確かめるために使う。
 * 保存された生の行をそのまま覗けるようにしてある。
 */
const createFakeCookLogStore = () => {
  const cookLogs: Array<{
    id: string;
    recipeId: string;
    cookedAt: string;
    memo: string | null;
    createdAt: Date;
  }> = [];
  const photos: Array<{
    cookLogId: string;
    storageKey: string;
    order: number;
  }> = [];

  let sequence = 0;
  // 実時刻に依らず「あとで書いたものほど新しい」を作るための論理時計
  const nextId = () => `cook-log-${++sequence}`;

  const store: CookLogStore = {
    listCookLogs: (recipeId) =>
      Promise.resolve(
        cookLogs
          .filter((log) => log.recipeId === recipeId)
          // 並び順はユースケース側の責務なので、ここでは作成順のまま返す
          .map((log) => ({ ...log })),
      ),

    listCookLogPhotosByRecipe: (recipeId) => {
      const ids = new Set(
        cookLogs
          .filter((log) => log.recipeId === recipeId)
          .map((log) => log.id),
      );

      return Promise.resolve(
        photos
          .filter((photo) => ids.has(photo.cookLogId))
          .map((p) => ({ ...p })),
      );
    },

    findCookLog: (cookLogId) =>
      Promise.resolve(cookLogs.find((log) => log.id === cookLogId)),

    findCookLogPhotos: (cookLogId) =>
      Promise.resolve(
        photos
          .filter((photo) => photo.cookLogId === cookLogId)
          .sort((a, b) => a.order - b.order)
          .map(({ storageKey }) => ({ storageKey })),
      ),

    insertCookLog: (cookLog) => {
      const id = nextId();
      cookLogs.push({ id, ...cookLog, createdAt: new Date(sequence * 1000) });

      return Promise.resolve(id);
    },

    updateCookLog: (cookLogId, values) => {
      const cookLog = cookLogs.find((log) => log.id === cookLogId);

      if (cookLog) {
        Object.assign(cookLog, values);
      }

      return Promise.resolve();
    },

    deleteCookLog: (cookLogId) => {
      const index = cookLogs.findIndex((log) => log.id === cookLogId);

      if (index !== -1) {
        cookLogs.splice(index, 1);
      }

      // 実 DB では FK のカスケードで消える写真の行を、ここでも同じように落とす
      const kept = photos.filter((photo) => photo.cookLogId !== cookLogId);
      photos.splice(0, photos.length, ...kept);

      return Promise.resolve();
    },

    replaceCookLogPhotos: (cookLogId, rows) => {
      photos.splice(
        0,
        photos.length,
        ...photos.filter((photo) => photo.cookLogId !== cookLogId),
        ...rows.map((row) => ({ ...row, cookLogId })),
      );

      return Promise.resolve();
    },
  };

  return { store, cookLogs, photos };
};

/**
 * メモリ上の `ImageStore`。
 *
 * ここで確かめたいのは「R2 の実体をいつ消すか」だけなので、消されたキーを
 * 記録するだけの最小限にしてある。
 */
const createFakeImageStore = () => {
  const deletedKeys: string[] = [];

  const store: ImageStore = {
    put: () => Promise.resolve(),
    get: () => Promise.resolve(null),
    deleteMany: (keys) => {
      deletedKeys.push(...keys);

      return Promise.resolve();
    },
  };

  return { store, deletedKeys };
};

/** 添付済みの写真 1 枚分。キーの持ち主で認可されるので、採番も本物と同じ形で行う */
const photo = (userId: string, order: number) => ({
  storageKey: createImageKey(userId),
  order,
});

const cookLog = (
  values: Partial<NormalizedCookLog> = {},
): NormalizedCookLog => ({
  cookedAt: '2026-08-13',
  memo: null,
  photos: [photo(OWNER, 0)],
  ...values,
});

describe('addCookLog', () => {
  it('作った日・メモ・写真を order 付きで保存する', async () => {
    const fake = createFakeCookLogStore();
    const photos = [photo(OWNER, 0), photo(OWNER, 1)];

    const cookLogId = await addCookLog(
      fakeRecipeStore,
      fake.store,
      OWNER,
      OWNED_RECIPE,
      cookLog({ memo: '家族に好評', photos }),
    );

    expect(fake.cookLogs).toEqual([
      {
        id: cookLogId,
        recipeId: OWNED_RECIPE,
        cookedAt: '2026-08-13',
        memo: '家族に好評',
        createdAt: expect.any(Date),
      },
    ]);
    expect(fake.photos).toEqual(photos.map((row) => ({ ...row, cookLogId })));
  });

  it('他ユーザーのレシピには記録を足せない', async () => {
    const fake = createFakeCookLogStore();

    await expect(
      addCookLog(fakeRecipeStore, fake.store, OWNER, OTHERS_RECIPE, cookLog()),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(fake.cookLogs).toEqual([]);
  });

  it('存在しないレシピには記録を足せない', async () => {
    const fake = createFakeCookLogStore();

    await expect(
      addCookLog(
        fakeRecipeStore,
        fake.store,
        OWNER,
        'recipe-unknown',
        cookLog(),
      ),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it('写真が 0 枚の記録は作れない', async () => {
    const fake = createFakeCookLogStore();

    await expect(
      addCookLog(
        fakeRecipeStore,
        fake.store,
        OWNER,
        OWNED_RECIPE,
        cookLog({ photos: [] }),
      ),
    ).rejects.toBeInstanceOf(CookLogPhotoRequiredError);

    expect(fake.cookLogs).toEqual([]);
  });

  it('他ユーザーの画像キーを添えた作成を拒否する', async () => {
    const fake = createFakeCookLogStore();

    await expect(
      addCookLog(
        fakeRecipeStore,
        fake.store,
        OWNER,
        OWNED_RECIPE,
        cookLog({ photos: [photo(OWNER, 0), photo(OTHER, 1)] }),
      ),
    ).rejects.toBeInstanceOf(ImageAccessDeniedError);

    // 1 枚でも他人のものが混ざっていれば記録ごと保存しない
    expect(fake.cookLogs).toEqual([]);
    expect(fake.photos).toEqual([]);
  });
});

describe('listCookLogEntries', () => {
  it('記録が 1 件も無ければ空になる', async () => {
    const fake = createFakeCookLogStore();

    await expect(
      listCookLogEntries(fakeRecipeStore, fake.store, OWNER, OWNED_RECIPE),
    ).resolves.toEqual([]);
  });

  it('作った日の新しい順に返し、同じ日はあとから書いたものを先に出す', async () => {
    const fake = createFakeCookLogStore();
    const add = (cookedAt: string, memo: string) =>
      addCookLog(
        fakeRecipeStore,
        fake.store,
        OWNER,
        OWNED_RECIPE,
        cookLog({ cookedAt, memo }),
      );

    await add('2026-08-10', '1 回目');
    await add('2026-08-13', '2 回目');
    // 同じ日の 2 件目。あとから書いたので、同日の中では上に来る
    await add('2026-08-13', '3 回目');
    await add('2026-07-31', '4 回目');

    await expect(
      listCookLogEntries(fakeRecipeStore, fake.store, OWNER, OWNED_RECIPE).then(
        (entries) => entries.map((entry) => entry.memo),
      ),
    ).resolves.toEqual(['3 回目', '2 回目', '1 回目', '4 回目']);
  });

  it('写真を記録ごとに order 順で割り当てる', async () => {
    const fake = createFakeCookLogStore();
    const photos = [photo(OWNER, 1), photo(OWNER, 0)];
    const cookLogId = await addCookLog(
      fakeRecipeStore,
      fake.store,
      OWNER,
      OWNED_RECIPE,
      cookLog({ memo: 'ほくほく', photos }),
    );
    await addCookLog(
      fakeRecipeStore,
      fake.store,
      OWNER,
      OWNED_RECIPE,
      cookLog({ cookedAt: '2026-08-01' }),
    );

    const entries = await listCookLogEntries(
      fakeRecipeStore,
      fake.store,
      OWNER,
      OWNED_RECIPE,
    );

    expect(entries[0]).toEqual({
      id: cookLogId,
      cookedAt: '2026-08-13',
      memo: 'ほくほく',
      photos: [
        // 登録順ではなく order 昇順
        { storageKey: photos[1]?.storageKey },
        { storageKey: photos[0]?.storageKey },
      ],
    });
    expect(entries[1]?.photos).toHaveLength(1);
  });

  it('他ユーザーのレシピの記録は読めない', async () => {
    const fake = createFakeCookLogStore();

    await expect(
      listCookLogEntries(fakeRecipeStore, fake.store, OWNER, OTHERS_RECIPE),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it('存在しないレシピの記録は読めない', async () => {
    const fake = createFakeCookLogStore();

    await expect(
      listCookLogEntries(fakeRecipeStore, fake.store, OWNER, 'recipe-unknown'),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});

describe('editCookLog', () => {
  const fake = createFakeCookLogStore();
  const images = createFakeImageStore();
  let cookLogId = '';
  let savedPhoto = photo(OWNER, 0);

  beforeEach(async () => {
    fake.cookLogs.length = 0;
    fake.photos.length = 0;
    images.deletedKeys.length = 0;
    savedPhoto = photo(OWNER, 0);

    cookLogId = await addCookLog(
      fakeRecipeStore,
      fake.store,
      OWNER,
      OWNED_RECIPE,
      cookLog({ memo: '砂糖を減らした', photos: [savedPhoto] }),
    );
  });

  it('作った日とメモを更新できる', async () => {
    await editCookLog(
      fakeRecipeStore,
      fake.store,
      images.store,
      OWNER,
      cookLogId,
      cookLog({
        cookedAt: '2026-08-01',
        memo: null,
        photos: [savedPhoto],
      }),
    );

    expect(fake.cookLogs[0]).toMatchObject({
      id: cookLogId,
      cookedAt: '2026-08-01',
      memo: null,
    });
    // 写真は据え置きなので R2 の実体も残る
    expect(images.deletedKeys).toEqual([]);
  });

  it('写真を足すと行が増え、既存の写真は R2 に残る', async () => {
    const added = photo(OWNER, 1);

    await editCookLog(
      fakeRecipeStore,
      fake.store,
      images.store,
      OWNER,
      cookLogId,
      cookLog({ photos: [savedPhoto, added] }),
    );

    expect(fake.photos).toEqual(
      [savedPhoto, added].map((row) => ({ ...row, cookLogId })),
    );
    expect(images.deletedKeys).toEqual([]);
  });

  it('写真を並べ替えると order が振り直される', async () => {
    const added = photo(OWNER, 1);
    await editCookLog(
      fakeRecipeStore,
      fake.store,
      images.store,
      OWNER,
      cookLogId,
      cookLog({ photos: [savedPhoto, added] }),
    );

    await editCookLog(
      fakeRecipeStore,
      fake.store,
      images.store,
      OWNER,
      cookLogId,
      cookLog({
        photos: [
          { storageKey: added.storageKey, order: 0 },
          { storageKey: savedPhoto.storageKey, order: 1 },
        ],
      }),
    );

    expect(fake.photos).toEqual([
      { cookLogId, storageKey: added.storageKey, order: 0 },
      { cookLogId, storageKey: savedPhoto.storageKey, order: 1 },
    ]);
    expect(images.deletedKeys).toEqual([]);
  });

  it('外した写真だけ R2 の実体も消える', async () => {
    const added = photo(OWNER, 1);
    await editCookLog(
      fakeRecipeStore,
      fake.store,
      images.store,
      OWNER,
      cookLogId,
      cookLog({ photos: [savedPhoto, added] }),
    );

    await editCookLog(
      fakeRecipeStore,
      fake.store,
      images.store,
      OWNER,
      cookLogId,
      cookLog({ photos: [{ storageKey: added.storageKey, order: 0 }] }),
    );

    expect(fake.photos).toEqual([
      { cookLogId, storageKey: added.storageKey, order: 0 },
    ]);
    expect(images.deletedKeys).toEqual([savedPhoto.storageKey]);
  });

  it('最後の 1 枚を外した更新を拒否する（写真は必須）', async () => {
    await expect(
      editCookLog(
        fakeRecipeStore,
        fake.store,
        images.store,
        OWNER,
        cookLogId,
        cookLog({ photos: [] }),
      ),
    ).rejects.toBeInstanceOf(CookLogPhotoRequiredError);

    // 行も R2 の実体も残る
    expect(fake.photos).toEqual([{ ...savedPhoto, cookLogId }]);
    expect(images.deletedKeys).toEqual([]);
  });

  it('他ユーザーの記録は更新できない', async () => {
    await expect(
      editCookLog(
        fakeRecipeStore,
        fake.store,
        images.store,
        OTHER,
        cookLogId,
        cookLog({ memo: '乗っ取り', photos: [photo(OTHER, 0)] }),
      ),
    ).rejects.toBeInstanceOf(CookLogNotFoundError);

    expect(fake.cookLogs[0]?.memo).toBe('砂糖を減らした');
    expect(fake.photos).toEqual([{ ...savedPhoto, cookLogId }]);
    // 他人の記録の写真を R2 から消させない
    expect(images.deletedKeys).toEqual([]);
  });

  it('存在しない記録は更新できない', async () => {
    await expect(
      editCookLog(
        fakeRecipeStore,
        fake.store,
        images.store,
        OWNER,
        'cook-log-unknown',
        cookLog(),
      ),
    ).rejects.toBeInstanceOf(CookLogNotFoundError);
  });

  it('他ユーザーの画像キーを添えた更新を拒否する', async () => {
    await expect(
      editCookLog(
        fakeRecipeStore,
        fake.store,
        images.store,
        OWNER,
        cookLogId,
        cookLog({ photos: [photo(OTHER, 0)] }),
      ),
    ).rejects.toBeInstanceOf(ImageAccessDeniedError);

    expect(fake.photos).toEqual([{ ...savedPhoto, cookLogId }]);
    expect(images.deletedKeys).toEqual([]);
  });
});

describe('removeCookLog', () => {
  it('持ち主なら削除でき、写真の実体も R2 から消える', async () => {
    const fake = createFakeCookLogStore();
    const images = createFakeImageStore();
    const photos = [photo(OWNER, 0), photo(OWNER, 1)];
    const cookLogId = await addCookLog(
      fakeRecipeStore,
      fake.store,
      OWNER,
      OWNED_RECIPE,
      cookLog({ photos }),
    );

    await removeCookLog(
      fakeRecipeStore,
      fake.store,
      images.store,
      OWNER,
      cookLogId,
    );

    expect(fake.cookLogs).toEqual([]);
    expect(fake.photos).toEqual([]);
    // 写真の行は FK のカスケードで消えるが、R2 の実体は明示的に消す必要がある
    expect(images.deletedKeys).toEqual(photos.map((row) => row.storageKey));
  });

  it('他ユーザーの記録は削除できない', async () => {
    const fake = createFakeCookLogStore();
    const images = createFakeImageStore();
    const cookLogId = await addCookLog(
      fakeRecipeStore,
      fake.store,
      OWNER,
      OWNED_RECIPE,
      cookLog(),
    );

    await expect(
      removeCookLog(
        fakeRecipeStore,
        fake.store,
        images.store,
        OTHER,
        cookLogId,
      ),
    ).rejects.toBeInstanceOf(CookLogNotFoundError);

    expect(fake.cookLogs).toHaveLength(1);
    expect(images.deletedKeys).toEqual([]);
  });

  it('存在しない記録の削除を拒否する', async () => {
    const fake = createFakeCookLogStore();
    const images = createFakeImageStore();

    await expect(
      removeCookLog(
        fakeRecipeStore,
        fake.store,
        images.store,
        OWNER,
        'cook-log-unknown',
      ),
    ).rejects.toBeInstanceOf(CookLogNotFoundError);
  });
});
