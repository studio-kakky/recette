import { notFound } from '@tanstack/react-router';

import { CookLogNotFoundError } from './cook-log-service';
import { ImageAccessDeniedError } from './image-service';
import { RecipeNotFoundError } from './recipe-service';

/**
 * 見つからない / 他人のものは、存在を伏せて 404 として返す。
 *
 * 他人の画像キーを添えて保存しようとした場合（改ざんされたリクエスト）も、
 * 同じく「無い」として扱う。Server Function の `.catch()` にそのまま渡して使う。
 */
export const toNotFound = (error: unknown): never => {
  if (
    error instanceof RecipeNotFoundError ||
    error instanceof CookLogNotFoundError ||
    error instanceof ImageAccessDeniedError
  ) {
    throw notFound();
  }

  throw error;
};
