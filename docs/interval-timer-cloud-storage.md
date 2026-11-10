# Interval timer: optional cloud storage with per-profile keys

## Context
Interval-timer presets (`IntervalTimerConfig`) live only in `localStorage`, so they don't follow the user between
devices. Goal: optional backend storage that is **no-cost**, **secured**, **login-free day to day**, and **independent
of the frontend host** (CloudFront today, may change).

Design decisions:
- AWS: a regular Lambda with a **Function URL** + DynamoDB. No Cognito, no CloudFront Functions / Lambda@Edge.
- Identity = **secret keys** mapped to **profiles**. A key is pasted once per device and remembered in `localStorage`.
  Only key *hashes* are stored server side. Keys are created/listed/revoked by a **local admin script**, never via the
  public API. A profile may have several keys (one per device) so one device can be revoked alone.
- **Anonymous mode stays the default** and is exactly today's behaviour; cloud mode is opt-in per device.

## Backend (`backend/`, new, deployed with AWS SAM)

### `backend/template.yaml` (SAM)
- `PresetsFunction`: runtime `nodejs22.x` (or newest supported Node LTS), arm64, 128 MB, timeout 5 s,
  `ReservedConcurrentExecutions: 2` (caps flood cost), esbuild build of `src/handler.ts`.
  `FunctionUrlConfig: AuthType NONE` with CORS `AllowOrigins` from parameter `AllowedOrigins`
  (frontend origin + `http://localhost:4200`), methods GET/PUT/DELETE, header `authorization, content-type`.
  CORS is convenience only; the key is the security boundary.
- `Table`: single DynamoDB table, `PK`/`SK` strings, **`BillingMode: PROVISIONED`, 1 RCU / 1 WCU** — the always-free
  tier covers provisioned capacity (on-demand requests are not free). Point-in-time recovery off (costs).
- IAM: function role limited to `GetItem/Query/PutItem/DeleteItem` on that table.
- Log group with 7-day retention.
- `AWS::Budgets::Budget`: $1 monthly cost budget with email alert (parameter `AlertEmail`); first budgets are free.
- Output: `FunctionUrl`.

### Data model (one table)
| Item | PK | SK | Attributes |
|---|---|---|---|
| key | `KEY#<sha256(key) hex>` | `KEY` | `profile`, `label`, `createdAt` |
| preset | `PROFILE#<profile>` | `PRESET#<name>` | `config` (map), `updatedAt` |

### `backend/src/handler.ts`
- Read `authorization: Bearer <key>`; reject missing/oversized → 401. Hash with SHA-256, `GetItem KEY#…` → 401 if absent.
  Profile always comes from the key item, never from the request.
- Routes:
  - `GET /me` → `{ profile, label }` (used by "Connect" to validate a key)
  - `GET /presets` → `Query PK=PROFILE#<profile>` → `{ presets: [{...config, updatedAt}] }`
  - `PUT /presets/{name}` → validate body, `PutItem` with `updatedAt`
  - `DELETE /presets/{name}` → `DeleteItem`
- Validation (`backend/src/validate.ts`): body ≤ 16 KB; `name` 1–100 chars and equals the path name; `rounds`/`work`/
  `rest`/`intro` integers within sane bounds; `playSound` boolean; `exercises` ≤ 4 KB; `videoUrl` ≤ 500 chars; strip
  unknown fields. Cap presets per profile (e.g. 200) → 409.
- Errors return JSON `{ error }` with no internals; 404 for unknown routes.

### `backend/scripts/keys.ts` (admin CLI, uses the operator's own AWS credentials)
- `create <profile> [label]` → 32 random bytes base64url, store hash, print key once.
- `list` → profiles + labels + createdAt (never keys).
- `revoke <profile> <label>` → delete that key item.
- Table name from `--table` / env, resolved from the stack output.

