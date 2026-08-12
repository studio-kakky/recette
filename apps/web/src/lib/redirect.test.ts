import { describe, expect, it } from 'vitest';

import { DEFAULT_REDIRECT, sanitizeRedirect } from './redirect';

describe('sanitizeRedirect', () => {
  it('同一オリジンの相対パスはそのまま通す', () => {
    expect(sanitizeRedirect('/')).toBe('/');
    expect(sanitizeRedirect('/recipes')).toBe('/recipes');
    expect(sanitizeRedirect('/recipes/1')).toBe('/recipes/1');
  });

  it('クエリとハッシュを保持する', () => {
    expect(sanitizeRedirect('/recipes?q=curry#top')).toBe(
      '/recipes?q=curry#top',
    );
  });

  it('前後の空白を取り除いてから判定する', () => {
    expect(sanitizeRedirect('  /recipes  ')).toBe('/recipes');
    expect(sanitizeRedirect('\n\t/recipes')).toBe('/recipes');
  });

  it('絶対 URL は既定の行き先に落とす', () => {
    expect(sanitizeRedirect('https://evil.example/steal')).toBe(
      DEFAULT_REDIRECT,
    );
    expect(sanitizeRedirect('http://localhost:3000/')).toBe(DEFAULT_REDIRECT);
  });

  it('プロトコル相対 URL は既定の行き先に落とす', () => {
    expect(sanitizeRedirect('//evil.example')).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect('///evil.example')).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect('  //evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('バックスラッシュでホストを偽装する URL は既定の行き先に落とす', () => {
    expect(sanitizeRedirect('/\\evil.example')).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect('\\\\evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('スキーム付きの文字列は既定の行き先に落とす', () => {
    expect(sanitizeRedirect('javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect('data:text/html,<script></script>')).toBe(
      DEFAULT_REDIRECT,
    );
    expect(sanitizeRedirect('mailto:someone@example.com')).toBe(
      DEFAULT_REDIRECT,
    );
  });

  it('相対パス（`/` 始まりでないもの）は既定の行き先に落とす', () => {
    expect(sanitizeRedirect('recipes')).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect('../recipes')).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect('')).toBe(DEFAULT_REDIRECT);
  });

  it('文字列以外は既定の行き先に落とす', () => {
    expect(sanitizeRedirect(undefined)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect(null)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect(['/recipes'])).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect(42)).toBe(DEFAULT_REDIRECT);
  });
});
