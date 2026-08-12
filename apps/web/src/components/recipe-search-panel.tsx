import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

/**
 * レシピ一覧の絞り込み UI。
 *
 * 条件そのものは URL（＝親から渡る props）が持ち、ここは入力欄の下書きだけを持つ。
 * 打鍵のたびに再取得すると片手入力がもたつくので、手が止まってから URL へ反映する。
 */

/** 入力が止まってから URL に反映するまでの待ち時間（ms） */
const KEYWORD_DEBOUNCE_MS = 300;

type RecipeSearchPanelProps = {
  /** URL に載っているキーワード（未指定なら空文字） */
  readonly keyword: string;
  /** 選択中のタグ名 */
  readonly selectedTagNames: readonly string[];
  /** 選べるタグ名（自分のタグ。名前昇順で渡す） */
  readonly tagOptions: readonly string[];
  readonly onKeywordChange: (keyword: string) => void;
  readonly onTagToggle: (name: string) => void;
};

export const RecipeSearchPanel = ({
  keyword,
  selectedTagNames,
  tagOptions,
  onKeywordChange,
  onTagToggle,
}: RecipeSearchPanelProps) => {
  const keywordId = useId();
  const [draft, setDraft] = useState(keyword);
  /** 直近で URL へ渡したキーワード。外からの変更と自分の変更を見分けるために持つ */
  const committedRef = useRef(keyword);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingCommit = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = (value: string) => {
    cancelPendingCommit();
    committedRef.current = value;
    onKeywordChange(value);
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    cancelPendingCommit();
    timerRef.current = setTimeout(() => commit(value), KEYWORD_DEBOUNCE_MS);
  };

  // 戻る / 進むや「条件をクリア」で URL 側が変わったときは、入力欄を追従させる
  useEffect(() => {
    if (keyword === committedRef.current) {
      return;
    }

    committedRef.current = keyword;
    setDraft(keyword);
  }, [keyword]);

  // 画面を離れるときに予約を捨てる（外れた画面の URL を書き換えないように）
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // 検索キーで送信されたら待たずに反映する（ソフトキーボードもここで閉じる）
    event.preventDefault();
    commit(draft);
  };

  return (
    <search className="flex flex-col gap-3">
      <form onSubmit={handleSubmit}>
        <Label htmlFor={keywordId} className="sr-only">
          キーワードで探す
        </Label>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id={keywordId}
            type="search"
            value={draft}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="材料・メモも含めて探す"
            onChange={(event) => handleDraftChange(event.target.value)}
            className="h-11 pr-10 pl-9"
          />
          {draft !== '' && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="キーワードを消す"
              onClick={() => {
                setDraft('');
                commit('');
              }}
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
            >
              <X />
            </Button>
          )}
        </div>
      </form>

      {tagOptions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {tagOptions.map((name) => {
            const isSelected = selectedTagNames.includes(name);

            return (
              <li key={name}>
                <Button
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={isSelected}
                  onClick={() => onTagToggle(name)}
                >
                  {name}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </search>
  );
};
