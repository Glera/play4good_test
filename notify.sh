#!/bin/bash
# notify.sh — send message from Claude to Telegram
# Usage: ./notify.sh <type> <message>
# Types: plan, progress, question, done, error, info, codex_review, test_pass, test_fail, perf_pass, perf_fail

BOT_URL="${BOT_NOTIFY_URL:-https://play4good-bot.onrender.com}"
BRANCH="${DEV_BRANCH:-${GITHUB_HEAD_REF:-$GITHUB_REF_NAME}}"
REPO="${GH_REPO:-${GITHUB_REPOSITORY:-}}"
ISSUE_NUMBER="${ISSUE_NUMBER:-0}"
PHASE="${PHASE_NAME:-}"

TYPE="${1:-info}"
shift
MESSAGE="$*"

if [ -z "$MESSAGE" ]; then
  echo "Usage: ./notify.sh <type> <message>"
  echo "Types: plan, progress, question, done, error, info"
  exit 1
fi

# Build JSON safely using jq (available on GitHub Actions runners)
# Falls back to python, then to basic sed escaping
if command -v jq &>/dev/null; then
  JSON_BODY=$(jq -n \
    --arg branch "$BRANCH" \
    --arg repo "$REPO" \
    --arg issue_number "$ISSUE_NUMBER" \
    --arg type "$TYPE" \
    --arg text "$MESSAGE" \
    --arg phase "$PHASE" \
    '{branch: $branch, repo: $repo, issue_number: $issue_number, type: $type, text: $text, phase_name: $phase}')
elif command -v python3 &>/dev/null; then
  JSON_BODY=$(python3 -c "
import json, sys
print(json.dumps({
    'branch': sys.argv[1],
    'repo': sys.argv[2],
    'issue_number': sys.argv[3],
    'type': sys.argv[4],
    'text': sys.argv[5],
    'phase_name': sys.argv[6]
}))" "$BRANCH" "$REPO" "$ISSUE_NUMBER" "$TYPE" "$MESSAGE" "$PHASE")
else
  # Last resort: basic escaping (handles newlines, quotes, backslashes)
  SAFE_MSG=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')
  SAFE_PHASE=$(printf '%s' "$PHASE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  JSON_BODY="{\"branch\":\"$BRANCH\",\"repo\":\"$REPO\",\"issue_number\":\"$ISSUE_NUMBER\",\"type\":\"$TYPE\",\"text\":\"$SAFE_MSG\",\"phase_name\":\"$SAFE_PHASE\"}"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BOT_URL/claude/message" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "Sent to Telegram: [$TYPE] $(echo "$MESSAGE" | head -1)"
else
  echo "WARNING: notify.sh failed (HTTP $HTTP_CODE): $BODY"
  echo "JSON sent: $JSON_BODY" | head -c 500
fi
