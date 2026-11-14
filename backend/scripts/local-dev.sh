#!/usr/bin/env bash
# Local development of the interval timer storage API against DynamoDB Local (see backend/README.md).
#
#   backend/scripts/local-dev.sh up     Start DynamoDB Local and the API, create a key, point the dev frontend at it
#   backend/scripts/local-dev.sh down   Stop both (discards the local data) and clear the frontend setting
#
# "up" reuses a DynamoDB Local container or API that is already running, so it can be run again after the API
# stopped without losing the local data. After "up", run `npm start` in the repository root and paste the printed key
# into the interval timer's cloud field.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$BACKEND_DIR/../src/environments/environment.development.ts"
CONTAINER=interval-timer-dynamodb
DYNAMODB_URL=http://localhost:8000
TABLE=interval-timer-local
API_URL=http://localhost:3100
LOG_FILE="${TMPDIR:-/tmp}/interval-timer-local-api.log"
PROFILE=me
LABEL=laptop

api_up() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/me" || true)" = 401 ]
}

keys() {
  (cd "$BACKEND_DIR" && DYNAMODB_ENDPOINT=$DYNAMODB_URL TABLE_NAME=$TABLE npm run --silent keys -- "$@")
}

up() {
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" = true ]; then
    echo "DynamoDB Local already running on $DYNAMODB_URL (container $CONTAINER), reusing it"
  else
    # Started with --rm, so a stopped container is already gone; remove a leftover one just in case.
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker run -d --rm -p 8000:8000 --name "$CONTAINER" amazon/dynamodb-local >/dev/null
    echo "DynamoDB Local started on $DYNAMODB_URL"
  fi

  if api_up; then
    echo "API already running on $API_URL, reusing it (log: $LOG_FILE)"
  else
    [ -d "$BACKEND_DIR/node_modules" ] || (cd "$BACKEND_DIR" && npm install)
    # The exit line records how npm ended; if it is missing, the process was killed without a chance to log.
    # The subshell's own stdin/stdout/stderr are detached too, so the API holds no handle to this terminal or to a
    # pipe the script's output goes into (on Windows such a handle is inherited and keeps the pipe open).
    (cd "$BACKEND_DIR" && nohup bash -c \
      'npm run local; echo "$(date -u "+%Y-%m-%dT%H:%M:%SZ") npm run local exited with code $?"' \
      >>"$LOG_FILE" 2>&1 &) </dev/null >/dev/null 2>&1
    for _ in $(seq 1 60); do
      api_up && break
      sleep 0.5
    done
    api_up || { tail -n 30 "$LOG_FILE"; exit 1; }
    echo "API started on $API_URL (log: $LOG_FILE)"
  fi

  if keys list | grep -q "^$PROFILE	$LABEL	"; then
    echo "Key \"$LABEL\" for profile \"$PROFILE\" already exists; it was shown when it was created."
  else
    keys create "$PROFILE" "$LABEL"
  fi

  sed -i "s#intervalTimerApiUrl: '[^']*'#intervalTimerApiUrl: '$API_URL'#" "$ENV_FILE"
  echo "Set intervalTimerApiUrl to $API_URL in environment.development.ts (don't commit it)."
  echo "Next: npm start in the repository root, then paste the key into the interval timer."
}

down() {
  # The API server: whatever listens on port 3100.
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:3100 -sTCP:LISTEN | xargs -r kill
  else
    for pid in $(netstat -ano | awk '$2 ~ /:3100$/ && $4 == "LISTENING" { print $5 }' | sort -u); do
      taskkill //PID "$pid" //T //F >/dev/null
    done
  fi
  docker stop "$CONTAINER" >/dev/null 2>&1 || true
  sed -i "s#intervalTimerApiUrl: '[^']*'#intervalTimerApiUrl: ''#" "$ENV_FILE"
  echo "Stopped the API and DynamoDB Local; cleared intervalTimerApiUrl."
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  *) echo "Usage: $0 up|down" >&2; exit 1 ;;
esac
