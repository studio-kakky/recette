/** 未ログイン時に `/login` へ引き継ぐ復帰先のクエリパラメータ名 */
export const REDIRECT_SEARCH_PARAM = 'redirect';

/** 復帰先が使えないときの行き先 */
export const DEFAULT_REDIRECT = '/';

/**
 * 相対パスの解決に使うだけのダミーオリジン。
 * サニタイズ後もこのオリジンのままなら「同一オリジンの相対パス」と判断できる。
 */
const PLACEHOLDER_ORIGIN = 'http://redirect.invalid';

/** URL として解釈できなければ `null` を返す（例外を投げない `new URL()`） */
const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
};

/**
 * `?redirect=` で渡された復帰先を、同一オリジンの相対パスだけに絞り込む。
 *
 * クエリは誰でも書き換えられるため、そのまま `callbackURL` や `redirect()` に
 * 渡すとオープンリダイレクトになる。`/` 始まりの相対パス以外
 * （絶対 URL・`//evil.example` のようなプロトコル相対 URL・`javascript:` など）は
 * すべて {@link DEFAULT_REDIRECT} に落とす。
 *
 * @example
 * sanitizeRedirect('/recipes?q=curry'); // → '/recipes?q=curry'
 * sanitizeRedirect('//evil.example'); // → '/'
 * sanitizeRedirect('https://evil.example'); // → '/'
 */
export const sanitizeRedirect = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_REDIRECT;

  // ブラウザは URL 前後の空白や制御文字を無視するため、判定前に取り除く
  const candidate = value.trim();

  // `/` 始まりのパスのみ許可する（`//` と `/\` はホスト指定として解釈されうる）
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.startsWith('/\\')
  ) {
    return DEFAULT_REDIRECT;
  }

  const url = parseUrl(candidate);

  // `\` が `/` に正規化されるなどして別オリジンに化けていないか最終確認する
  if (!url || url.origin !== PLACEHOLDER_ORIGIN) return DEFAULT_REDIRECT;

  const path = `${url.pathname}${url.search}${url.hash}`;

  return path.startsWith('//') ? DEFAULT_REDIRECT : path;
};
