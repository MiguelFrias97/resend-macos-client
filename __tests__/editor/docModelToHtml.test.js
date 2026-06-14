import {docModelToHtml} from '../../src/editor/docModelToHtml';

test('renders bold/italic/underline spans', () => {
  const html = docModelToHtml({
    blocks: [
      {
        type: 'paragraph',
        spans: [
          {text: 'a', bold: true},
          {text: 'b', italic: true},
          {text: 'c', underline: true},
        ],
      },
    ],
  });
  expect(html).toBe('<p><b>a</b><i>b</i><u>c</u></p>');
});

test('renders a link and escapes text + attributes', () => {
  const html = docModelToHtml({
    blocks: [
      {
        type: 'paragraph',
        spans: [
          {text: 'click', href: 'https://x.com/?a=1&b=2'},
          {text: ' <evil>'},
        ],
      },
    ],
  });
  expect(html).toBe(
    '<p><a href="https://x.com/?a=1&amp;b=2">click</a> &lt;evil&gt;</p>',
  );
});

test('renders unordered and ordered lists', () => {
  const html = docModelToHtml({
    blocks: [
      {type: 'list', ordered: false, items: [[{text: 'one'}], [{text: 'two'}]]},
      {type: 'list', ordered: true, items: [[{text: 'x'}]]},
    ],
  });
  expect(html).toBe('<ul><li>one</li><li>two</li></ul><ol><li>x</li></ol>');
});

test('renders an inline image as a cid reference', () => {
  const html = docModelToHtml({
    blocks: [
      {
        type: 'image',
        contentId: 'img_1',
        filename: 'p.png',
        contentType: 'image/png',
        base64: 'AAAA',
      },
    ],
  });
  expect(html).toBe('<p><img src="cid:img_1"></p>');
});

test('drops a javascript: href but keeps the text', () => {
  const html = docModelToHtml({
    blocks: [
      {type: 'paragraph', spans: [{text: 'x', href: 'javascript:evil()'}]},
    ],
  });
  expect(html).toBe('<p>x</p>');
});
