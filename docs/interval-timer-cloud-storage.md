# Interval timer: optional cloud storage with per-profile keys

## Context
Interval-timer presets (`IntervalTimerConfig`) used to live only in `localStorage`, so they did not follow the user
between devices. The goal is optional backend storage that is **no-cost**, **secured**, **login-free day to day**,
and **independent of the frontend host**.

Design decisions:
- AWS: a regular Lambda with a **Function URL** + DynamoDB. No Cognito (multi-user identity is not needed), no
  CloudFront Functions (no network or body access) and no Lambda@Edge (not in the free tier, tied to CloudFront).
- Identity = **secret keys** mapped to **profiles**. A key is pasted once per device and remembered in `localStorage`.
  Only key *hashes* are stored server side. Keys are created, listed and revoked by a **local admin script**, never
  via the public API. A profile may have several keys (one per device) so one device can be revoked alone.
- **Anonymous mode stays the default** and behaves as before; cloud mode is opt-in per device, and is hidden entirely
  when no API URL is configured.

Operating instructions, API reference and limits: [`backend/README.md`](../backend/README.md).

## Backend (`backend/`, AWS SAM)

- `template.yaml`: Node.js Lambda (arm64, 128 MB, 5 s timeout, reserved concurrency 2 to cap flood cost) with a
  Function URL (`AuthType: NONE`, CORS from the `AllowedOrigins` parameter; CORS is a convenience, the key is the
  security boundary). One DynamoDB table in **provisioned** mode (5 read / 5 write units by default), which the
  always-free tier covers, unlike on-demand. IAM limited to the item operations used. 7-day log retention. A monthly
  cost budget that emails on any actual cost.
- Data model (single table):

  | Item | PK | SK | Attributes |
  |---|---|---|---|
  | key | `KEY#<sha256(key) hex>` | `KEY` | `profile`, `label`, `createdAt` |
  | preset | `PROFILE#<profile>` | `PRESET#<name>` | `preset` (map), `updatedAt` |
  | counter | `PROFILE#<profile>` | `META` | `presetCount` |

- `src/handler.ts`: bearer key → hash → key item → profile (never taken from the request). Routes `GET /me`,
  `GET /presets`, `PUT /presets` (body carries the name), `DELETE /presets?name=`. Throttling maps to `503`, other
  failures to `500` without internals.
- `src/validate.ts`: field types and bounds, unknown fields stripped. Text limits are shared with the frontend
  (`PRESET_LIMITS`).
- `src/dynamo-store.ts`: new presets are written in a transaction with a counter increment, so the per-profile cap is
  enforced without reading the whole profile; deletes decrement it the same way.
- `scripts/keys.ts`: `create`, `list`, `revoke`.

## Frontend (`src/app/interval-timer/`)

- `environment*.ts`: `intervalTimerApiUrl` (empty disables the feature), read through the `INTERVAL_TIMER_API_URL`
  injection token.
- `services/cloud-connection.service.ts`: holds the key and profile, and makes the API calls.
- `services/interval-timer-config.service.ts`: public API unchanged (`configs`, `save`, `load`, `remove`), plus
  `connect`, `disconnect`, `sync`, `importLocalPresets`, `cloudStatus` and `localPresetCount`.
  - Anonymous presets stay under `interval-timer-configs`; a profile's device copy lives under
    `interval-timer-cloud:<profile>`, so the two never mix.
  - Changes apply on the device immediately and are queued under `interval-timer-cloud-pending:<profile>`, then sent
    in order. Network failures keep them queued (status `offline`) and they are replayed on the next sync, on the
    browser's `online` event, and on start-up. Changes the API rejects (`400`/`404`/`409`/`413`) are dropped with a
    message instead of being retried forever.
  - A `401` (revoked key) switches the device back to anonymous mode; unsent changes stay queued for a reconnect.
  - Copying anonymous presets into a profile renames clashes to `"<name> (local)"`.
  - When browser storage is full, a change is refused with a message rather than shown but not saved.
- `cloud-sync.component.ts`: "Local only" with a key field and Connect, or "Cloud: <profile>" with status, Sync,
  Disconnect and "Copy N local presets". No browser dialogs.
- Input fields carry `maxlength` matching the API limits.

## Possible follow-ups
- CI deployment of the backend (the first deploy is a manual `sam deploy --guided`).
- Routing the API through CloudFront with an edge key check, if the frontend stays there.

## Verification
1. `cd backend && npm test && npm run typecheck`; `sam validate --lint`.
2. Root: `npm run lint`, `npm run test:ci`, `npm run build`.
3. Deploy a stack, `npm run keys -- create me laptop`; `curl` the Function URL without a key → `401`, with the key →
   `200`.
4. `npm start` with `intervalTimerApiUrl` set: anonymous presets work as before; connect with the key; copy local
   presets; connect a second browser with a second key for the same profile → same presets; save while offline
   (DevTools) then go online → synced; `keys revoke` → the app falls back to anonymous mode with a message.
