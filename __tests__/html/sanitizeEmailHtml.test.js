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

test('keeps http/https/mailto links but drops javascript: hrefs', () => {
  const out = sanitizeEmailHtml(
    '<a href="http://ex.com">a</a><a href="https://ex.com">b</a>' +
      '<a href="mailto:x@y.com">c</a><a href="javascript:evil()">d</a>',
    {allowRemote: false},
  );
  expect(out).toContain('href="http://ex.com"');
  expect(out).toContain('href="https://ex.com"');
  expect(out).toContain('href="mailto:x@y.com"');
  expect(out).not.toMatch(/javascript:/i);
});

test('emits a Content-Security-Policy that gates remote loads on allowRemote', () => {
  const blocked = sanitizeEmailHtml('<p>x</p>', {allowRemote: false});
  expect(blocked).toContain('Content-Security-Policy');
  expect(blocked).toContain('img-src cidcache: data:');
  expect(blocked).not.toContain('img-src cidcache: data: https:');
  const allowed = sanitizeEmailHtml('<p>x</p>', {allowRemote: true});
  expect(allowed).toContain('img-src cidcache: data: https:');
});

test('CSP locks down base-uri, object-src, form-action and remote fonts', () => {
  const out = sanitizeEmailHtml('<p>hi</p>', {allowRemote: true});
  expect(out).toMatch(/base-uri 'none'/);
  expect(out).toMatch(/object-src 'none'/);
  expect(out).toMatch(/form-action 'none'/);
  // Even when remote is allowed, fonts stay data:-only (no remote @font-face exfil).
  expect(out).toContain('font-src data:;');
  expect(out).not.toContain('font-src data: https:');
});

test('blanks a remote img whose src has leading whitespace (no CSP-only reliance)', () => {
  const out = sanitizeEmailHtml('<img src="   https://tracker/x.gif">', {allowRemote: false});
  expect(out).not.toContain('tracker/x.gif');
});
