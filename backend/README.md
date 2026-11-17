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
| `GET` | `/library` | `{ folders: [...], presets: [...] }`, the whole profile in one read |
| `PUT` | `/presets` | Creates or replaces the preset in the JSON body (matched by `id`); returns `{ preset }` |
| `DELETE` | `/presets?id=<id>` | Deletes a preset |
| `PUT` | `/folders` | Creates (or replaces) the folder `{ id, name }` in the JSON body; returns `{ folder }` |
| `PATCH` | `/folders` | Renames the existing folder `{ id, name }`; `404` if it no longer exists; returns `{ folder }` |
| `DELETE` | `/folders?id=<id>` | Deletes a folder **and the presets in it** |

Presets and folders are identified by ids generated on the device: 1-64 characters from `A-Z`, `a-z`, `0-9` and `-`.
Every preset carries a `folderId`, either `default` (the built-in folder, which is never stored and cannot be changed
or deleted) or the id of one of the profile's folders. Folder design notes:
[`docs/interval-timer-folders.md`](../docs/interval-timer-folders.md).

Errors: `401` bad key, `400` invalid preset or folder (or a missing `id`, or deleting `default`), `404` preset saved
into a folder that does not exist, `409` profile full, `413` body too large, `503` table busy (retry later).

## Deploy

Requires the AWS CLI (with credentials) and the AWS SAM CLI.

```bash
cd backend
npm install
sam build
sam deploy --guided   # first time; asks for the stack name, region and the parameters below
```

Or without prompts (creates the stack the first time, updates it afterwards; the same command CI runs):

```bash
sam deploy --stack-name <stack name> --region <region> --resolve-s3 \
  --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides AllowedOrigins=<origins> AlertEmail=<email>
```

Keep the stack name and region the same on every deploy: a different one creates a second stack with a new, empty
table and a new Function URL.

Parameters:

| Parameter | Meaning |
|---|---|
| `AllowedOrigins` | Comma-separated browser origins allowed by CORS, e.g. `https://example.com,http://localhost:4200` |
| `AlertEmail` | Receives the cost budget alert (any actual cost above $0.01 in a month) |
| `ReadCapacityUnits` / `WriteCapacityUnits` | Default 5 each. Free while all provisioned tables in the region total 25 or less of each |

The frontend reaches the API through `intervalTimerApiUrl` in `src/environments/environment.ts`, the `FunctionUrl`
stack output without the trailing slash. It stays empty in the repository: the CI deploy fills it in (see below).
For a production build made by hand, set it locally and don't commit it.

Check it: `curl -i <FunctionUrl>/me` must return `401`.

### From CI

`.github/workflows/ci-workflow.yml` runs the backend tests on every branch. On `main` it deploys the stack on every run
(when nothing changed, the deploy is a no-op), then reads the stack's `FunctionUrl` output. The
frontend is built after that with this URL written into `environment.ts` and then deployed, so a new frontend never
goes live against an older API. Branches other than `main` are never deployed.

The deploy job signs in to AWS with GitHub's OIDC token (no stored AWS keys) and assumes a deploy role. The role
has two policies, both in [`deploy-role/`](deploy-role):

- `trust-policy.json`: who may assume the role. Only workflow runs on this repository's `main` branch.
- `permissions-policy.json`: what `sam deploy` needs. CloudFormation creates and updates the stack's resources with
  the caller's permissions, so the role needs rights on each resource type in `template.yaml`, limited to names
  starting with the stack name:

  | Statement | Needed for |
  |---|---|
  | `CloudFormationStack`, `CloudFormationGlobal` | Change sets for the stack, the SAM transform, reading the `FunctionUrl` output |
  | `SamArtifactBucket` | Uploading the built code to the bucket `--resolve-s3` created on the first deploy |
  | `Lambda` | The function, its reserved concurrency and its public Function URL |
  | `FunctionRole`, `PassFunctionRoleToLambda` | The function's own role (created by SAM, gives it access to the table) |
  | `Table` | The DynamoDB table (its definition, not its data) |
  | `LogGroup`, `LogGroupDescribe` | The function's log group and its retention |
  | `Budget` | The monthly cost alert |

  The create and delete actions are only used when an update replaces a resource or is rolled back; a code-only
  deploy uses `UpdateFunctionCode` and read actions. If a deploy fails with `AccessDenied`, the error names the
  missing action.

One-time setup, after a first manual `sam deploy` has created the stack (the managed artifact bucket must exist):

```bash
cd backend/deploy-role
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=<region of the stack>          # must equal the AWS_REGION repository variable
STACK_NAME=<stack name>
GITHUB_REPOSITORY=<owner>/<repo>
ROLE_NAME=github-deploy-$STACK_NAME   # deliberately not starting with the stack name

# The OIDC identity provider, once per account (skip if IAM already lists token.actions.githubusercontent.com)
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com

fill() { sed -e "s#ACCOUNT_ID#$ACCOUNT_ID#g" -e "s#REGION#$REGION#g" -e "s#STACK_NAME#$STACK_NAME#g" \
  -e "s#GITHUB_REPOSITORY#$GITHUB_REPOSITORY#g" "$1"; }
aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$(fill trust-policy.json)"
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name sam-deploy \
  --policy-document "$(fill permissions-policy.json)"
aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text   # value for BACKEND_DEPLOY_ROLE_ARN
```

Then, in the GitHub repository settings (Settings → Secrets and variables → Actions):

| Name | Kind | Value |
|---|---|---|
| `BACKEND_DEPLOY_ROLE_ARN` | variable | the role ARN printed above |
| `BACKEND_STACK_NAME` | variable | the stack name |
| `BACKEND_ALLOWED_ORIGINS` | variable | the `AllowedOrigins` parameter |
| `BACKEND_ALERT_EMAIL` | secret | the `AlertEmail` parameter |

The stack is deployed to the region in the existing `AWS_REGION` variable, which the frontend deploy uses as well.
A stack name or region that differs from the existing stack creates a second stack with an empty table.

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

## Removing presets from the name-keyed version

Presets were first stored keyed by name, without an `id`. `GET /library` ignores such items, but they still count
towards the 200-preset limit. With `TABLE_NAME` and `AWS_REGION` set as above, while the app is not in use:

```bash
npm run cleanup-legacy               # dry run: legacy items and real preset/folder counts per profile
npm run cleanup-legacy -- --apply    # delete the legacy items and set the counters to the real counts
```

## Limits

| What | Limit | Notes |
|---|---|---|
| Preset name | 100 characters | Also enforced by the input field |
| Exercises text | 10,000 characters | 100 lines of 80 characters is about 8,100 |
| Video URL | 500 characters | |
| Description | 500 characters | Free-text notes, shown in the setup only |
| Numbers (rounds, work, rest, intro) | 0 to 100,000 | |
| Request body | 64 KB | Fits the longest preset even with 4-byte characters |
| Presets per profile | 200 | Counted with a counter item, so the check is cheap |
| Folders per profile | 50 | Not counting the default folder; counted like presets |
| Folder name | 40 characters | Uniqueness within a profile is checked by the app, not the API |
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
