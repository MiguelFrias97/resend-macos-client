# Background refresh: notification/App-Nap fixes + menu-bar & login item

Date: 2026-07-14
Status: Approved (pending spec review)

## Problem

The app fetches received mail by polling Resend every 25s from a JS
`setInterval` in `src/core/sync.js`, started by `InboxScreen`. macOS notifications
fire via native `Notifications.swift` when the app is unfocused. This works only
while the app process is alive, and has two rough edges plus a missing
"always-on" story:

1. `Notifications.swift` calls `requestAuthorization` on **every** `notify()`
   instead of once.
2. macOS **App Nap** can throttle/coalesce the 25s timer when the window is
   buried, stretching the real poll cadence.
3. There is no launch-at-login or menu-bar presence, so the user has to
   manually open the app for background refresh to happen at all.

The app already keeps running (and keeps the JS bridge + sync loop alive) after
its last window is closed — `AppDelegate.mm` sets `window.releasedWhenClosed =
NO` and relies on macOS keeping the app alive after the last window closes
(see `applicationShouldHandleReopen`). So once the app is running, polling
continues until the user quits, regardless of window visibility. No lifecycle
rewrite is required.

## Goals

- Ask for notification permission exactly once.
- Keep the 25s poll cadence honest while the app runs in the background.
- Give the app a menu-bar presence (unread badge + Open / Sync Now / Quit).
- Launch at login by default, with a user-controllable toggle in Settings.

## Non-goals

- True push (APNs / Resend webhooks / a backend). Deferred; documented as the
  future "Option B".
- Changing the 25s poll interval.
- Changing the quit behavior (Cmd+Q still fully quits; Dock icon stays).
- iOS background behavior.

## Design

### Part 1 — Two small fixes

**1a. One-time notification authorization.**
`Notifications.swift`:
- Add an `authorize()` method that calls
  `UNUserNotificationCenter.requestAuthorization(options: [.alert, .sound])`
  once and caches the granted result in a stored property.
- Call `authorize()` once from `AppDelegate.applicationDidFinishLaunching`.
- `notify(title:body:)` no longer requests authorization. It keeps the existing
  "skip while `NSApp.isActive`" guard, and posts a notification only when the
  cached granted flag is true. If permission was denied, it silently no-ops (as
  today), but the user is asked only once.

**1b. App Nap mitigation.**
`AppDelegate`:
- On launch, acquire and retain a process-activity token:
  `self.syncActivity = [NSProcessInfo processInfo] beginActivityWithOptions:
  NSActivityBackground reason:@"Periodic mail sync"]`.
- Hold it for the app's lifetime (stored property). This prevents timer
  coalescing/App Nap from throttling the JS `setInterval`.

### Part 2 — Menu bar + login item

**Native units (each small, single-purpose):**

- `StatusBar.swift` + `StatusBar.m` (RN module `StatusBar`)
  - Owns an `NSStatusItem` created at launch with a template icon.
  - `setUnread(_ count: NSNumber)` — updates the badge/title (e.g. shows the
    number when > 0, plain icon when 0). Main-queue dispatched.
  - Builds a menu with three items:
    - **Open Inbox** — brings the main window front (native:
      `makeKeyAndOrderFront`, mirrors `applicationShouldHandleReopen`).
    - **Sync Now** — emits an event to JS (reuse the existing
      `NSNotificationCenter` "RMMenuCommand"-style emitter pattern already used
      in `AppDelegate`, or a dedicated emitter).
    - **Quit** — `NSApp.terminate(nil)`.

- `LoginItem.swift` + `LoginItem.m` (RN module `LoginItem`)
  - Thin wrapper over `SMAppService.mainApp`:
    - `isEnabled(resolve,reject)` — resolves based on `.status == .enabled`.
    - `setEnabled(_ enabled, resolve, reject)` — `register()` / `unregister()`.
  - Registration failure (e.g. ad-hoc build) rejects with a clear code; JS
    treats it as non-fatal.

**JS units:**

- `src/native/StatusBar.js` — `setUnread(n)` and a subscription helper for the
  "sync now" event. No-ops if the native module is absent (keeps tests/other
  platforms safe, matching `Notifications.js`).
- `src/native/LoginItem.js` — `isEnabled()` and `setEnabled(bool)` wrappers;
  safe no-op/default when the module is absent.
- `InboxScreen`:
  - Push the total unread count (already computed for the sidebar) to
    `StatusBar.setUnread` whenever it changes.
  - Subscribe to the native "sync now" event and call the existing
    `syncNowRef.current()`.
- `SettingsScreen`:
  - Add a **"Launch at login"** toggle bound to `LoginItem.isEnabled()` /
    `setEnabled()`. The displayed state reflects the actual `SMAppService`
    status, so a failed/again-disabled registration shows honestly.
- **First-run default-on:** on first launch, if a persisted
  `loginItemInitialized` flag is unset, call `LoginItem.setEnabled(true)` once
  and set the flag. Subsequent launches never re-force it, so a user who turns
  it off in Settings stays off.

### Data flow

```
launch → AppDelegate: authorize() once, begin App Nap activity, create StatusBar
       → JS first run: LoginItem.setEnabled(true) once (flag persisted)
sync loop (25s) → new mail → notify() (if unfocused & granted)
              → InboxScreen recomputes unread → StatusBar.setUnread(n)
menu "Sync Now" → native event → InboxScreen syncNow()
menu "Open Inbox" → native window front
menu "Quit" → NSApp.terminate
Settings toggle → LoginItem.setEnabled(bool) → SMAppService register/unregister
```

### Error handling

- Notification permission denied → `notify()` silently no-ops; asked once.
- `LoginItem` register fails (ad-hoc/unsigned build) → rejects; Settings toggle
  reflects real status and shows a brief inline note; app otherwise unaffected.
- Missing native module in JS bridges → no-op defaults (parity with
  `Notifications.js`).

### Dependency / constraint

`SMAppService.mainApp.register()` needs a **stable code signature**; it does not
work reliably on an ad-hoc build. Launch-at-login therefore depends on the
existing `npm run setup-signing` + `npm run install:macos` flow (the
"ResendMail Local" identity). This is documented for the user; registration
failures are non-fatal.

## Testing

JS unit tests (mock `NativeModules`, following existing `__tests__` patterns):
- `StatusBar.setUnread` receives the correct total unread count.
- The native "sync now" event triggers `syncNow`.
- `SettingsScreen` toggle calls `LoginItem.setEnabled` with the right value and
  renders the status from `isEnabled()`.
- First-run auto-register-once: `setEnabled(true)` called when the flag is
  unset, not called when it is set.
- Bridges no-op safely when the native module is absent.

Native `NSStatusItem` / `SMAppService` / App Nap behavior is verified manually
on a signed local install.

## Manual verification checklist

1. `npm run setup-signing` (once) + `npm run install:macos`.
2. Launch; accept the single notification prompt.
3. Confirm menu-bar icon appears with Open / Sync Now / Quit and an unread badge.
4. Send a test inbound mail; with the app unfocused, confirm one notification and
   the badge increments within ~25s.
5. Quit and re-login; confirm the app auto-launches (login item on by default).
6. Toggle "Launch at login" off in Settings; re-login; confirm it does not start.
