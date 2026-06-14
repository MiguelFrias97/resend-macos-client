import {sanitizeEmailHtml} from '../../src/html/sanitizeEmailHtml';

test('strips script and event handlers', () => {
  const out = sanitizeEmailHtml('<p onclick="x()">hi</p><script>evil()</script>', {allowRemote: false});
  expect(out).not.toMatch(/<script/i);
  expect(out).not.toContain('evil()');
  expect(out).not.toMatch(/onclick/i);
});

test('rewrites cid: image refs to the cidcache scheme', () => {
  const out = sanitizeEmailHtml('<img src="cid:logo123">', {allowRemote: false});
  expect(out).toContain('cidcache://logo123');
});

test('blocks remote images when allowRemote is false but keeps them when true', () => {
  const blocked = sanitizeEmailHtml('<img src="https://tracker/x.gif">', {allowRemote: false});
  expect(blocked).not.toContain('https://tracker/x.gif');
  const allowed = sanitizeEmailHtml('<img src="https://tracker/x.gif">', {allowRemote: true});
  expect(allowed).toContain('https://tracker/x.gif');
});

test('strips remote url() in inline style (CSS tracker bypass)', () => {
  const out = sanitizeEmailHtml(
    '<div style="background:url(http://tracker/css.gif)">hi</div>',
    {allowRemote: false},
  );
  expect(out).not.toContain('tracker/css.gif');
});

test('drops embedded <style> blocks entirely', () => {
  const out = sanitizeEmailHtml(
    '<style>div{background:url(http://tracker/sheet.gif)}</style><div>hi</div>',
    {allowRemote: false},
  );
  expect(out).not.toMatch(/<style/i);
  expect(out).not.toContain('tracker/sheet.gif');
});

test('emits a Content-Security-Policy that gates remote loads on allowRemote', () => {
  const blocked = sanitizeEmailHtml('<p>x</p>', {allowRemote: false});
  expect(blocked).toContain('Content-Security-Policy');
  expect(blocked).toContain('img-src cidcache: data:');
  expect(blocked).not.toContain('img-src cidcache: data: https:');
  const allowed = sanitizeEmailHtml('<p>x</p>', {allowRemote: true});
  expect(allowed).toContain('img-src cidcache: data: https:');
});
