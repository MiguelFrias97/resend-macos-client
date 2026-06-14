# Foundation Manual Smoke Checklist

End-to-end verification of the M0–M2 foundation. These steps are run by a
human against a real Resend account — they exercise the parts that automated
tests and CI cannot (the live native Keychain, real Resend polling, and the
GUI). The build and unit tests are already green via CI/local; this checklist
confirms the wired-together product actually works.

## Prerequisites

- A Resend account whose verified domain has **received inbound email**
  (so `/emails/receiving` returns real messages).
- That account's **API key** (starts with `re_`).

## Steps

1. **Node version.** Ensure Node >= 20.12:
   ```sh
   source ~/.nvm/nvm.sh && nvm use 22
   node -v   # expect v22.x
   ```

2. **Launch the app.**
   ```sh
   npm run macos
   ```
   The macOS app window should open.

3. **Onboarding.** On first launch you should see the onboarding screen.
   Paste a real Resend API key (from an account whose domain has received
   inbound email) and submit.
   - Expect the key to **verify** against Resend and be **saved to the
     Keychain**.
   - The app should advance from onboarding to the inbox.

4. **Inbox populates.** Within ~25 seconds (the sync interval), or on the
   next relaunch, the **left pane** lists received emails showing **sender +
   subject**. Click a row — the **right pane** shows that message's
   **subject**. The selected row is highlighted.

5. **Persistence / skip onboarding.** **Relaunch** the app. Because the key
   is already in the Keychain, the app should **skip onboarding** and go
   straight to the inbox, which should still list the previously synced
   messages (from the local SQLite store).

## What this exercises

A green run of this checklist confirms the full foundation chain works
end-to-end:

- **Keychain native module** — save + read of the API key.
- **Resend polling** — `MailSource.listReceived` against the live API.
- **Validators** — received-email payloads coerced to the internal shape.
- **LocalStore** — SQLite upsert + `listInbox` ordering and persistence.
- **Threading** — messages grouped into threads during sync.
- **Sync loop** — periodic `syncOnce` driving the store.
- **2-pane UI** — `InboxScreen` + `MessageList`, selection, and the
  list/detail wiring.
