import { ArrowDown, ArrowUp, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { moveItem } from '~/lib/array';
import { recipeInputSchema } from '~/lib/recipe-input';
import type { RecipeInput } from '~/lib/recipe-input';
import type { RecipeFormValues } from '~/lib/recipe-service';

/**
 * レシピの作成・編集フォーム（写真以外の全フィールド）。
 *
 * 必須はタイトルだけ。「URL とタイトルだけ」「材料だけ」のような
 * 部分入力でも保存できるようにしている（docs: requirements/functional.md §2）。
 *
 * 行の並べ替えはモバイルでも押しやすい上下ボタンで行う（ドラッグは使わない）。
 */

/** 行の React キー用の ID。DB には保存しない */
type RowId = { readonly id: string };
type IngredientRow = RowId & { readonly name: string; readonly amount: string };
type StepRow = RowId & { readonly body: string };

type FieldErrors = {
  readonly title?: string;
  readonly url?: string;
  /** フィールドに紐づかないエラー（保存失敗など） */
  readonly form?: string;
};

type RecipeFormProps = {
  /** 編集時は保存済みの値、新規作成時は空の値 */
  readonly initialValues: RecipeFormValues;
  /** タグ入力の候補になる、ユーザーが既に持っているタグ名 */
  readonly tagOptions: readonly string[];
  readonly heading: string;
  readonly submitLabel: string;
  readonly onSubmit: (values: RecipeInput) => Promise<void>;
  readonly onCancel: () => void;
};

/** 空のフォームの初期値（新規作成用） */
export const EMPTY_RECIPE_FORM_VALUES: RecipeFormValues = {
  title: '',
  memo: '',
  url: '',
  ingredients: [],
  steps: [],
  tagNames: [],
};

const createIngredientRow = (
  values: { name: string; amount: string } = { name: '', amount: '' },
): IngredientRow => ({ id: crypto.randomUUID(), ...values });

const createStepRow = (values: { body: string } = { body: '' }): StepRow => ({
  id: crypto.randomUUID(),
  ...values,
});

/** 空でも 1 行は見せておく（いきなり「行を追加」を押させない） */
const withLeadingBlank = <T,>(rows: T[], createRow: () => T): T[] =>
  rows.length > 0 ? rows : [createRow()];

const Section = ({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {description !== undefined && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
    {children}
  </section>
);

/** 行の並べ替え・削除ボタン */
const RowActions = ({
  label,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  readonly label: string;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onRemove: () => void;
}) => (
  <div className="flex justify-end gap-1">
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`${label}を上へ移動`}
      disabled={isFirst}
      onClick={onMoveUp}
    >
      <ArrowUp />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`${label}を下へ移動`}
      disabled={isLast}
      onClick={onMoveDown}
    >
      <ArrowDown />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`${label}を削除`}
      onClick={onRemove}
    >
      <Trash2 />
    </Button>
  </div>
);

