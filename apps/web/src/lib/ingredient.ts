/**
 * 材料の分量。
 *
 * - `quantity`: 「1個」「200g」のように数値と単位で表せるもの
 * - `note`: 「適量」「少々」のように数値で表せないもの
 */
export type IngredientAmount =
  | { readonly type: 'quantity'; readonly value: number; readonly unit: string }
  | { readonly type: 'note'; readonly text: string };

const formatQuantity = (value: number): string =>
  // 1.0 → "1"、0.50 → "0.5" のように余分な 0 を落とす
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const formatAmount = (amount: IngredientAmount): string =>
  amount.type === 'quantity'
    ? `${formatQuantity(amount.value)}${amount.unit}`
    : amount.text.trim();

/**
 * 材料行に表示するラベルを組み立てる。
 *
 * @example
 * formatIngredientLabel('玉ねぎ', { type: 'quantity', value: 1, unit: '個' }); // '玉ねぎ 1個'
 * formatIngredientLabel('塩', { type: 'note', text: '少々' }); // '塩 少々'
 * formatIngredientLabel('こしょう'); // 'こしょう'
 */
export const formatIngredientLabel = (
  name: string,
  amount?: IngredientAmount,
): string => {
  const trimmedName = name.trim();
  if (trimmedName === '') {
    throw new Error('材料名が空です');
  }

  const formattedAmount = amount === undefined ? '' : formatAmount(amount);

  return formattedAmount === ''
    ? trimmedName
    : `${trimmedName} ${formattedAmount}`;
};
