# Background Refresh: Notification/App-Nap Fixes + Menu-Bar & Login Item — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ResendMail refresh mail and post notifications reliably in the background, with a menu-bar presence and launch-at-login, without changing the 25s poll or the quit behavior.

**Architecture:** The JS sync loop (`src/core/sync.js`, 25s `setInterval`) already keeps running while the app process is alive — even with the window closed — because `AppDelegate.mm` keeps the app and bridge alive after the last window closes. We add: (1) a one-time notification-authorization + App-Nap-activity token in the native app lifecycle so the timer isn't throttled; (2) a native menu-bar item (`MenuBar` module) showing an unread badge with Open / Sync Now / Quit; (3) a native login-item wrapper (`LoginItem` module over `SMAppService.mainApp`), on by default via a first-run helper, toggleable in Settings. Menu "Sync Now" reuses the existing `RMMenuCommand` → `menuCommand` event channel.

**Tech Stack:** React Native macOS 0.81, Swift/Obj-C native modules (`RCT_EXTERN_MODULE` pattern, co-located `.swift` + `.m`), Jest + @testing-library/react-native.

## Global Constraints

- Keep the sync interval at **25000 ms** (`intervalMs` default in `src/core/sync.js`). Do not change it.
- Cmd+Q still fully quits; the Dock icon stays; window/close behavior is unchanged.
- Login item uses `SMAppService.mainApp` and requires **macOS 13+**; guard with `#available(macOS 13.0, *)` and reject/return-false otherwise.
- Login-item registration failures must be **non-fatal** (ad-hoc builds can't register); surface via state, never crash.
- Launch-at-login reliably works only on a **stable-signed** install (`npm run setup-signing` + `npm run install:macos`), not an ad-hoc build. This is expected.
- Native modules follow the existing pattern: a `@objc(Name)` Swift class + a `.m` file with `RCT_EXTERN_MODULE`, co-located under `macos/ResendMail-macOS/`.
- JS native-bridge wrappers must **no-op / return safe defaults** when the native module is absent (parity with `src/native/Notifications.js` and `MenuEvents.js`), so Jest and non-macOS paths are safe.
- Keychain storage (`ThisDeviceOnly`) is untouched by this work.
- Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

**New files**
- `macos/ResendMail-macOS/MenuBar.swift` — `NSStatusItem` module (`MenuBar`): `setUnread`, menu actions.
- `macos/ResendMail-macOS/MenuBar.m` — `RCT_EXTERN_MODULE(MenuBar)`.
- `macos/ResendMail-macOS/LoginItem.swift` — `SMAppService.mainApp` wrapper module (`LoginItem`).
- `macos/ResendMail-macOS/LoginItem.m` — `RCT_EXTERN_MODULE(LoginItem)`.
- `src/native/MenuBar.js` — `setUnread(count)` bridge.
- `src/native/LoginItem.js` — `isEnabled()` / `setEnabled(bool)` bridge.
- `src/core/loginItemInit.js` — `maybeInitLoginItem(...)` first-run helper (pure/testable).
- `src/ui/LaunchAtLoginToggle.js` — self-contained Settings toggle component.
- `__tests__/native/MenuBar.contract.test.js`
- `__tests__/native/LoginItem.contract.test.js`
- `__tests__/core/loginItemInit.test.js`
- `__tests__/ui/LaunchAtLoginToggle.test.js`

**Modified files**
- `macos/ResendMail-macOS/Notifications.swift` — one-time `authorize()` + cached grant; `notify()` uses cache.
- `macos/ResendMail-macOS/AppDelegate.mm` — call `[Notifications authorize]`; hold an App-Nap activity token.
- `macos/ResendMail-macOS/project.pbxproj` (via Xcode) — add the 4 new native files to the `ResendMail-macOS` target.
- `src/ui/InboxScreen.js` — push unread to the menu bar; handle `syncNow`; run first-run login-item init.
- `src/ui/SettingsScreen.js` — render `<LaunchAtLoginToggle />`.

**Note on native tasks:** Swift/Obj-C changes cannot be exercised by Jest. Their "test" steps are a **manual verification** via `npm run install:macos` and observing the app. JS tasks use real TDD (failing Jest test first).

---

### Task 1: Native lifecycle fixes — one-time notification auth + App Nap

**Files:**
- Modify: `macos/ResendMail-macOS/Notifications.swift`
- Modify: `macos/ResendMail-macOS/AppDelegate.mm`

**Interfaces:**
- Produces: `@objc static func authorize()` on `Notifications` (callable from Obj-C as `[Notifications authorize]`); `notify(title:body:)` unchanged signature but now posts only when authorization was granted.

- [ ] **Step 1: Rewrite `Notifications.swift` to authorize once and cache the grant**

Replace the whole file with:

```swift
import Foundation
import AppKit
import UserNotifications
import React

@objc(Notifications)
class Notifications: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  // Cached authorization result, set once by authorize().
  private static var granted = false

  // Request notification permission exactly once, at app launch. Safe to call
  // more than once — UNUserNotificationCenter only prompts the first time — but
  // AppDelegate calls it a single time in applicationDidFinishLaunching.
  @objc static func authorize() {
    UNUserNotificationCenter.current()
      .requestAuthorization(options: [.alert, .sound]) { ok, _ in
        granted = ok
      }
  }

  @objc(notify:body:)
  func notify(_ title: String, body: String) {
    DispatchQueue.main.async {
      // Don't notify while the app is focused.
      if NSApp.isActive { return }
      guard Notifications.granted else { return }
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      UNUserNotificationCenter.current().add(
        UNNotificationRequest(
          identifier: UUID().uuidString, content: content, trigger: nil))
    }
  }
}
```

- [ ] **Step 2: In `AppDelegate.mm`, import the Swift header and call `authorize` + hold an App-Nap token**

At the top of `AppDelegate.mm`, after the existing imports (after line 5 `#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>`), add:

```objc
#import "ResendMail-Swift.h"
```

Add a property to keep the activity token alive for the app's lifetime. Immediately after `@implementation AppDelegate` (line 7), add:

```objc
// Retained for the app's lifetime so App Nap can't throttle/coalesce the JS
// sync timer (src/core/sync.js) when the window is buried in the background.
static id<NSObject> gSyncActivity = nil;
```

Inside `applicationDidFinishLaunching:`, after `[self installMessageMenu];` (line 25), add:

```objc
  // Ask for notification permission once (see Notifications.swift).
  [Notifications authorize];

  // Keep the periodic mail sync running at cadence in the background.
  gSyncActivity = [[NSProcessInfo processInfo]
      beginActivityWithOptions:NSActivityBackground
                        reason:@"Periodic mail sync"];
```

- [ ] **Step 3: Manual verification — build and observe**

Run: `npm run install:macos`
Then: `open /Applications/ResendMail.app`
Expected:
- Exactly one notification-permission prompt on first launch (not one per notification).
- With the app unfocused, a new inbound mail produces a single system notification within ~25s.
- App keeps polling with the window closed (leave it a couple of minutes, confirm sync-error banner never claims it stopped).

- [ ] **Step 4: Commit**

```bash
git add macos/ResendMail-macOS/Notifications.swift macos/ResendMail-macOS/AppDelegate.mm
git commit -m "fix(macos): request notification auth once and hold an App Nap activity

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `MenuBar` native module + JS bridge

**Files:**
- Create: `macos/ResendMail-macOS/MenuBar.swift`
- Create: `macos/ResendMail-macOS/MenuBar.m`
- Create: `src/native/MenuBar.js`
- Test: `__tests__/native/MenuBar.contract.test.js`
- Modify: `macos/ResendMail-macOS/project.pbxproj` (via Xcode: add both native files to the `ResendMail-macOS` target)

**Interfaces:**
- Produces (native module `MenuBar`): `setUnread(count: NSNumber)`.
- Produces (JS): `setUnread(count)` from `src/native/MenuBar.js`.
- Menu "Sync Now" posts `NSNotification` named `RMMenuCommand` with object `"syncNow"` — consumed by the existing `MenuEvents` emitter → `menuCommand` event (Task 3 handles it in JS).

- [ ] **Step 1: Write the failing JS bridge test**

Create `__tests__/native/MenuBar.contract.test.js`:

```javascript
jest.mock('react-native', () => ({
  NativeModules: {MenuBar: {setUnread: jest.fn()}},
}));

import {NativeModules} from 'react-native';
import {setUnread} from '../../src/native/MenuBar';

test('setUnread forwards a numeric count to the native module', () => {
  setUnread(3);
  expect(NativeModules.MenuBar.setUnread).toHaveBeenCalledWith(3);
});

test('setUnread coerces a non-number to 0', () => {
  setUnread(undefined);
  expect(NativeModules.MenuBar.setUnread).toHaveBeenLastCalledWith(0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/native/MenuBar.contract.test.js`
Expected: FAIL — cannot find module `../../src/native/MenuBar`.

- [ ] **Step 3: Create `src/native/MenuBar.js`**

```javascript
import {NativeModules} from 'react-native';

// Native menu-bar (NSStatusItem) control. setUnread pushes the inbox unread
// count to the badge. No-ops when the native module is absent (tests/other
// platforms), matching Notifications.js.
const {MenuBar} = NativeModules || {};

export function setUnread(count) {
  if (MenuBar && MenuBar.setUnread) {
    MenuBar.setUnread(Number(count) || 0);
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/native/MenuBar.contract.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Create `macos/ResendMail-macOS/MenuBar.swift`**

```swift
import Foundation
import AppKit
import React

@objc(MenuBar)
class MenuBar: NSObject {
  private var statusItem: NSStatusItem?

  // Touches NSStatusBar (UI), so init on the main queue.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  override init() {
    super.init()
    DispatchQueue.main.async { self.setup() }
  }

  private func setup() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let button = item.button {
      let img = NSImage(systemSymbolName: "envelope", accessibilityDescription: "ResendMail")
      img?.isTemplate = true
      button.image = img
      button.imagePosition = .imageLeading
    }
    let menu = NSMenu()
    let open = NSMenuItem(title: "Open Inbox", action: #selector(openInbox), keyEquivalent: "")
    let sync = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "")
    let quit = NSMenuItem(title: "Quit ResendMail", action: #selector(quitApp), keyEquivalent: "")
    for i in [open, sync] { i.target = self; menu.addItem(i) }
    menu.addItem(NSMenuItem.separator())
    quit.target = self
    menu.addItem(quit)
    item.menu = menu
    self.statusItem = item
  }

  @objc(setUnread:)
  func setUnread(_ count: NSNumber) {
    DispatchQueue.main.async {
      guard let button = self.statusItem?.button else { return }
      let n = count.intValue
      button.title = n > 0 ? " \(n)" : ""
    }
  }

  @objc private func openInbox() {
    NSApp.activate(ignoringOtherApps: true)
    NSApp.windows.first?.makeKeyAndOrderFront(nil)
  }

  @objc private func syncNow() {
    NotificationCenter.default.post(
      name: Notification.Name("RMMenuCommand"), object: "syncNow")
  }

  @objc private func quitApp() {
    NSApp.terminate(nil)
  }
}
```

- [ ] **Step 6: Create `macos/ResendMail-macOS/MenuBar.m`**

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MenuBar, NSObject)
RCT_EXTERN_METHOD(setUnread:(nonnull NSNumber *)count)
@end
```

- [ ] **Step 7: Add both native files to the Xcode target**

Open `macos/ResendMail.xcworkspace` in Xcode. Drag `MenuBar.swift` and `MenuBar.m` into the `ResendMail-macOS` group, ensuring **Target Membership → ResendMail-macOS** is checked for both. (This writes `project.pbxproj`.) Alternatively verify they appear in `project.pbxproj` alongside the existing `Keychain.swift`/`Keychain.m` entries.

- [ ] **Step 8: Manual verification — build and observe the menu bar**

Run: `npm run install:macos && open /Applications/ResendMail.app`
Expected: an envelope icon appears in the menu bar; clicking it shows **Open Inbox**, **Sync Now**, **Quit ResendMail**. (Badge + Sync Now wiring is verified in Task 3.)

- [ ] **Step 9: Commit**

```bash
git add src/native/MenuBar.js __tests__/native/MenuBar.contract.test.js \
  macos/ResendMail-macOS/MenuBar.swift macos/ResendMail-macOS/MenuBar.m \
  macos/ResendMail.xcodeproj/project.pbxproj
git commit -m "feat(macos): add MenuBar status-item module with unread badge and menu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire unread badge + Sync Now into `InboxScreen`

**Files:**
- Modify: `src/ui/InboxScreen.js`

**Interfaces:**
- Consumes: `setUnread(count)` from `src/native/MenuBar.js`; the existing `onMenuCommand` subscription (line ~201) and `menuHandlerRef` (line ~580); `onRefresh` (defined ~line 81); `counts` state (line 41); `store.counts()` returns `{inbox, unread, starred, sent, archive}` (unread-per-folder).

- [ ] **Step 1: Import the MenuBar bridge (aliased)**

In `src/ui/InboxScreen.js`, alongside the other native imports (near line 15 `import {notify} from '../native/Notifications';`), add:

```javascript
import {setUnread as setMenuBarUnread} from '../native/MenuBar';
```

- [ ] **Step 2: Push the inbox unread count to the menu bar whenever counts change**

Add a `useEffect` that mirrors `counts.inbox` to the badge. Place it right after the `useEffect(() => onMenuCommand(c => menuHandlerRef.current(c)), []);` line (~line 201):

```javascript
  // Mirror the inbox unread count onto the menu-bar badge.
  useEffect(() => {
    setMenuBarUnread(counts.inbox || 0);
  }, [counts]);
```

- [ ] **Step 3: Handle the `syncNow` menu command**

In `menuHandlerRef.current = cmd => {` (~line 580), handle `syncNow` **before** the `if (composeMode || settingsOpen) return;` guard so it works from any screen. Change the start of the handler body from:

```javascript
  menuHandlerRef.current = cmd => {
```

to:

```javascript
  menuHandlerRef.current = cmd => {
    if (cmd === 'syncNow') {
      onRefresh();
      return;
    }
```

(The rest of the handler — the `composeMode || settingsOpen` guard and the compose/reply/forward cases — stays as-is.)

- [ ] **Step 4: Verify existing JS suite still passes**

Run: `npx jest`
Expected: PASS (no regressions; existing InboxScreen tests, if any, unaffected).

- [ ] **Step 5: Manual verification**

Run: `npm run install:macos && open /Applications/ResendMail.app`
Expected:
- The menu-bar badge shows the current inbox unread count and updates after a sync.
- Clicking **Sync Now** in the menu triggers an immediate refresh (the in-app refresh spinner briefly appears).

- [ ] **Step 6: Commit**

```bash
git add src/ui/InboxScreen.js
git commit -m "feat(macos): drive menu-bar unread badge and Sync Now from InboxScreen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `LoginItem` native module + JS bridge

**Files:**
- Create: `macos/ResendMail-macOS/LoginItem.swift`
- Create: `macos/ResendMail-macOS/LoginItem.m`
- Create: `src/native/LoginItem.js`
- Test: `__tests__/native/LoginItem.contract.test.js`
- Modify: `macos/ResendMail-macOS/project.pbxproj` (via Xcode: add both native files to the `ResendMail-macOS` target)

**Interfaces:**
- Produces (native module `LoginItem`): `isEnabled(resolve,reject) -> Bool`; `setEnabled(enabled: Bool, resolve, reject) -> Bool` (resolves the resulting enabled state).
- Produces (JS): `isEnabled(): Promise<boolean>` and `setEnabled(enabled): Promise<boolean>` from `src/native/LoginItem.js`.

- [ ] **Step 1: Write the failing JS bridge test**

Create `__tests__/native/LoginItem.contract.test.js`:

```javascript
jest.mock('react-native', () => ({
  NativeModules: {
    LoginItem: {
      isEnabled: jest.fn(async () => true),
      setEnabled: jest.fn(async () => false),
    },
  },
}));

import {NativeModules} from 'react-native';
import {isEnabled, setEnabled} from '../../src/native/LoginItem';

test('isEnabled delegates to the native module', async () => {
  expect(await isEnabled()).toBe(true);
});

test('setEnabled coerces to a boolean and delegates', async () => {
  await setEnabled(1);
  expect(NativeModules.LoginItem.setEnabled).toHaveBeenCalledWith(true);
});

test('isEnabled resolves false when the native call rejects', async () => {
  NativeModules.LoginItem.isEnabled.mockRejectedValueOnce(new Error('nope'));
  expect(await isEnabled()).toBe(false);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/native/LoginItem.contract.test.js`
Expected: FAIL — cannot find module `../../src/native/LoginItem`.

- [ ] **Step 3: Create `src/native/LoginItem.js`**

```javascript
import {NativeModules} from 'react-native';

// Launch-at-login control, backed by SMAppService.mainApp. Returns safe
// defaults when the native module is absent (tests/other platforms).
const {LoginItem} = NativeModules || {};

export async function isEnabled() {
  if (!LoginItem || !LoginItem.isEnabled) return false;
  try {
    return await LoginItem.isEnabled();
  } catch (e) {
    return false;
  }
}

export async function setEnabled(enabled) {
  if (!LoginItem || !LoginItem.setEnabled) return false;
  return LoginItem.setEnabled(!!enabled);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/native/LoginItem.contract.test.js`
Expected: PASS (all three).

- [ ] **Step 5: Create `macos/ResendMail-macOS/LoginItem.swift`**

```swift
import Foundation
import ServiceManagement
import React

@objc(LoginItem)
class LoginItem: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(isEnabled:rejecter:)
  func isEnabled(_ resolve: RCTPromiseResolveBlock,
                 rejecter reject: RCTPromiseRejectBlock) {
    if #available(macOS 13.0, *) {
      resolve(SMAppService.mainApp.status == .enabled)
    } else {
      resolve(false)
    }
  }

  @objc(setEnabled:resolver:rejecter:)
  func setEnabled(_ enabled: Bool,
                  resolver resolve: RCTPromiseResolveBlock,
                  rejecter reject: RCTPromiseRejectBlock) {
    if #available(macOS 13.0, *) {
      do {
        if enabled { try SMAppService.mainApp.register() }
        else { try SMAppService.mainApp.unregister() }
        resolve(SMAppService.mainApp.status == .enabled)
      } catch {
        // Non-fatal: ad-hoc builds can't register. Report so JS can reflect it.
        reject("login_item", error.localizedDescription, error)
      }
    } else {
      reject("login_item", "Launch at login requires macOS 13 or later", nil)
    }
  }
}
```

- [ ] **Step 6: Create `macos/ResendMail-macOS/LoginItem.m`**

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LoginItem, NSObject)
RCT_EXTERN_METHOD(isEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setEnabled:(BOOL)enabled
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
```

- [ ] **Step 7: Add both native files to the Xcode target**

In Xcode (`macos/ResendMail.xcworkspace`), add `LoginItem.swift` and `LoginItem.m` to the `ResendMail-macOS` target (Target Membership checked), same as Task 2 Step 7.

- [ ] **Step 8: Manual verification**

Run: `npm run setup-signing` (once, if not already) then `npm run install:macos && open /Applications/ResendMail.app`
Expected: no crash on launch; the module is available (verified end-to-end via the Settings toggle in Task 5).

- [ ] **Step 9: Commit**

```bash
git add src/native/LoginItem.js __tests__/native/LoginItem.contract.test.js \
  macos/ResendMail-macOS/LoginItem.swift macos/ResendMail-macOS/LoginItem.m \
  macos/ResendMail.xcodeproj/project.pbxproj
git commit -m "feat(macos): add LoginItem module wrapping SMAppService.mainApp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `LaunchAtLoginToggle` component + Settings integration

**Files:**
- Create: `src/ui/LaunchAtLoginToggle.js`
- Test: `__tests__/ui/LaunchAtLoginToggle.test.js`
- Modify: `src/ui/SettingsScreen.js`

**Interfaces:**
- Consumes: `isEnabled()` / `setEnabled(bool)` from `src/native/LoginItem.js`; `useTheme` from `./useTheme`; `SP, RADIUS, TYPE` from `./designTokens`.
- Produces: default-exported `<LaunchAtLoginToggle />` React component.

- [ ] **Step 1: Write the failing component test**

Create `__tests__/ui/LaunchAtLoginToggle.test.js`:

```javascript
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

jest.mock('../../src/native/LoginItem', () => ({
  isEnabled: jest.fn(),
  setEnabled: jest.fn(),
}));
jest.mock('../../src/ui/useTheme', () => ({
  useTheme: () => ({
    text: '#000', textMuted: '#666', accent: '#07f',
    surface2: '#eee', border: '#ccc',
  }),
}));

import {isEnabled, setEnabled} from '../../src/native/LoginItem';
import LaunchAtLoginToggle from '../../src/ui/LaunchAtLoginToggle';

test('reflects the current login-item state on mount', async () => {
  isEnabled.mockResolvedValue(true);
  const {getByText} = render(<LaunchAtLoginToggle />);
  await waitFor(() => getByText('On'));
});

test('toggling calls setEnabled with the new value and updates the label', async () => {
  isEnabled.mockResolvedValue(false);
  setEnabled.mockResolvedValue(true);
  const {getByText} = render(<LaunchAtLoginToggle />);
  await waitFor(() => getByText('Off'));
  fireEvent.press(getByText('Off'));
  await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(true));
  await waitFor(() => getByText('On'));
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/ui/LaunchAtLoginToggle.test.js`
Expected: FAIL — cannot find module `../../src/ui/LaunchAtLoginToggle`.

- [ ] **Step 3: Create `src/ui/LaunchAtLoginToggle.js`**

```javascript
import React, {useEffect, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';
import {
  isEnabled as loginIsEnabled,
  setEnabled as loginSetEnabled,
} from '../native/LoginItem';

// A self-contained "Launch at login" row. Loads the real SMAppService state on
// mount and reflects it; toggling registers/unregisters the login item. On
// failure (e.g. an ad-hoc build that can't register) it re-reads and shows the
// true state rather than a wishful one.
export default function LaunchAtLoginToggle() {
  const theme = useTheme();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loginIsEnabled().then(v => {
      if (live) setOn(!!v);
    });
    return () => {
      live = false;
    };
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await loginSetEnabled(!on);
      setOn(!!result);
    } catch (e) {
      setOn(await loginIsEnabled());
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SP(3),
        paddingVertical: SP(2),
      }}>
      <Text style={{...TYPE.body, color: theme.textMuted}}>Launch at login</Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{checked: on}}
        onPress={toggle}
        style={{
          paddingVertical: SP(1.5),
          paddingHorizontal: SP(3),
          borderRadius: RADIUS.sm,
          backgroundColor: on ? theme.accent : 'transparent',
          borderWidth: 1,
          borderColor: on ? theme.accent : theme.border,
        }}>
        <Text style={{...TYPE.button, color: on ? '#fff' : theme.text}}>
          {on ? 'On' : 'Off'}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/ui/LaunchAtLoginToggle.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Render the toggle in `SettingsScreen.js`**

Add the import near the top of `src/ui/SettingsScreen.js` (after line 3 `import FromField from './FromField';`):

```javascript
import LaunchAtLoginToggle from './LaunchAtLoginToggle';
```

Inside the settings card, between the end of the Appearance row (`</View>` at line 104) and the card's closing `</View>` (line 105), insert:

```javascript
        <View style={{borderTopWidth: 1, borderTopColor: theme.divider}}>
          <LaunchAtLoginToggle />
        </View>
```

- [ ] **Step 6: Run the full JS suite**

Run: `npx jest`
Expected: PASS (no regressions).

- [ ] **Step 7: Manual verification**

Run: `npm run install:macos && open /Applications/ResendMail.app`
Open Settings. Expected: a **Launch at login** row with an On/Off control reflecting the real state; toggling it On adds the app under System Settings → General → Login Items (on a stable-signed install). On an ad-hoc build, the toggle snaps back to Off (registration refused) — no crash.

- [ ] **Step 8: Commit**

```bash
git add src/ui/LaunchAtLoginToggle.js __tests__/ui/LaunchAtLoginToggle.test.js src/ui/SettingsScreen.js
git commit -m "feat(macos): add Launch at login toggle to Settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: First-run auto-register (login item on by default)

**Files:**
- Create: `src/core/loginItemInit.js`
- Test: `__tests__/core/loginItemInit.test.js`
- Modify: `src/ui/InboxScreen.js`

**Interfaces:**
- Produces: `maybeInitLoginItem({getSetting, setSetting, setEnabled}): Promise<boolean>` — returns `true` if this run performed the one-time init, `false` if already initialized.
- Consumes (in InboxScreen): `store.getSetting` / `store.setSetting` (see `src/data/localStore.js:319-326`); `setEnabled` from `src/native/LoginItem.js`.

- [ ] **Step 1: Write the failing helper test**

Create `__tests__/core/loginItemInit.test.js`:

```javascript
import {maybeInitLoginItem} from '../../src/core/loginItemInit';

test('enables the login item once on first run and records the flag', async () => {
  const store = {};
  const setEnabled = jest.fn(async () => true);
  const getSetting = jest.fn(async k => store[k]);
  const setSetting = jest.fn(async (k, v) => {
    store[k] = v;
  });
  const first = await maybeInitLoginItem({getSetting, setSetting, setEnabled});
  expect(first).toBe(true);
  expect(setEnabled).toHaveBeenCalledWith(true);
  expect(store.loginItemInitialized).toBe('1');
});

test('does not re-enable on later runs', async () => {
  const setEnabled = jest.fn(async () => true);
  const getSetting = jest.fn(async () => '1');
  const setSetting = jest.fn();
  const res = await maybeInitLoginItem({getSetting, setSetting, setEnabled});
  expect(res).toBe(false);
  expect(setEnabled).not.toHaveBeenCalled();
});

test('still records the flag when enabling throws (ad-hoc build)', async () => {
  const store = {};
  const setEnabled = jest.fn(async () => {
    throw new Error('ad-hoc');
  });
  const getSetting = jest.fn(async k => store[k]);
  const setSetting = jest.fn(async (k, v) => {
    store[k] = v;
  });
  const res = await maybeInitLoginItem({getSetting, setSetting, setEnabled});
  expect(res).toBe(true);
  expect(store.loginItemInitialized).toBe('1');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest __tests__/core/loginItemInit.test.js`
Expected: FAIL — cannot find module `../../src/core/loginItemInit`.

- [ ] **Step 3: Create `src/core/loginItemInit.js`**

```javascript
// Enable launch-at-login once, on first run, so background refresh works out of
// the box. A persisted flag ensures we never force it back on after the user
// turns it off in Settings. Best-effort: an enable failure (ad-hoc build) is
// swallowed, and the flag is still set so we don't retry every launch.
export async function maybeInitLoginItem({getSetting, setSetting, setEnabled}) {
  const done = await getSetting('loginItemInitialized');
  if (done) return false;
  try {
    await setEnabled(true);
  } catch (e) {
    // non-fatal — registration can fail on unsigned/ad-hoc builds
  }
  await setSetting('loginItemInitialized', '1');
  return true;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/core/loginItemInit.test.js`
Expected: PASS (all three).

- [ ] **Step 5: Call it from InboxScreen boot**

In `src/ui/InboxScreen.js`, add the imports near the other native/core imports (after the `import {setUnread as setMenuBarUnread} from '../native/MenuBar';` line added in Task 3):

```javascript
import {setEnabled as setLoginItemEnabled} from '../native/LoginItem';
import {maybeInitLoginItem} from '../core/loginItemInit';
```

In the boot effect, immediately after `servicesRef.current = {store, source, sender};` and `setReady(true);`, add a best-effort first-run init:

```javascript
      // First launch only: turn on Launch at login by default (user can undo
      // it in Settings). Non-fatal.
      maybeInitLoginItem({
        getSetting: store.getSetting,
        setSetting: store.setSetting,
        setEnabled: setLoginItemEnabled,
      }).catch(() => {});
```

- [ ] **Step 6: Run the full JS suite**

Run: `npx jest`
Expected: PASS (no regressions).

- [ ] **Step 7: Manual verification**

On a clean install (`npm run setup-signing` done, fresh app data): `npm run install:macos && open /Applications/ResendMail.app`, sign in.
Expected:
- After first sign-in, Settings shows **Launch at login = On**, and the app appears in System Settings → Login Items.
- Turn it Off, quit, relaunch: it stays Off (the flag prevents re-forcing).

- [ ] **Step 8: Commit**

```bash
git add src/core/loginItemInit.js __tests__/core/loginItemInit.test.js src/ui/InboxScreen.js
git commit -m "feat(macos): enable launch-at-login by default on first run

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npx jest` — full suite green.
- [ ] `npm run lint` — clean.
- [ ] End-to-end on a stable-signed install, following the spec's manual checklist:
  1. `npm run setup-signing` + `npm run install:macos`.
  2. Launch; accept the single notification prompt.
  3. Menu-bar icon present with Open / Sync Now / Quit and an unread badge.
  4. Inbound test mail (app unfocused) → one notification + badge increments within ~25s.
  5. Quit + re-login → app auto-launches (login item on by default).
  6. Settings → Launch at login Off → re-login → does not start.
