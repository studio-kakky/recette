import { useRouter } from '@tanstack/react-router';
import {
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';

import {
  CookLogForm,
  createNewCookLogFormValues,
  toCookLogFormValues,
} from '~/components/cook-log-form';
import type { CookLogFormValues } from '~/components/cook-log-form';
import { Button } from '~/components/ui/button';
import { createCookLog, deleteCookLog, updateCookLog } from '~/lib/cook-log';
import type { CookLogInput } from '~/lib/cook-log-input';
import type { CookLogEntry } from '~/lib/cook-log-service';
import { formatDateLabel } from '~/lib/date';
import { toImageUrl } from '~/lib/image-key';

/**
 * レシピ詳細の「作った記録」セクション（docs: requirements/functional.md §3）。
 *
 * 記録は新しい順に並び、その場で追加・編集・削除できる。
 * 保存後はローダーのキャッシュを捨てて、一覧の「作った回数」も含めて取り直す。
 */

const DELETE_ERROR_MESSAGE =
  '削除できませんでした。時間をおいてもう一度お試しください。';

/** 編集中の記録。`cookLogId` が `null` なら新規追加 */
type Draft = {
  readonly cookLogId: string | null;
  readonly values: CookLogFormValues;
};

type RecipeCookLogsProps = {
  readonly recipeId: string;
  /** 新しい順に並んだ記録 */
  readonly cookLogs: readonly CookLogEntry[];
};

const CookLogPhotos = ({
  photos,
  dateLabel,
}: {
  readonly photos: CookLogEntry['photos'];
  readonly dateLabel: string;
}) => (
  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {photos.map((photo, index) => (
      <li key={photo.storageKey}>
        {/* 細かいところは拡大して見られるよう、タップで実体を開けるようにしておく */}
        <a
          href={toImageUrl(photo.storageKey)}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
        >
          <img
            src={toImageUrl(photo.storageKey)}
            alt={`${dateLabel}に作った写真 ${index + 1}`}
            loading="lazy"
            className="bg-muted aspect-square w-full rounded-lg object-cover"
          />
        </a>
      </li>
    ))}
  </ul>
);

export const RecipeCookLogs = ({ recipeId, cookLogs }: RecipeCookLogsProps) => {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const closeDraft = () => setDraft(null);

  const startAdding = () => {
    setErrorMessage(null);
    setDraft({ cookLogId: null, values: createNewCookLogFormValues() });
  };

  const startEditing = (entry: CookLogEntry) => {
    setErrorMessage(null);
    setDraft({ cookLogId: entry.id, values: toCookLogFormValues(entry) });
  };

  /** 保存の失敗はフォーム側で拾って見せるので、ここでは投げ直す */
  const handleSubmit = async (
    cookLogId: string | null,
    input: CookLogInput,
  ) => {
    if (cookLogId === null) {
      await createCookLog({ data: { recipeId, cookLog: input } });
    } else {
      await updateCookLog({ data: { cookLogId, cookLog: input } });
    }

    // 「作った回数」も記録数から出しているので、一覧ごとキャッシュを捨てる
    await router.invalidate();
    closeDraft();
  };

  const handleDelete = async (entry: CookLogEntry) => {
    // 写真ごと消える取り消せない操作なので、ネイティブの確認ダイアログを 1 枚挟む
    if (
      !window.confirm(
        `${formatDateLabel(entry.cookedAt)} の記録を削除します。写真も消えます。元に戻せません。よろしいですか？`,
      )
    ) {
      return;
    }

    setErrorMessage(null);
    setDeletingId(entry.id);

    try {
      await deleteCookLog({ data: { cookLogId: entry.id } });
      await router.invalidate();
    } catch {
      setErrorMessage(DELETE_ERROR_MESSAGE);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold">
          作った記録
          {cookLogs.length > 0 && (
            <span className="text-muted-foreground ml-2 text-xs font-normal tabular-nums">
              {cookLogs.length} 回
            </span>
          )}
        </h2>
        {draft === null && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={startAdding}
          >
            <Plus data-icon="inline-start" />
            記録する
          </Button>
        )}
      </div>

      {draft !== null && draft.cookLogId === null && (
        <CookLogForm
          initialValues={draft.values}
          submitLabel="記録する"
          onSubmit={(input) => handleSubmit(null, input)}
          onCancel={closeDraft}
        />
      )}

      {cookLogs.length === 0 && draft === null ? (
        <p className="border-border bg-card text-muted-foreground flex items-center gap-2 rounded-xl border border-dashed px-3 py-4 text-xs">
          <UtensilsCrossed className="size-4 shrink-0" aria-hidden="true" />
          まだ記録がありません。作ったら写真を残しておきましょう。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cookLogs.map((entry) => (
            <li key={entry.id}>
              {draft?.cookLogId === entry.id ? (
                <CookLogForm
                  initialValues={draft.values}
                  submitLabel="保存する"
                  onSubmit={(input) => handleSubmit(entry.id, input)}
                  onCancel={closeDraft}
                />
              ) : (
                <article className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
                  <CookLogPhotos
                    photos={entry.photos}
                    dateLabel={formatDateLabel(entry.cookedAt)}
                  />
                  <p className="text-sm font-medium">
                    {formatDateLabel(entry.cookedAt)}
                  </p>
                  {entry.memo !== null && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {entry.memo}
                    </p>
                  )}
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === entry.id}
                      onClick={() => startEditing(entry)}
                    >
                      <Pencil data-icon="inline-start" />
                      編集
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === entry.id}
                      onClick={() => void handleDelete(entry)}
                    >
                      {deletingId === entry.id ? (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                        />
                      ) : (
                        <Trash2 data-icon="inline-start" />
                      )}
                      削除
                    </Button>
                  </div>
                </article>
              )}
            </li>
          ))}
        </ul>
      )}

      {errorMessage !== null && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {errorMessage}
        </p>
      )}
    </section>
  );
};
