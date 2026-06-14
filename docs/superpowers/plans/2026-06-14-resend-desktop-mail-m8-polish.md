# Resend Desktop Mail — M8 Polish (theme, accent, notifications, states) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship-quality polish: auto light/dark theming that follows macOS, the system accent color, native notifications on new mail, and friendly empty/error states.

**Architecture:** A pure-JS semantic theme (`light`/`dark` palettes + accent) consumed via a `useTheme()` hook (driven by RN `useColorScheme()` + a native `SystemAccent` module). UI components read colors from the theme instead of hard-coded hex. A native `Notifications` module posts macOS notifications; the sync loop reports newly-arrived messages so the screen can notify. An `EmptyState` component covers empty folders / no results.

**Tech Stack:** plain JavaScript, Jest, Swift (`SystemAccent`, `Notifications`), the existing UI components.

**Reference spec:** `docs/superpowers/specs/2026-06-12-resend-desktop-mail-design.md` (§Appearance: Auto + system accent; §notifications).

**Branch:** `build/m8-polish` (off `main`, contains merged M0–M7).

---

## File structure (this milestone)

```
src/ui/theme.js                 # NEW — light/dark palettes + makeTheme(scheme, accent)
src/ui/useTheme.js              # NEW — hook: useColorScheme + native accent → theme
src/ui/EmptyState.js            # NEW — empty-folder / no-results message
src/native/SystemAccent.js      # NEW — JS wrapper
src/native/Notifications.js     # NEW — JS wrapper
src/core/sync.js                # + onNewMessages reporting (new-arrival detection)
src/ui/*.js                     # InboxScreen/Sidebar/MessageList/SearchBar/ThreadView/ComposeSheet/ReplyComposer/Onboarding → theme colors
macos/ResendMail-macOS/SystemAccent.swift / .m   # native accent color
macos/ResendMail-macOS/Notifications.swift / .m  # native notifications
__tests__/...
```

---

### Task 1: `theme.js` (palettes)

**Files:** Create `src/ui/theme.js`, `__tests__/ui/theme.test.js`.

- [ ] **Step 1: Failing tests**

```javascript
// __tests__/ui/theme.test.js
import {makeTheme} from '../../src/ui/theme';

test('light is the default; dark switches the palette', () => {
  const light = makeTheme('light');
  const dark = makeTheme('dark');
  expect(light.scheme).toBe('light');
  expect(dark.scheme).toBe('dark');
  expect(light.bg).not.toBe(dark.bg);
  // unknown scheme falls back to light
  expect(makeTheme('weird').scheme).toBe('light');
});

test('accent is injected and defaults when absent', () => {
  expect(makeTheme('light', '#aabbcc').accent).toBe('#aabbcc');
  expect(typeof makeTheme('light').accent).toBe('string'); // a default accent
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/theme -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/ui/theme.js
const PALETTES = {
  light: {
    bg: '#ffffff', panel: '#f2f0f5', border: '#e5e5e5', divider: '#eeeeee',
    text: '#1a1a1a', textMuted: '#888888', danger: '#b00020',
    sentBg: '#f6f4fb', selectedBg: '#ece8f7',
  },
  dark: {
    bg: '#1e1e1f', panel: '#2a2a2e', border: '#3a3a3e', divider: '#333336',
    text: '#f0f0f2', textMuted: '#9a9aa0', danger: '#ff6b6b',
    sentBg: '#2c2838', selectedBg: '#3a3550',
  },
};

const DEFAULT_ACCENT = '#5b4aa6';

export function makeTheme(scheme, accent) {
  const key = scheme === 'dark' ? 'dark' : 'light';
  return {...PALETTES[key], accent: accent || DEFAULT_ACCENT, scheme: key};
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/theme -i`  Expected: PASS.
- [ ] **Step 5: Commit**  `git add -A && git commit -m "feat: semantic light/dark theme palettes"`

---

### Task 2: native `SystemAccent` + `useTheme` hook

**Files:** Create `macos/ResendMail-macOS/SystemAccent.swift`, `.m`, `src/native/SystemAccent.js`, `src/ui/useTheme.js`, `__tests__/ui/useTheme.test.js`. Wire pbxproj.

