import { ImagePlus, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import type { ChangeEvent } from 'react';

import { RowActions } from '~/components/row-actions';
import { buttonVariants } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { moveItem } from '~/lib/array';
import { IMAGE_ACCEPT_ATTRIBUTE } from '~/lib/image-input';
import { toImageUrl } from '~/lib/image-key';
import { uploadImage } from '~/lib/image-upload';
import { cn } from '~/lib/utils';

/**
 * 写真の選択・並べ替え・取り外しをまとめて引き受けるピッカー。
 *
 * レシピの写真（`~/components/recipe-form`）と作った記録の写真
 * （`~/components/cook-log-form`）で共有する。
 *
 * 選ばれた画像はフォームの保存を待たずにその場で R2 へ入れ、実体の URL を
 * 見ながら並べ替えられるようにする（縮小と送信は `~/lib/image-upload` に任せる）。
 * 持っているのはストレージキーの並びだけで、キーは採番済みの UUID なので
 * そのまま React のキーに使える。
 */

const UPLOAD_ERROR_MESSAGE =
  '写真を保存できませんでした。もう一度お試しください。';

type PhotoPickerProps = {
  /** 添付済みの写真のストレージキー（表示順） */
  readonly storageKeys: readonly string[];
  readonly onChange: (storageKeys: string[]) => void;
  /** 添付できる枚数の上限 */
  readonly limit: number;
  /**
   * アップロード中かどうか。取りこぼしを防ぐため、
   * この間はフォームを保存させない（状態は親が持つ）。
   */
  readonly isUploading: boolean;
  readonly onUploadingChange: (isUploading: boolean) => void;
  /** 残しておく最低枚数。写真が必須の作った記録では 1 を渡す */
  readonly minCount?: number;
  readonly addLabel?: string;
};

export const PhotoPicker = ({
  storageKeys,
  onChange,
  limit,
  isUploading,
  onUploadingChange,
  minCount = 0,
  addLabel = '写真を追加',
}: PhotoPickerProps) => {
  const inputId = useId();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFull = storageKeys.length >= limit;

  const addPhotos = async (files: readonly File[]) => {
    const room = limit - storageKeys.length;

    if (room <= 0) {
      setErrorMessage(`写真は ${limit} 枚まで添付できます。`);

      return;
    }

    setErrorMessage(null);
    onUploadingChange(true);

    try {
      const added = await Promise.all(
        files.slice(0, room).map((file) => uploadImage(file)),
      );

      onChange([...storageKeys, ...added]);
    } catch (error) {
      // アップロード側が理由を持っていれば（形式・サイズなど）それを見せる
      setErrorMessage(
        error instanceof Error ? error.message : UPLOAD_ERROR_MESSAGE,
      );
    } finally {
      onUploadingChange(false);
    }
  };

  const handlePhotosSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];

    // 同じファイルを選び直せるよう、読み取ったら入力を空に戻す
    event.target.value = '';

    if (files.length > 0) {
      await addPhotos(files);
    }
  };

  return (
    <>
      {storageKeys.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {storageKeys.map((storageKey, index) => (
            <li
              key={storageKey}
              className="border-border bg-card flex flex-col gap-2 rounded-xl border p-2"
            >
              <img
                src={toImageUrl(storageKey)}
                alt={`${index + 1} 枚目の写真`}
                loading="lazy"
                className="bg-muted aspect-square w-full rounded-lg object-cover"
              />
              <RowActions
                label={`${index + 1} 枚目の写真`}
                isFirst={index === 0}
                isLast={index === storageKeys.length - 1}
                orientation="horizontal"
                isRemoveDisabled={storageKeys.length <= minCount}
                onMoveUp={() => onChange(moveItem(storageKeys, index, 'up'))}
                onMoveDown={() =>
                  onChange(moveItem(storageKeys, index, 'down'))
                }
                onRemove={() =>
                  onChange(storageKeys.filter((key) => key !== storageKey))
                }
              />
            </li>
          ))}
        </ul>
      )}

      {/*
        見た目はボタンだが、実体は file 入力。入力自体は sr-only で残してあるので
        キーボードでもフォーカスして開ける。
      */}
      <Label
        htmlFor={inputId}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'lg' }),
          'w-fit cursor-pointer',
          (isUploading || isFull) && 'pointer-events-none opacity-50',
        )}
      >
        {isUploading ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <ImagePlus />
        )}
        {isUploading ? 'アップロードしています…' : addLabel}
      </Label>
      <input
        id={inputId}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        disabled={isUploading || isFull}
        onChange={(event) => void handlePhotosSelected(event)}
      />
      {errorMessage !== null && (
        <p role="alert" className="text-destructive text-xs">
          {errorMessage}
        </p>
      )}
    </>
  );
};
