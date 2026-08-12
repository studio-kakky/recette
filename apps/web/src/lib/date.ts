/**
 * 日付だけの値（`YYYY-MM-DD`）の判定・組み立て・表示。
 *
 * 「作った日」は時刻を持たない値なので、Date に載せて持ち回るとタイムゾーンで
 * 1 日ずれる。文字列のまま扱い、Date を経由するのは「今日」を求めるときと
 * 曜日を求めるときだけにする（曜日は UTC 固定で求めるのでずれない）。
 */

/** `YYYY-MM-DD` の形。桁数まで固定して、辞書順 = 時系列順を保つ */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

/** `YYYY-MM-DD` を年・月・日に分解する。形が違う / 実在しない日付なら `null` */
const parseDateString = (
  value: string,
): { year: number; month: number; day: number } | null => {
  const matched = DATE_PATTERN.exec(value);

  if (!matched) {
    return null;
  }

  const [, year, month, day] = matched;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
  // 2 月 30 日のような日付は Date が翌月に繰り上げてしまうので、戻した値と突き合わせる
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));

  return date.getUTCFullYear() === parsed.year &&
    date.getUTCMonth() === parsed.month - 1 &&
    date.getUTCDate() === parsed.day
    ? parsed
    : null;
};

/** 実在する日付を指す `YYYY-MM-DD` かどうか */
export const isDateString = (value: string): boolean =>
  parseDateString(value) !== null;

/**
 * Date をローカル時刻の `YYYY-MM-DD` にする。
 *
 * `<input type="date">` の値や「今日」の初期値に使う。サーバーはタイムゾーンを
 * 持たないので、この変換は必ずブラウザ側で行う。
 */
export const toDateInputValue = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * 画面に出す形にする。
 *
 * @example
 * formatDateLabel('2026-08-13'); // '2026年8月13日（木）'
 */
export const formatDateLabel = (value: string): string => {
  const parsed = parseDateString(value);

  if (!parsed) {
    // 表示のためだけの関数なので、読めない値は握りつぶさずそのまま出す
    return value;
  }

  const { year, month, day } = parsed;
  const weekday =
    WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  return `${year}年${month}月${day}日（${weekday}）`;
};
