import {collectInlineImages} from '../../src/editor/collectInlineImages';

test('extracts image blocks with their cid + bytes', () => {
  const imgs = collectInlineImages({
    blocks: [
      {type: 'paragraph', spans: [{text: 'hi'}]},
      {
        type: 'image',
        contentId: 'img_1',
        filename: 'p.png',
        contentType: 'image/png',
        base64: 'AAAA',
      },
    ],
  });
  expect(imgs).toEqual([
    {contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'},
  ]);
});

test('returns [] when there are no images', () => {
  expect(collectInlineImages({blocks: [{type: 'paragraph', spans: []}]})).toEqual(
    [],
  );
});

test('caps inline image count, per-image size, and skips oversized', () => {
  const {collectInlineImages, MAX_INLINE_IMAGES} = require('../../src/editor/collectInlineImages');
  const big = 'A'.repeat(7 * 1024 * 1024); // > per-image cap
  const small = 'B'.repeat(100);
  const blocks = [{type: 'image', base64: big, contentId: 'big'}];
  for (let i = 0; i < 30; i++) blocks.push({type: 'image', base64: small, contentId: `s${i}`});
  const out = collectInlineImages({blocks});
  expect(out.length).toBeLessThanOrEqual(MAX_INLINE_IMAGES);
  expect(out.find(i => i.contentId === 'big')).toBeUndefined(); // oversized dropped
});
