import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Trash2,
} from 'lucide-react';

import { Button } from '~/components/ui/button';

/**
 * 行の並べ替え・削除ボタン。
 *
 * 縦に積む材料・手順は上下の矢印、横に並べる写真は左右の矢印で示す。
 * 並べ替えはモバイルでも押しやすいボタンで行う（ドラッグは使わない）。
 */
export const RowActions = ({
  label,
  isFirst,
  isLast,
  orientation = 'vertical',
  isRemoveDisabled = false,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  readonly label: string;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly orientation?: 'vertical' | 'horizontal';
  /** 消せない行（作った記録の最後の 1 枚など）でボタンを止める */
  readonly isRemoveDisabled?: boolean;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onRemove: () => void;
}) => {
  const isVertical = orientation === 'vertical';
  const MoveUpIcon = isVertical ? ArrowUp : ArrowLeft;
  const MoveDownIcon = isVertical ? ArrowDown : ArrowRight;

  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`${label}を${isVertical ? '上' : '前'}へ移動`}
        disabled={isFirst}
        onClick={onMoveUp}
      >
        <MoveUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`${label}を${isVertical ? '下' : '後ろ'}へ移動`}
        disabled={isLast}
        onClick={onMoveDown}
      >
        <MoveDownIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`${label}を削除`}
        disabled={isRemoveDisabled}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
};
