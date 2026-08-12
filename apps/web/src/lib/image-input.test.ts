import { describe, expect, it } from 'vitest';

import { MAX_IMAGE_BYTES, validateImageUpload } from './image-input';

describe('validateImageUpload', () => {
  it('画像は受け付ける', () => {
    expect(validateImageUpload({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validateImageUpload({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validateImageUpload({ type: 'image/heic', size: 1024 })).toBeNull();
  });

  it('パラメータ付きの content-type も受け付ける', () => {
    expect(
      validateImageUpload({ type: 'IMAGE/JPEG; charset=binary', size: 1024 }),
    ).toBeNull();
  });

  it('画像以外を拒否する', () => {
    expect(
      validateImageUpload({ type: 'application/pdf', size: 1024 }),
    ).not.toBeNull();
    expect(
      validateImageUpload({ type: 'text/html', size: 1024 }),
    ).not.toBeNull();
    expect(validateImageUpload({ type: '', size: 1024 })).not.toBeNull();
  });

  it('SVG を拒否する（自オリジンから返すとスクリプトが動くため）', () => {
    expect(
      validateImageUpload({ type: 'image/svg+xml', size: 1024 }),
    ).not.toBeNull();
  });

  it('空のファイルを拒否する', () => {
    expect(validateImageUpload({ type: 'image/jpeg', size: 0 })).not.toBeNull();
  });

  it('上限を超えるサイズを拒否する', () => {
    expect(
      validateImageUpload({ type: 'image/jpeg', size: MAX_IMAGE_BYTES }),
    ).toBeNull();
    expect(
      validateImageUpload({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }),
    ).not.toBeNull();
  });
});
