# End-to-end smoke checklist

The native modules and send/render paths are compile- and unit-verified, but **not yet exercised
against a live Resend account**. Run this once on a real account before relying on the app. Each
item maps to a milestone; if something fails, the linked area is where to look.

## Prep

- [ ] Resend domain set up for **Inbound** (catch-all) and **verified for sending**.
- [ ] You can send mail *to* an address on that domain (e.g. from another account).
- [ ] `nvm use` (Node 22), `npm install`, `( cd macos && pod install )`.
- [ ] `npm run macos` launches the app.

## M0–M2 · Onboarding & inbox

- [ ] First launch shows onboarding; pasting a **valid** API key connects; an **invalid** key is rejected.
- [ ] Relaunch skips onboarding (key persisted in Keychain).
- [ ] Send yourself an email → within ~25s (or ⌘R/refresh) it appears in the inbox list.
- [ ] Quit and relaunch → the message is still there (SQLite cache).
- [ ] Field-name check: the message shows the right sender/subject/time (validates the live payload
      matches `src/data/validators.js` — see `API-VERIFICATION.md`).

## M3 · Reading

- [ ] Open the message → the HTML body renders in the reading pane.
- [ ] An email with a tracking pixel / remote image shows nothing remote until **"Load images"**.
- [ ] An email with an **inline image** (cid) renders the image after it loads.
- [ ] An email with a **file attachment** shows a chip; **Save** writes the file (quarantined — Finder
      shows the "downloaded from internet" prompt on open). A dangerous type (e.g. `.command`) warns first.

## M5 · Editor

- [ ] In a reply/compose, type text and toggle **bold / italic / underline**; make a **list**; the
      formatting holds.
- [ ] **Drag-drop an image** into the editor → it appears inline.

## M6 · Reply

- [ ] Reply to a received email → the recipient gets a **threaded** reply (shows under the original in
      their client), with your formatting and the **quoted original**.
- [ ] An inline image in the reply arrives as an inline image.
- [ ] Disconnect the network, hit Send → it shows **Failed — Retry** / stays queued; reconnect → it
      sends (and does **not** double-send).

## M4 · Triage

- [ ] Switch sidebar filters (Inbox/Unread/Starred/Archive) → the list changes.
- [ ] **Search** by sender/subject (and body of an opened message) → results filter.
- [ ] **Star** a message → it appears under Starred; **Archive** → it leaves Inbox/Starred.
- [ ] Opening a message marks it **read** (unread dot clears).
- [ ] The reading pane shows the **conversation** (original + your sent replies grouped).

## M7 · Compose & forward

- [ ] **Compose** a new email (set From/To/Subject + body) → the recipient receives it.
- [ ] **Forward** a received email with a file attachment → the recipient gets the quoted original
      **and the attachment** (re-attached).
- [ ] Your **From identity** is remembered on the next compose.
- [ ] An invalid From/To fails fast with a clear error (doesn't retry forever).

## M8 · Polish

- [ ] Toggle macOS **appearance** (light/dark) → the app follows.
- [ ] Change the macOS **accent color** and relaunch → buttons/links/selection use it.
- [ ] With the app in the **background**, receive new mail → a macOS **notification** appears (and not
      while the app is focused).
- [ ] Open an **empty folder** → friendly copy ("No starred messages", etc.).
- [ ] Go **offline** → the "Couldn't reach Resend — retrying…" banner shows; reconnect → it clears.

## If something breaks

- Wrong/empty fields on received mail → `src/data/validators.js` (compare to live JSON).
- Inline images blank → `MessageBodyView.swift` cid handler + `src/ui/InboxScreen.js` `cacheCidImages`.
- Send fails → check From is on a **verified sending domain**; inspect `src/net/sender.js` error.
- Notifications never appear → grant the notification permission prompt on first new-mail event.
