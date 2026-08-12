import { LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import { PhotoPicker } from '~/components/photo-picker';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { COOK_LOG_PHOTO_LIMIT, cookLogInputSchema } from '~/lib/cook-log-input';
import type { CookLogInput } from '~/lib/cook-log-input';
import type { CookLogEntry } from '~/lib/cook-log-service';
import { toDateInputValue } from '~/lib/date';

/**
 * 作った記録の追加・編集フォーム（docs: requirements/functional.md §3）。
 *
 * 写真を残すことが目的の機能なので、写真が 1 枚も無ければ保存させない
 * （編集で最後の 1 枚を消すこともできない）。
 */

export type CookLogFormValues = {
  readonly cookedAt: string;
  readonly memo: string;
  readonly storageKeys: readonly string[];
};

type FieldErrors = {
  readonly cookedAt?: string;
  readonly memo?: string;
  readonly photos?: string;
  /** フィールドに紐づかないエラー（保存失敗など） */
  readonly form?: string;
};

type CookLogFormProps = {
  readonly initialValues: CookLogFormValues;
  readonly submitLabel: string;
  readonly onSubmit: (input: CookLogInput) => Promise<void>;
  readonly onCancel: () => void;
};

/**
 * 追加フォームの初期値。
 *
 * 「作った日」の当日はここ（ブラウザ）で入れる。サーバーはタイムゾーンを
 * 持たないため、サーバーで今日を求めると日付がずれてしまう。
 */
export const createNewCookLogFormValues = (): CookLogFormValues => ({
  cookedAt: toDateInputValue(new Date()),
  memo: '',
  storageKeys: [],
});

/** 保存済みの記録を編集するときの初期値 */
export const toCookLogFormValues = (
  entry: CookLogEntry,
): CookLogFormValues => ({
  cookedAt: entry.cookedAt,
  memo: entry.memo ?? '',
  storageKeys: entry.photos.map((photo) => photo.storageKey),
});

export const CookLogForm = ({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: CookLogFormProps) => {
  const fieldId = useId();
  const cookedAtId = `${fieldId}-cooked-at`;
  const memoId = `${fieldId}-memo`;

  const [cookedAt, setCookedAt] = useState(initialValues.cookedAt);
  const [memo, setMemo] = useState(initialValues.memo);
  const [photoKeys, setPhotoKeys] = useState<readonly string[]>(
    initialValues.storageKeys,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = cookLogInputSchema.safeParse({
      cookedAt,
      memo,
      photos: photoKeys.map((storageKey) => ({ storageKey })),
    });

    if (!parsed.success) {
      const messageFor = (field: string) =>
        parsed.error.issues.find((issue) => issue.path[0] === field)?.message;

      setErrors({
        cookedAt: messageFor('cookedAt'),
        memo: messageFor('memo'),
        photos: messageFor('photos'),
      });

      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      // 成功した場合はフォームごと閉じるため、この先には戻ってこない
      await onSubmit(parsed.data);
    } catch {
      setErrors({
        form: '保存できませんでした。時間をおいてもう一度お試しください。',
      });
      setIsSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      className="border-border bg-card flex flex-col gap-4 rounded-xl border p-3"
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          写真
          <span className="text-destructive ml-1 text-xs">必須</span>
        </p>
        <PhotoPicker
          storageKeys={photoKeys}
          onChange={setPhotoKeys}
          limit={COOK_LOG_PHOTO_LIMIT}
          isUploading={isUploading}
          onUploadingChange={setIsUploading}
          // 写真が 1 枚も無い記録は作れないので、最後の 1 枚は消させない
          minCount={1}
          addLabel="作った写真を追加"
        />
        {errors.photos !== undefined && (
          <p className="text-destructive text-xs">{errors.photos}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={cookedAtId}>
          作った日
          <span className="text-destructive text-xs">必須</span>
        </Label>
        <Input
          id={cookedAtId}
          type="date"
          value={cookedAt}
          className="w-fit"
          aria-invalid={errors.cookedAt !== undefined}
          aria-describedby={
            errors.cookedAt === undefined ? undefined : `${cookedAtId}-error`
          }
          onChange={(event) => setCookedAt(event.target.value)}
        />
        {errors.cookedAt !== undefined && (
          <p id={`${cookedAtId}-error`} className="text-destructive text-xs">
            {errors.cookedAt}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={memoId}>メモ</Label>
        <Textarea
          id={memoId}
          value={memo}
          rows={2}
          placeholder="例: 砂糖を減らした / 家族に好評"
          aria-invalid={errors.memo !== undefined}
          onChange={(event) => setMemo(event.target.value)}
        />
        {errors.memo !== undefined && (
          <p className="text-destructive text-xs">{errors.memo}</p>
        )}
      </div>

      {errors.form !== undefined && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {errors.form}
        </p>
      )}

      <div className="flex gap-2">
        {/* アップロード中の写真を取りこぼさないよう、終わるまでは保存させない */}
        <Button
          type="submit"
          size="lg"
          className="flex-1"
          disabled={isSaving || isUploading}
        >
          {isSaving && <LoaderCircle className="animate-spin" />}
          {isSaving ? '保存しています…' : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={isSaving}
          onClick={onCancel}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
};
