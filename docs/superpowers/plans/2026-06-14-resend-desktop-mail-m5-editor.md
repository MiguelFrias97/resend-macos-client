# Resend Desktop Mail — M5 Rich-Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native macOS rich-text editor (NSTextView) supporting bold/italic/underline, bulleted & numbered lists, links, and drag-and-drop inline images — producing clean, email-safe HTML plus the inline image attachment parts. The editor is built and demoed in isolation; M6 wires it into the reply/compose send pipeline.

**Architecture:** The native `RichEditorView` walks its `NSAttributedString` style runs and emits a small **JSON document model** (`{blocks:[…]}`). A **pure-JS layer** converts that model to email HTML (`docModelToHtml`) and extracts inline images (`collectInlineImages`). This isolates the risky serialization logic into a fully unit-testable JS layer behind a thin native "attributed-string → model" reader. Formatting is driven by JS toolbar buttons dispatching commands to the native view.

**Tech Stack:** react-native-macos 0.81 (New Architecture), plain JavaScript, Swift (NSTextView + drag/drop + run walking), Jest + XCTest, sanitize-html (reuse from M3 for output safety).

**Reference spec:** `docs/superpowers/specs/2026-06-12-resend-desktop-mail-design.md` (§8, §9 editor).

**Branch:** `build/m5-editor` (off `main`, which contains merged M0–M3).

## Document model (shared native ⇄ JS contract)

```jsonc
{
  "blocks": [
    { "type": "paragraph", "spans": [ {"text": "Hello ", "bold": true}, {"text": "world"} ] },
    { "type": "list", "ordered": false,
      "items": [ [ {"text": "one"} ], [ {"text": "two", "italic": true} ] ] },
    { "type": "image", "contentId": "img_1", "filename": "photo.png",
      "contentType": "image/png", "base64": "<bytes>" }
  ]
}
```
- **span:** `{ text: string, bold?: bool, italic?: bool, underline?: bool, href?: string }`
- **block types:** `paragraph` (spans), `list` (ordered + items, each item a span array), `image` (inline image → `cid:`).

---

## File structure (this milestone)

```
src/editor/docModelToHtml.js     # NEW — JSON doc model → email HTML (pure JS)
src/editor/collectInlineImages.js# NEW — extract inline images from the model
src/native/RichEditorView.js     # NEW — JS wrapper + command helpers for the native editor
src/ui/Composer.js               # NEW — editor + formatting toolbar (demo surface for M5)
src/ui/ComposeScratchScreen.js   # NEW — temporary screen to exercise the editor (removed/repurposed in M6)
macos/ResendMail-macOS/RichEditorView.swift / .m   # native NSTextView editor + commands + serialize
__tests__/editor/*               # docModelToHtml, collectInlineImages
__tests__/ui/Composer.test.js
```

---

### Task 1: `docModelToHtml` — model → email HTML (pure JS)

