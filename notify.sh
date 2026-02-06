#!/bin/bash
# notify.sh — send message from Claude to Telegram
# Usage: ./notify.sh <type> <message>
# Types: plan, progress, question, done, error, info

BOT_URL="${BOT_NOTIFY_URL:-https://play4good-bot.onrender.com}"
BRANCH="${GITHUB_HEAD_REF:-$GITHUB_REF_NAME}"
ISSUE_NUMBER="${ISSUE_NUMBER:-0}"

TYPE="${1:-info}"
shift
MESSAGE="$*"

if [ -z "$MESSAGE" ]; then
  echo "Usage: ./notify.sh <type> <message>"
  echo "Types: plan, progress, question, done, error, info"
  exit 1
fi

curl -s -X POST "$BOT_URL/claude/message" \
  -H "Content-Type: application/json" \
  -d "{
    \"branch\": \"$BRANCH\",
    \"issue_number\": \"$ISSUE_NUMBER\",
    \"type\": \"$TYPE\",
    \"text\": \"$MESSAGE\"
  }" > /dev/null

echo "📤 Sent to Telegram: [$TYPE] $MESSAGE"