- [ ] **Step 1: `useTheme` test (RED)** — mock RN so no native is needed

```javascript
// __tests__/ui/useTheme.test.js
jest.mock('react-native', () => ({
  useColorScheme: () => 'dark',
  NativeModules: {},
}));
import {renderHook} from '@testing-library/react-native';
import {useTheme} from '../../src/ui/useTheme';

test('useTheme returns the dark palette when the OS is dark', () => {
  const {result} = renderHook(() => useTheme());
  expect(result.current.scheme).toBe('dark');
});
```

> If `renderHook` isn't exported by the installed testing-library version, instead render a tiny probe component that calls `useTheme()` and writes `theme.scheme` into a Text, and assert on it.

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/useTheme -i`  Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/useTheme.js`**

```javascript
import {useEffect, useState} from 'react';
import {useColorScheme, NativeModules} from 'react-native';
import {makeTheme} from './theme';

export function useTheme() {
  const scheme = useColorScheme();
  const [accent, setAccent] = useState(null);
  useEffect(() => {
    const mod = (NativeModules || {}).SystemAccent;
    if (mod && mod.getAccentColor) {
      mod.getAccentColor().then(c => c && setAccent(c)).catch(() => {});
    }
  }, []);
  return makeTheme(scheme || 'light', accent || undefined);
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/useTheme -i`  Expected: PASS.

- [ ] **Step 5: Native `SystemAccent`** — `SystemAccent.swift`:

```swift
import Foundation
import AppKit
import React

@objc(SystemAccent)
class SystemAccent: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(getAccentColor:rejecter:)
  func getAccentColor(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let c = (NSColor.controlAccentColor.usingColorSpace(.sRGB)) ?? NSColor.systemBlue
      let r = Int(round(c.redComponent * 255))
      let g = Int(round(c.greenComponent * 255))
      let b = Int(round(c.blueComponent * 255))
      resolve(String(format: "#%02x%02x%02x", r, g, b))
    }
  }
}
```

`SystemAccent.m`:

```objc
#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(SystemAccent, NSObject)
RCT_EXTERN_METHOD(getAccentColor:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
```

`src/native/SystemAccent.js`:

```javascript
import {NativeModules} from 'react-native';
const {SystemAccent} = NativeModules || {};
export const getAccentColor = () =>
  SystemAccent && SystemAccent.getAccentColor ? SystemAccent.getAccentColor() : Promise.resolve(null);
```

Wire both native files into the `ResendMail-macOS` target via the `xcodeproj` gem. Build (Node 22) → `** BUILD SUCCEEDED **`.

- [ ] **Step 6: Commit**  `git add -A && git commit -m "feat: system accent native module + useTheme hook"`

---

### Task 3: Apply the theme to the UI

**Files:** Modify `src/ui/InboxScreen.js`, `Sidebar.js`, `SearchBar.js`, `MessageList.js`, `ThreadView.js`, `ComposeSheet.js`, `ReplyComposer.js`, `Onboarding.js`.

- [ ] **Step 1: In each component, call `const theme = useTheme();`** and replace hard-coded colors with theme tokens. Mapping (apply consistently):
  - window/list/pane backgrounds → `theme.bg`; the sidebar/panel background → `theme.panel`.
  - borders/dividers → `theme.border` / `theme.divider`.
  - primary text → `theme.text`; secondary/muted (timestamps, snippets, placeholders) → `theme.textMuted`.
  - links / primary buttons / selection highlight / unread dot / sidebar selected → `theme.accent` (selection background can be `theme.selectedBg`).
  - error text / "Failed" → `theme.danger`.
  - sent-message header background in `ThreadView` → `theme.sentBg`.
- [ ] **Step 2: Keep all existing tests passing.** The components still render the same structure/text; only colors change. `useTheme()` works under jest (`useColorScheme` returns null → light; no native module → default accent). If any component test mocks `react-native` in a way that omits `useColorScheme`, add it to that mock.
- [ ] **Step 3: Run full suite + lint + build.** `npx jest` green, `npx eslint .` 0 errors, macOS build SUCCEEDED.
- [ ] **Step 4: Commit**  `git add -A && git commit -m "feat: apply light/dark + accent theme across the UI"`