export const RecipeForm = ({
  initialValues,
  tagOptions,
  heading,
  submitLabel,
  onSubmit,
  onCancel,
}: RecipeFormProps) => {
  const fieldId = useId();
  const titleId = `${fieldId}-title`;
  const urlId = `${fieldId}-url`;
  const memoId = `${fieldId}-memo`;
  const tagDraftId = `${fieldId}-tag`;

  const [title, setTitle] = useState(initialValues.title);
  const [url, setUrl] = useState(initialValues.url);
  const [memo, setMemo] = useState(initialValues.memo);
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>(() =>
    withLeadingBlank(
      initialValues.ingredients.map((row) => createIngredientRow(row)),
      createIngredientRow,
    ),
  );
  const [stepRows, setStepRows] = useState<StepRow[]>(() =>
    withLeadingBlank(
      initialValues.steps.map((row) => createStepRow(row)),
      createStepRow,
    ),
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([
    ...initialValues.tagNames,
  ]);
  const [tagDraft, setTagDraft] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  // 既存タグと、この場で足したタグをまとめて選択肢にする
  const tagChoices = [...new Set([...tagOptions, ...selectedTags])].sort(
    (a, b) => a.localeCompare(b, 'ja'),
  );

  const updateIngredient = (id: string, values: Partial<IngredientRow>) =>
    setIngredientRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...values } : row)),
    );

  const removeIngredient = (id: string) =>
    setIngredientRows((rows) =>
      withLeadingBlank(
        rows.filter((row) => row.id !== id),
        createIngredientRow,
      ),
    );

  const updateStep = (id: string, body: string) =>
    setStepRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, body } : row)),
    );

  const removeStep = (id: string) =>
    setStepRows((rows) =>
      withLeadingBlank(
        rows.filter((row) => row.id !== id),
        createStepRow,
      ),
    );

  const toggleTag = (name: string) =>
    setSelectedTags((names) =>
      names.includes(name)
        ? names.filter((selected) => selected !== name)
        : [...names, name],
    );

  const addTagDraft = () => {
    const name = tagDraft.trim();

    if (name === '') {
      return;
    }

    setSelectedTags((names) =>
      names.includes(name) ? names : [...names, name],
    );
    setTagDraft('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = recipeInputSchema.safeParse({
      title,
      url,
      memo,
      ingredients: ingredientRows.map(({ name, amount }) => ({ name, amount })),
      steps: stepRows.map(({ body }) => ({ body })),
      tagNames: selectedTags,
    });

    if (!parsed.success) {
      const messageFor = (field: string) =>
        parsed.error.issues.find((issue) => issue.path[0] === field)?.message;
      const titleError = messageFor('title');
      const urlError = messageFor('url');

      setErrors({
        title: titleError,
        url: urlError,
        form:
          titleError === undefined && urlError === undefined
            ? '入力内容を確認してください。'
            : undefined,
      });

      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      // 成功した場合は遷移するため、この先には戻ってこない
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
      className="flex flex-col gap-8"
    >
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        {heading}
      </h1>

      <Section title="基本情報">
        <div className="flex flex-col gap-2">
          <Label htmlFor={titleId}>
            タイトル
            <span className="text-destructive text-xs">必須</span>
          </Label>
          <Input
            id={titleId}
            value={title}
            placeholder="例: 肉じゃが"
            autoComplete="off"
            aria-invalid={errors.title !== undefined}
            aria-describedby={
              errors.title === undefined ? undefined : `${titleId}-error`
            }
            onChange={(event) => setTitle(event.target.value)}
          />
          {errors.title !== undefined && (
            <p id={`${titleId}-error`} className="text-destructive text-xs">
              {errors.title}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={urlId}>URL</Label>
          <Input
            id={urlId}
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://example.com/recipe"
            autoComplete="off"
            aria-invalid={errors.url !== undefined}
            aria-describedby={
              errors.url === undefined ? undefined : `${urlId}-error`
            }
            onChange={(event) => setUrl(event.target.value)}
          />
          {errors.url !== undefined && (
            <p id={`${urlId}-error`} className="text-destructive text-xs">
              {errors.url}
            </p>
          )}
        </div>
      </Section>

      <Section
        title="材料"
        description="材料名だけでも保存できます。空の行は保存されません。"
      >
        <ul className="flex flex-col gap-2">
          {ingredientRows.map((row, index) => (
            <li
              key={row.id}
              className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3"
            >
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground w-5 shrink-0 pt-2.5 text-center text-xs tabular-nums">
                  {index + 1}
                </span>
                <div className="flex flex-1 gap-2">
                  <Input
                    value={row.name}
                    placeholder="材料名"
                    aria-label={`${index + 1} 番目の材料名`}
                    onChange={(event) =>
                      updateIngredient(row.id, { name: event.target.value })
                    }
                  />
                  <Input
                    value={row.amount}
                    placeholder="分量"
                    aria-label={`${index + 1} 番目の材料の分量`}
                    className="w-24 shrink-0"
                    onChange={(event) =>
                      updateIngredient(row.id, { amount: event.target.value })
                    }
                  />
                </div>
              </div>
              <RowActions
                label={`${index + 1} 番目の材料`}
                isFirst={index === 0}
                isLast={index === ingredientRows.length - 1}
                onMoveUp={() =>
                  setIngredientRows((rows) => moveItem(rows, index, 'up'))
                }
                onMoveDown={() =>
                  setIngredientRows((rows) => moveItem(rows, index, 'down'))
                }
                onRemove={() => removeIngredient(row.id)}
              />
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="self-start"
          onClick={() =>
            setIngredientRows((rows) => [...rows, createIngredientRow()])
          }
        >
          <Plus />
          材料を追加
        </Button>
      </Section>

      <Section title="手順" description="1 行に 1 工程を書きます。">
        <ol className="flex flex-col gap-2">
          {stepRows.map((row, index) => (
            <li
              key={row.id}
              className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3"
            >
              <div className="flex items-start gap-2">
                <span className="bg-secondary text-secondary-foreground mt-1 flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums">
                  {index + 1}
                </span>
                <Textarea
                  value={row.body}
                  rows={2}
                  placeholder="例: 玉ねぎを薄切りにする"
                  aria-label={`${index + 1} 番目の手順`}
                  onChange={(event) => updateStep(row.id, event.target.value)}
                />
              </div>
              <RowActions
                label={`${index + 1} 番目の手順`}
                isFirst={index === 0}
                isLast={index === stepRows.length - 1}
                onMoveUp={() =>
                  setStepRows((rows) => moveItem(rows, index, 'up'))
                }
                onMoveDown={() =>
                  setStepRows((rows) => moveItem(rows, index, 'down'))
                }
                onRemove={() => removeStep(row.id)}
              />
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="self-start"
          onClick={() => setStepRows((rows) => [...rows, createStepRow()])}
        >
          <Plus />
          手順を追加
        </Button>
      </Section>

      <Section title="タグ" description="タップで付け外しできます。">
        {tagChoices.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {tagChoices.map((name) => {
              const isSelected = selectedTags.includes(name);

              return (
                <li key={name}>
                  <Button
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    aria-pressed={isSelected}
                    onClick={() => toggleTag(name)}
                  >
                    {name}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor={tagDraftId}>新しいタグ</Label>
          <div className="flex gap-2">
            <Input
              id={tagDraftId}
              value={tagDraft}
              placeholder="例: 作り置き"
              autoComplete="off"
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter でフォームごと送信されないようにする
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTagDraft();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={tagDraft.trim() === ''}
              onClick={addTagDraft}
            >
              追加
            </Button>
          </div>
        </div>
      </Section>

      <Section title="メモ" description="コツやアレンジなど。">
        <Label htmlFor={memoId} className="sr-only">
          メモ
        </Label>
        <Textarea
          id={memoId}
          value={memo}
          rows={4}
          placeholder="例: 砂糖を少なめにするとちょうどよい"
          onChange={(event) => setMemo(event.target.value)}
        />
      </Section>

      {errors.form !== undefined && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {errors.form}
        </p>
      )}

      {/* 画面下端は共通シェルのタブバーが占めるので、操作ボタンは本文の末尾に置く */}
      <div className="border-border flex gap-3 border-t pt-5">
        <Button type="submit" size="lg" className="flex-1" disabled={isSaving}>
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