**Files:** Create `src/editor/docModelToHtml.js`, `__tests__/editor/docModelToHtml.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
// __tests__/editor/docModelToHtml.test.js
import {docModelToHtml} from '../../src/editor/docModelToHtml';

test('renders bold/italic/underline spans', () => {
  const html = docModelToHtml({
    blocks: [{type: 'paragraph', spans: [
      {text: 'a', bold: true}, {text: 'b', italic: true}, {text: 'c', underline: true},
    ]}],
  });
  expect(html).toBe('<p><b>a</b><i>b</i><u>c</u></p>');
});

test('renders a link and escapes text + attributes', () => {
  const html = docModelToHtml({
    blocks: [{type: 'paragraph', spans: [
      {text: 'click', href: 'https://x.com/?a=1&b=2'},
      {text: ' <evil>'},
    ]}],
  });
  expect(html).toBe('<p><a href="https://x.com/?a=1&amp;b=2">click</a> &lt;evil&gt;</p>');
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
    blocks: [{type: 'image', contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'}],
  });
  expect(html).toBe('<p><img src="cid:img_1"></p>');
});

test('drops a javascript: href but keeps the text', () => {
  const html = docModelToHtml({
    blocks: [{type: 'paragraph', spans: [{text: 'x', href: 'javascript:evil()'}]}],
  });
  expect(html).toBe('<p>x</p>');
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest editor/docModelToHtml -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/editor/docModelToHtml.js
function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}

function safeHref(href) {
  // Only http/https/mailto are allowed; everything else (javascript:, data:) is dropped.
  return /^(https?:|mailto:)/i.test(href || '') ? href : null;
}

function spanToHtml(span) {
  let inner = escapeText(span.text);
  if (span.bold) inner = `<b>${inner}</b>`;
  if (span.italic) inner = `<i>${inner}</i>`;
  if (span.underline) inner = `<u>${inner}</u>`;
  const href = safeHref(span.href);
  if (href) inner = `<a href="${escapeAttr(href)}">${inner}</a>`;
  return inner;
}

function spansToHtml(spans) {
  return (spans || []).map(spanToHtml).join('');
}

function blockToHtml(block) {
  switch (block.type) {
    case 'paragraph':
      return `<p>${spansToHtml(block.spans)}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = (block.items || []).map(item => `<li>${spansToHtml(item)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'image':
      return `<p><img src="cid:${escapeAttr(block.contentId)}"></p>`;
    default:
      return '';
  }
}

export function docModelToHtml(model) {
  if (!model || !Array.isArray(model.blocks)) return '';
  return model.blocks.map(blockToHtml).join('');
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest editor/docModelToHtml -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: doc-model to email HTML serializer"`

---

### Task 2: `collectInlineImages` (pure JS)

**Files:** Create `src/editor/collectInlineImages.js`, `__tests__/editor/collectInlineImages.test.js`.

- [ ] **Step 1: Write failing test**

```javascript
// __tests__/editor/collectInlineImages.test.js
import {collectInlineImages} from '../../src/editor/collectInlineImages';

test('extracts image blocks with their cid + bytes', () => {
  const imgs = collectInlineImages({
    blocks: [
      {type: 'paragraph', spans: [{text: 'hi'}]},
      {type: 'image', contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'},
    ],
  });
  expect(imgs).toEqual([
    {contentId: 'img_1', filename: 'p.png', contentType: 'image/png', base64: 'AAAA'},
  ]);
});

test('returns [] when there are no images', () => {
  expect(collectInlineImages({blocks: [{type: 'paragraph', spans: []}]})).toEqual([]);
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest editor/collectInlineImages -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/editor/collectInlineImages.js
export function collectInlineImages(model) {
  if (!model || !Array.isArray(model.blocks)) return [];
  return model.blocks
    .filter(b => b.type === 'image')
    .map(b => ({
      contentId: b.contentId,
      filename: b.filename,
      contentType: b.contentType,
      base64: b.base64,
    }));
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest editor/collectInlineImages -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: inline-image extraction from doc model"`

---

### Task 3: Native `RichEditorView` — editable NSTextView

**Files:** Create `macos/ResendMail-macOS/RichEditorView.swift`, `RichEditorView.m`, `src/native/RichEditorView.js`. Modify pbxproj (xcodeproj gem). Test `__tests__/native/RichEditorView.contract.test.js`.

- [ ] **Step 1: JS wrapper contract test (RED)**

```javascript
// __tests__/native/RichEditorView.contract.test.js
jest.mock('react-native', () => ({
  requireNativeComponent: name => name,
  UIManager: {getViewManagerConfig: () => ({Commands: {}})},
}));
import RichEditorView from '../../src/native/RichEditorView';
test('exports a native component', () => {
  expect(RichEditorView.Component || RichEditorView).toBeDefined();
});
```

- [ ] **Step 2: JS wrapper (GREEN)**

```javascript
// src/native/RichEditorView.js
import {requireNativeComponent} from 'react-native';
// Props: onChange (event: {nativeEvent:{model}}) emitted as the user edits.
// Commands are dispatched via the native module (see RichEditorCommands in a later task).
const RichEditorView = requireNativeComponent('RichEditorView');
export default RichEditorView;
```

- [ ] **Step 3: Native view manager** `RichEditorView.swift`:
  - `@objc(RichEditorViewManager) class RichEditorViewManager: RCTViewManager` returning a `RichEditorNSView` from `view()`; `requiresMainQueueSetup() -> true`.
  - `RichEditorNSView: NSView` hosting an editable `NSTextView` inside an `NSScrollView`. Rich text enabled (`isRichText = true`, `isEditable = true`, `allowsImageEditing = true`, `importsGraphics = true` so image drops are accepted).
  - Expose `@objc var onChange: RCTBubblingEventBlock?`. On `NSText.didChangeNotification`, serialize (Task 5) and fire `onChange(["model": modelDict])`.
  - `.m` bridge: `RCT_EXTERN_MODULE(RichEditorViewManager, RCTViewManager)` + `RCT_EXPORT_VIEW_PROPERTY(onChange, RCTBubblingEventBlock)`.
  - Wire both into the target via the xcodeproj gem.

- [ ] **Step 4: Build**  Run (Node 22, PATH includes /opt/homebrew/bin): `xcodebuild -workspace macos/ResendMail.xcworkspace -scheme ResendMail-macOS -configuration Debug build` → `** BUILD SUCCEEDED **` with RichEditorView.swift compiled. Run `npx jest` green.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: native NSTextView RichEditorView (editable)"`

---

### Task 4: Native formatting commands

**Files:** Modify `RichEditorView.swift` / `.m`; create a `RichEditorCommands` native module OR expose view-manager commands; update `src/native/RichEditorView.js`.

- [ ] **Step 1: Implement formatting commands** on the focused `NSTextView`. Add a native module `@objc(RichEditor) class RichEditor: NSObject` (a plain RCTBridgeModule, not the view) with promise/void methods that act on the key window's first responder if it's our `NSTextView` (or hold a weak ref to the active editor view):
  - `toggleBold` / `toggleItalic` / `toggleUnderline` → apply/remove the trait on the selected range (use `NSFontManager` for bold/italic; `.underlineStyle` attribute for underline).
  - `insertList(ordered: Bool)` → wrap the selected paragraphs in a list (apply an `NSTextList` to the paragraph style).
  - `setLink(url: String)` → add `.link` attribute over the selection.
  Bridge each with `RCT_EXTERN_METHOD`.
- [ ] **Step 2: JS command helpers** in `src/native/RichEditorView.js`:

```javascript
import {NativeModules} from 'react-native';
const {RichEditor} = NativeModules;
export const commands = {
  bold: () => RichEditor.toggleBold(),
  italic: () => RichEditor.toggleItalic(),
  underline: () => RichEditor.toggleUnderline(),
  bulletList: () => RichEditor.insertList(false),
  numberList: () => RichEditor.insertList(true),
  link: url => RichEditor.setLink(url),
};
```

- [ ] **Step 3: Build + manual check.** Build succeeds; a manual run can confirm bold/italic toggle on selected text. `npx jest` green (the command helpers are exercised by the Composer test in Task 7 with a mocked NativeModules).
- [ ] **Step 4: Commit**  `git add -A && git commit -m "feat: native rich-editor formatting commands"`

---

### Task 5: Native serialize — attributed string → doc model

**Files:** Modify `RichEditorView.swift`.

- [ ] **Step 1: Implement `serializeModel()`** that walks the `NSTextView.textStorage`:
  - Enumerate paragraphs. For each paragraph, if it carries an `NSTextList`, accumulate into a `list` block (ordered if the list marker format is decimal); otherwise a `paragraph` block.
  - Within a paragraph, enumerate attribute runs → spans: `bold`/`italic` from the font's symbolic traits, `underline` from `.underlineStyle`, `href` from `.link`.
  - For `NSTextAttachment` runs holding an image: produce an `image` block — generate a stable `contentId` (e.g. `img_<n>`), read the attachment's image data as PNG/JPEG bytes, base64-encode, infer `contentType`/`filename`.
  - Return an `[String: Any]` dict matching the document-model schema; fire it via `onChange`.
- [ ] **Step 2: Build** → SUCCEEDED. (Runtime correctness of the walk is verified manually in Task 7; the JS `docModelToHtml`/`collectInlineImages` already have unit coverage for the model→output direction.)
- [ ] **Step 3: Commit**  `git add -A && git commit -m "feat: serialize NSTextView content to doc model"`

---

### Task 6: Native drag-and-drop inline images

**Files:** Modify `RichEditorView.swift`.

- [ ] **Step 1: Accept image drops.** With `importsGraphics = true` and `allowsImageEditing = true`, `NSTextView` accepts dropped images as `NSTextAttachment`. Verify the dropped image becomes an attachment run that `serializeModel()` (Task 5) turns into an `image` block. If the default drop doesn't produce a usable attachment, override `readSelection(from:)` / register `NSImage` pasteboard types and insert an `NSTextAttachment` whose `fileWrapper` carries the bytes + a generated filename.
- [ ] **Step 2: Ensure each inline image gets a unique `contentId`** assigned at serialize time (stable within one serialization), with bytes base64-encoded so M6 can attach them.
- [ ] **Step 3: Build** → SUCCEEDED.
- [ ] **Step 4: Commit**  `git add -A && git commit -m "feat: drag-and-drop inline images in the rich editor"`

---

### Task 7: `Composer` UI (editor + toolbar) + scratch screen

**Files:** Create `src/ui/Composer.js`, `src/ui/ComposeScratchScreen.js`, `__tests__/ui/Composer.test.js`.

- [ ] **Step 1: Composer component test (RED)**

```javascript
// __tests__/ui/Composer.test.js
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';

const bold = jest.fn();
jest.mock('../../src/native/RichEditorView', () => ({
  __esModule: true,
  default: 'RichEditorView',
  commands: {bold, italic: jest.fn(), underline: jest.fn(), bulletList: jest.fn(), numberList: jest.fn(), link: jest.fn()},
}));

import Composer from '../../src/ui/Composer';

test('tapping Bold dispatches the bold command and onChange surfaces html+images', () => {
  const onChange = jest.fn();
  const {getByLabelText, UNSAFE_getByType} = render(<Composer onChange={onChange} />);
  fireEvent.press(getByLabelText('Bold'));
  expect(bold).toHaveBeenCalled();
  // Simulate the native editor emitting a model.
  const view = UNSAFE_getByType('RichEditorView');
  view.props.onChange({
    nativeEvent: {model: {blocks: [{type: 'paragraph', spans: [{text: 'hi', bold: true}]}]}},
  });
  expect(onChange).toHaveBeenCalledWith({
    html: '<p><b>hi</b></p>',
    inlineImages: [],
  });
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/Composer -i`  Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/Composer.js`**

```javascript
import React from 'react';
import {View, Pressable, Text} from 'react-native';
import RichEditorView, {commands} from '../native/RichEditorView';
import {docModelToHtml} from '../editor/docModelToHtml';
import {collectInlineImages} from '../editor/collectInlineImages';

function ToolbarButton({label, onPress, children}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={{paddingVertical: 4, paddingHorizontal: 10, marginRight: 4}}>
      <Text>{children}</Text>
    </Pressable>
  );
}