> The `MessageBody` WKWebView renders email HTML (sender-controlled) — leave its content rendering alone, but you may set the surrounding container background to `theme.bg`.

---

### Task 4: New-mail notifications

**Files:** Modify `src/core/sync.js`, `__tests__/core/sync.test.js`; create `macos/ResendMail-macOS/Notifications.swift`, `.m`, `src/native/Notifications.js`; wire `InboxScreen.js`.

- [ ] **Step 1: sync test (RED)** — new-message reporting

```javascript
// add to __tests__/core/sync.test.js
import {syncOnce} from '../../src/core/sync';

test('syncOnce reports only not-yet-seen messages via onNewMessages', async () => {
  const source = {
    listReceived: async () => [
      {id: 'a', from: 'x', to: ['y'], subject: 's', rfcMessageId: null, references: [], inReplyTo: null, receivedAt: '2026-06-12T10:00:00Z'},
    ],
  };
  const store = {upsertMessage: async () => {}};
  const knownIds = new Set();
  const fresh = [];
  await syncOnce({source, store, knownIds, onNewMessages: ms => fresh.push(...ms)});
  expect(fresh.map(m => m.id)).toEqual(['a']);
  // second pass: already known → nothing new
  fresh.length = 0;
  await syncOnce({source, store, knownIds, onNewMessages: ms => fresh.push(...ms)});
  expect(fresh).toEqual([]);
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest core/sync -i`  Expected: FAIL.

- [ ] **Step 3: Implement** — extend `syncOnce` to accept `knownIds` + `onNewMessages` and `startSyncLoop` to seed-then-report:

