# Resend API verification (2026-06-14)

Reconciliation of the app's payload validators (`src/data/validators.js`, `src/net/mailSource.js`,
`src/compose/assembleCompose.js`) against the documented Resend response shapes, so the first live
sync/send doesn't surprise us. **All field-name assumptions check out** — no code changes required.

## List received emails — `GET /emails/receiving`

Each item in `data[]` (all **snake_case**):

| Field | Type | Our mapping (`validateReceivedEmail`) |
|---|---|---|
| `id` | string | `id` |
| `from` | string | `from` |
| `to` | array | `to` |
| `cc` | array | `cc` |
| `bcc` | array | `bcc` |
| `reply_to` | array | `replyTo` |
| `subject` | string | `subject` |
| `message_id` | string | `rfcMessageId` |
| `created_at` | string | `receivedAt` |
| `attachments[]` | array | `attachments` (metadata) |

Attachment metadata: `id`, `filename`, `content_type`, `content_id` (string\|null), `content_disposition`, `size`. ✓ matches `validateAttachmentMeta`.

**Confirmed gap:** the list payload does **not** include `in_reply_to` or `references` (only
`message_id`). `validateReceivedEmail` maps `raw.in_reply_to`/`raw.references` (→ null/[]), so they
are effectively never present at sync time. This is why threading uses the subject+participants
fallback (`src/core/threading.js`). Full RFC-header threading would require parsing the **retrieve**
endpoint's `headers` and a re-threading pass — a deferred follow-up, not a bug.

## Retrieve a received email — `GET /emails/receiving/{id}`

(SDK: `resend.emails.receiving.get(id)`.) Response includes `html`, `text`, `headers`, plus the
standard fields. `validateReceivedEmailContent` maps `html`, `text`, `headers` (object), and
`attachments`. ✓

## Retrieve an attachment — `GET /emails/receiving/{id}/attachments/{attId}`

Fields: `id`, `filename`, `size`, `content_type`, `content_disposition`, `content_id`,
**`download_url`** (snake_case ✓), `expires_at`. Attachment **bytes are delivered only via
`download_url`** (a signed `inbound-cdn.resend.com` URL) — no inline base64. ✓ matches:

- **M3 reading** downloads the bytes from `download_url` into the cache (native `downloadToCache`).
- **M7 forward** downloads + base64-encodes (native `readBase64`) and re-attaches as `content` so the
  attachment survives an outbox retry (a `download_url` would expire — `expires_at`).

## Send — `POST /emails`

Payload fields used: `from`, `to` (array), `cc`, `bcc`, `subject`, `html`, `headers` (object — for
`In-Reply-To`/`References`), `attachments[]` with `filename` + (`content` base64 | `path` URL) +
`content_type` + `content_id` (inline cid). The `Idempotency-Key` header is set from the outbox id.
✓ all consistent with `assembleReplyPayload`/`assembleComposePayload`/`assembleForwardPayload` + `Sender`.

## Bottom line

Validators and send payloads match the documented live shapes. The only behavioral caveat is the
threading heuristic (driven by the list endpoint not exposing reply headers). Re-confirm against your
real account during the smoke test (`docs/SMOKE-CHECKLIST.md`); if any field differs, it's a small
edit in `src/data/validators.js`.