### `backend/package.json`
Own deps (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`; dev: `typescript`, `vitest`, `aws-sdk-client-mock`,
`tsx`, `esbuild`), scripts `test`, `build`, `keys`. Kept separate from the Angular `package.json`; add `backend/` to
root `tsconfig`/eslint ignores as needed so `ng lint`/`ng build` are unaffected.

## Frontend (`src/app/interval-timer/`)

### Environment
Add `intervalTimerApiUrl` to `src/environments/environment.ts` and `environment.development.ts`. Empty string ⇒ cloud
feature hidden entirely (app works as today).

### `services/cloud-connection.service.ts` (new)
- Signals: `key` (from `localStorage['interval-timer-cloud-key']`), `profile`, `status`
  (`'local' | 'connecting' | 'connected' | 'error'`), computed `isCloud`.
- `connect(key)`: `GET /me` with the key → on success store key + profile; on 401 show alert, stay local.
- `disconnect()`: remove key, profile cache; back to local.
- `handleUnauthorized()`: called on any 401 → alert "key no longer valid", disconnect (cache kept until disconnect
  clears it explicitly, so nothing is lost silently).

### `services/interval-timer-config.service.ts` (modified, same public API)
Public surface stays `configs`, `save`, `load`, `remove` so `interval-timer.component.ts` is untouched for
save/load/delete.
- Storage key chosen by mode: local → `interval-timer-configs` (unchanged); cloud →
  `interval-timer-cloud:<profile>` (cache). Switching mode (an `effect` on `connection.profile()`) reloads the signal
  from the matching key, so anonymous and profile presets never mix.
- Cloud mode: on activation `GET /presets` → replace cache. `save`/`remove` update the signal + cache immediately
  (optimistic) and send PUT/DELETE. On network failure: queue the op in `localStorage['interval-timer-cloud-pending:<profile>']`,
  alert "saved on this device, will sync"; replay queue on startup, on `window` `online`, and before each refresh.
  Conflicts: last write wins by `updatedAt`.
- New method `importLocalPresets()`: uploads anonymous presets into the profile; name clashes keep the cloud preset
  and upload the local one as `"<name> (local)"`. Local presets are left in place.
- HTTP via `HttpClient` with the `Authorization` header set per request (no new global interceptor).

### `cloud-sync.component.ts` (new, small standalone child)
- Hidden when `intervalTimerApiUrl` is empty.
- Shows "Local only" or "Cloud: <profile>". Local: password input for the key + Connect button. Connected:
  Disconnect button and, if anonymous presets exist, a "Copy N local presets to this profile" button.
- Inline UI only (no `confirm()`/`alert()` dialogs); feedback via existing `AlertService`.
- Added to the interval timer template near the saved-config controls.

## Tests
- `backend/src/*.spec.ts` (Vitest + `aws-sdk-client-mock`): missing/unknown key → 401; profile isolation (key for A
  can't touch B); validation rejects bad bodies/oversize; CRUD happy paths; preset cap.
- `interval-timer-config.service.spec.ts`: existing local-mode tests unchanged; new cloud-mode tests with
  `provideHttpClient()` + `provideHttpClientTesting()`: loads from API, optimistic save, offline queue + replay,
  401 → back to local, separate storage keys, `importLocalPresets` rename on clash.
- `cloud-connection.service.spec.ts`, `cloud-sync.component.spec.ts`: connect/disconnect flows, hidden when URL empty.

## Out of scope (possible follow-ups)
- CI deployment of the backend (first deploy is manual `sam deploy --guided`).
- Routing the API through CloudFront with an edge key check.

## Verification
1. `cd backend && npm test` and `npm run build`; `sam validate --lint`.
2. Root: `npm run lint`, `npm run test:ci`, `npm run build` — all pass, existing specs untouched in behaviour.
3. Deploy a stack, `npm run keys -- create me laptop`; `curl` the Function URL without a key → 401, with key → 200.
4. `npm start` with `intervalTimerApiUrl` set: anonymous presets work as before; connect with key; copy local presets;
   open a second browser, connect with a second key for the same profile → same presets; save offline (DevTools
   offline) then reconnect → synced; `keys revoke` → app falls back to local with an alert.