```javascript
export async function syncOnce({source, store, knownThreads = {}, knownIds, onNewMessages, onSkip} = {}) {
  const messages = source.listAllReceived
    ? await source.listAllReceived({onSkip})
    : await source.listReceived({limit: 100, onSkip});
  const ordered = [...messages].sort((a, b) => {
    const ta = Date.parse(a.receivedAt) || 0;
    const tb = Date.parse(b.receivedAt) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const fresh = [];
  let count = 0;
  for (const m of ordered) {
    const threadId = threadIdFor(m, knownThreads);
    if (m.rfcMessageId) knownThreads[m.rfcMessageId] = threadId;
    await store.upsertMessage({...m, threadId});
    if (knownIds && !knownIds.has(m.id)) {
      fresh.push(m);
      knownIds.add(m.id);
    }
    count += 1;
  }
  if (onNewMessages && fresh.length) onNewMessages(fresh);
  return count;
}

export function startSyncLoop({source, store, intervalMs = 25000, schedule = setInterval, onError, onTick, onNewMessages} = {}) {
  const knownThreads = {};
  const knownIds = new Set();
  let seeded = false;
  const tick = async () => {
    try {
      // The first tick seeds knownIds without notifying (don't alert for the
      // whole existing mailbox on launch).
      const n = await syncOnce({
        source,
        store,
        knownThreads,
        knownIds,
        onNewMessages: seeded ? onNewMessages : undefined,
      });
      seeded = true;
      if (onTick) onTick(n);
    } catch (e) {
      if (onError) onError(e);
    }
  };
  tick();
  const handle = schedule(tick, intervalMs);
  return () => clearInterval(handle);
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest core/sync -i`  Expected: PASS (existing sync tests still pass — they don't pass `knownIds`).

- [ ] **Step 5: Native `Notifications`** — `Notifications.swift`:

```swift
import Foundation
import AppKit
import UserNotifications
import React

@objc(Notifications)
class Notifications: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(notify:body:)
  func notify(_ title: String, body: String) {
    DispatchQueue.main.async {
      // Don't notify while the app is focused.
      if NSApp.isActive { return }
      let center = UNUserNotificationCenter.current()
      center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
        guard granted else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
      }
    }
  }
}
```

`Notifications.m`:

```objc
#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(Notifications, NSObject)
RCT_EXTERN_METHOD(notify:(NSString *)title body:(NSString *)body)
@end
```

`src/native/Notifications.js`:

```javascript
import {NativeModules} from 'react-native';
const {Notifications} = NativeModules || {};
export const notify = (title, body) => {
  if (Notifications && Notifications.notify) Notifications.notify(title, body);
};
```

Wire both native files into the target via the `xcodeproj` gem. Build → SUCCEEDED.

- [ ] **Step 6: Wire `InboxScreen`** — pass `onNewMessages` to `startSyncLoop`:

```javascript
onNewMessages: fresh => {
  const n = fresh.length;
  notify(
    n === 1 ? 'New message' : `${n} new messages`,
    fresh[0] ? `${fresh[0].from}: ${fresh[0].subject || ''}` : '',
  );
  loadListRef.current();
},
```

(import `notify` from `../native/Notifications`).

- [ ] **Step 7: Commit**  `git add -A && git commit -m "feat: new-mail detection + native notifications"`

---

### Task 5: Empty & error states

**Files:** Create `src/ui/EmptyState.js`, `__tests__/ui/EmptyState.test.js`; modify `src/ui/InboxScreen.js`.

- [ ] **Step 1: Failing test**

```javascript
// __tests__/ui/EmptyState.test.js
import React from 'react';
import {render} from '@testing-library/react-native';
import EmptyState from '../../src/ui/EmptyState';

test('shows a message', () => {
  const {getByText} = render(<EmptyState message="No starred messages" />);
  expect(getByText('No starred messages')).toBeTruthy();
});
```

- [ ] **Step 2: Run → FAIL**  Run: `npx jest ui/EmptyState -i`  Expected: FAIL.

- [ ] **Step 3: Implement**

```javascript
// src/ui/EmptyState.js
import React from 'react';
import {View, Text} from 'react-native';
import {useTheme} from './useTheme';

export default function EmptyState({message}) {
  const theme = useTheme();
  return (
    <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
      <Text style={{color: theme.textMuted, textAlign: 'center'}}>{message}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run → PASS**  Run: `npx jest ui/EmptyState -i`  Expected: PASS.

- [ ] **Step 5: Wire into `InboxScreen`.** When the list is empty, show an `EmptyState` under the search bar instead of a blank `MessageList`: searching → "No results for '<query>'"; otherwise per-filter copy ("Your inbox is empty", "No unread messages", "No starred messages", "No archived messages"). Keep the existing sync-error banner; phrase it as "Couldn't reach Resend — retrying…" when present.

- [ ] **Step 6: Full suite + lint + build.** `npx jest` green, `npx eslint .` 0 errors, macOS build SUCCEEDED.
- [ ] **Step 7: Manual smoke.** Toggle macOS appearance (light/dark) and accent color → the app follows. Receive new mail while the app is in the background → a notification appears. Open an empty folder → friendly copy. Go offline → the error/retry banner shows.
- [ ] **Step 8: Commit**  `git add -A && git commit -m "feat: empty-folder and error states"`

---

## Self-review notes (addressed)

- **Spec coverage (M8):** auto light/dark ✓, system accent ✓, new-mail notifications ✓, empty/error states ✓.
- **Testability:** theme palettes, the useTheme hook, the sync new-message detection, and EmptyState are unit-tested; the native accent/notification modules are compile-verified + manual smoke; the theme application is verified by the unchanged component tests still passing.
- **Placeholders:** none — JS steps have complete code; native steps give exact AppKit code + bridge.
- **Naming consistency:** `makeTheme`/`useTheme`, theme tokens (`bg`/`panel`/`border`/`divider`/`text`/`textMuted`/`accent`/`danger`/`sentBg`/`selectedBg`), `getAccentColor`, `notify`, `onNewMessages`, `EmptyState` — consistent across tasks.
- **Known follow-ups:** live accent/appearance change observers (re-read on system change rather than once at mount); per-message notification grouping; a Settings screen exposing theme override and the From identity.
```