export default function Composer({onChange}) {
  const handleNativeChange = e => {
    const model = e.nativeEvent.model;
    if (onChange) {
      onChange({html: docModelToHtml(model), inlineImages: collectInlineImages(model)});
    }
  };
  return (
    <View style={{flex: 1}}>
      <View style={{flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#eee'}}>
        <ToolbarButton label="Bold" onPress={commands.bold}>B</ToolbarButton>
        <ToolbarButton label="Italic" onPress={commands.italic}>i</ToolbarButton>
        <ToolbarButton label="Underline" onPress={commands.underline}>U</ToolbarButton>
        <ToolbarButton label="Bulleted list" onPress={commands.bulletList}>•</ToolbarButton>
        <ToolbarButton label="Numbered list" onPress={commands.numberList}>1.</ToolbarButton>
      </View>
      <RichEditorView style={{flex: 1}} onChange={handleNativeChange} />
    </View>
  );
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/Composer -i`  Expected: PASS.

- [ ] **Step 5: Scratch screen to exercise the editor.** Create `src/ui/ComposeScratchScreen.js` rendering `<Composer onChange={...}>` and showing the produced HTML length / image count, so M5 can be run manually. Temporarily add a way to reach it (e.g. a toolbar "Compose" button in `InboxScreen` that opens it as a sheet). Note in the file header that M6 replaces this with the real reply/compose surface.

- [ ] **Step 6: Full suite + lint + build.** `npx jest` green, `npx eslint .` 0 errors, macOS build SUCCEEDED.

- [ ] **Step 7: Manual smoke.** Run the app, open the scratch composer, type text, toggle bold/italic/underline, make a list, drop an image; confirm the emitted HTML looks correct and the image appears as a `cid:` with a collected inline image. Document results.

- [ ] **Step 8: Commit**  `git add -A && git commit -m "feat: Composer (rich editor + toolbar) + scratch screen"`

---

## Self-review notes (addressed)

- **Spec coverage (M5):** native NSTextView editor ✓, bold/italic/underline ✓, lists ✓, links ✓, drag-drop inline images → cid + attachment bytes ✓, custom run-based serialization (native runs → model; JS model → HTML) ✓. Wiring to the actual send happens in M6.
- **Testability:** the serialization correctness that matters for email output (model → HTML, image extraction, href safety, escaping) lives in pure-JS units with full coverage; the native run-walk is verified by the Task 7 manual smoke.
- **Placeholders:** none — JS steps have complete code; native steps specify exact AppKit APIs and the model contract, with build verification gating each.
- **Naming consistency:** `docModelToHtml`, `collectInlineImages`, `RichEditorView`, `RichEditor` (commands module), `commands.{bold,italic,underline,bulletList,numberList,link}`, `onChange({html, inlineImages})`, document-model `{blocks:[{type, spans|items|contentId…}]}` — used consistently across tasks and into M6.
- **Known follow-ups for M6:** quoting the original message into the editor on reply; mapping `inlineImages` + file attachments into the Resend send payload; From-address selection; the scratch screen becomes the real compose/reply surface.
```
