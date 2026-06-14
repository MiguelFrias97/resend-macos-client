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
