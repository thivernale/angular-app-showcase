# Interval timer storage API

Optional cloud storage for interval timer presets: one Lambda function behind a Function URL, and one DynamoDB
table. Without it the app keeps presets in the browser only (anonymous mode). Design notes:
[`docs/interval-timer-cloud-storage.md`](../docs/interval-timer-cloud-storage.md).

## Access model

- Each request carries `Authorization: Bearer <key>`. Keys are random 32-byte strings; only their SHA-256 hashes are
  stored. A key belongs to one **profile**; a profile can have several keys (e.g. one per device).
- The profile is always taken from the key, so a key can only read and change its own profile's presets.
- Keys are created and revoked with the local admin script below, using your own AWS credentials. The public API
  cannot create keys.

## API

| Method | Path | Result |
|---|---|---|
| `GET` | `/me` | `{ profile, label }` for the key |
| `GET` | `/presets` | `{ presets: [...] }` |
| `PUT` | `/presets` | Creates or replaces the preset in the JSON body (matched by `name`) |
| `DELETE` | `/presets?name=<name>` | Deletes a preset |

Errors: `401` bad key, `400` invalid preset, `409` profile full, `413` body too large, `503` table busy (retry later).

## Deploy

Requires the AWS CLI (with credentials) and the AWS SAM CLI.

```bash
cd backend
npm install
sam build
sam deploy --guided   # first time; asks for the stack name, region and the parameters below
```

Parameters:

| Parameter | Meaning |
|---|---|
| `AllowedOrigins` | Comma-separated browser origins allowed by CORS, e.g. `https://example.com,http://localhost:4200` |
| `AlertEmail` | Receives the cost budget alert (any actual cost above $0.01 in a month) |
| `ReadCapacityUnits` / `WriteCapacityUnits` | Default 5 each. Free while all provisioned tables in the region total 25 or less of each |

Then set `intervalTimerApiUrl` in `src/environments/environment*.ts` to the `FunctionUrl` stack output, without the
trailing slash.

Check it: `curl -i <FunctionUrl>/me` must return `401`.

## Keys

The script needs the table's real name, which CloudFormation generates (e.g. `<stack>-Table-1A2B3C4D5E6F`), and the
region the stack was deployed to. Both come from the deployment:

```bash
export AWS_REGION=<region chosen in sam deploy>
export TABLE_NAME=$(aws cloudformation describe-stacks --stack-name <stack name> \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)
```

A "Table ... not found" error means one of the two is wrong. Then:

```bash
npm run keys -- create me laptop     # prints the key once; keep it in a password manager
npm run keys -- create me phone
npm run keys -- list                 # profiles and labels, never keys
npm run keys -- revoke me phone      # that key stops working immediately
```

In the app, paste the key into the cloud field of the interval timer once per device.

## Limits

| What | Limit | Notes |
|---|---|---|
| Preset name | 100 characters | Also enforced by the input field |
| Exercises text | 10,000 characters | 100 lines of 80 characters is about 8,100 |
| Video URL | 500 characters | |
| Numbers (rounds, work, rest, intro) | 0 to 100,000 | |
| Request body | 64 KB | Fits the longest preset even with 4-byte characters |
| Presets per profile | 200 | Counted with a counter item, so the check is cheap |
| Concurrent requests | 2 | Reserved concurrency caps the cost of a request flood |

Capacity, for 100 presets with 8 KB exercise lists each (the large case):

- Loading the list reads about 800 KB, roughly 100 read units. Unused capacity accumulates for up to 5 minutes
  (1,500 units at 5 per second), so occasional syncs are served immediately; many back-to-back syncs get `503` and the
  app retries later.
- Saving one such preset uses about 8 write units (16 when new, because it is written in a transaction with the
  counter). Copying 100 of them in one go needs about 1,600 units, slightly above the burst allowance; the rest stays
  queued in the app and is sent on the next sync.
- Typical presets (under 1 KB) use 1–2 units per save and a few units per full list.

Browser storage: about 5 MB per site. 100 presets of 8 KB take about 0.8 MB per copy; the app may hold the anonymous
list, the profile's device copy and unsent changes at the same time. If storage is full, the app refuses the change
and says so.

## Local development

Runs the real handler against DynamoDB Local; nothing is created in AWS.

```bash
docker run -d --rm -p 8000:8000 --name interval-timer-dynamodb amazon/dynamodb-local
npm run local                        # API on http://localhost:3100, creates the table if needed
DYNAMODB_ENDPOINT=http://localhost:8000 TABLE_NAME=interval-timer-local npm run keys -- create me laptop
```

Set `intervalTimerApiUrl: 'http://localhost:3100'` in `environment.development.ts` (don't commit it) and run
`npm start` in the repository root. `docker stop interval-timer-dynamodb` discards the local data.

## Tests

```bash
npm test         # handler, validation and DynamoDB access (mocked); no AWS needed
npm run typecheck
```
