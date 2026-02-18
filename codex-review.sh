#!/bin/bash
# codex-review.sh — Call Codex 5.2 for plan/code review
# Usage: ./codex-review.sh plan|code <file>
# Requires: OPENAI_API_KEY env var, jq installed

set -euo pipefail

MODE="${1:-plan}"
FILE="${2:-/dev/stdin}"

if [ ! -f "$FILE" ] && [ "$FILE" != "/dev/stdin" ]; then
  echo "File not found: $FILE"
  exit 1
fi

CONTENT=$(head -c 30000 "$FILE")

if [ "$MODE" = "plan" ]; then
  PROMPT="Ты — senior code reviewer (роль: Codex-критик). Тебе дают план разработки по тикету.

Дай краткие, конкретные замечания (3-5 пунктов):
- Полнота плана (все ли файлы учтены?)
- Потенциальные проблемы и edge cases
- Пропущенные шаги
- Риски регрессий

Если план хороший — скажи '✅ План выглядит хорошо' и укажи 1-2 вещи на что обратить внимание.
Отвечай на русском. Кратко (не больше 10 строк).

ПЛАН:
$CONTENT"
else
  PROMPT="Ты — senior code reviewer (роль: Codex-критик). Тебе дают git diff после реализации тикета.

Дай краткие, конкретные замечания (3-5 пунктов):
- Баги и логические ошибки
- Пропущенные edge cases
- Стилевые проблемы
- Риски регрессий
- Соответствие правилам проекта (см. контекст)

Если код хороший — скажи '✅ Код выглядит хорошо' и укажи 1-2 вещи на что обратить внимание.
Отвечай на русском. Кратко (не больше 15 строк).

DIFF:
$CONTENT"
fi

# Add project context if CLAUDE.md exists
if [ -f "CLAUDE.md" ]; then
  PROMPT="$PROMPT

КОНТЕКСТ ПРОЕКТА (CLAUDE.md):
$(head -100 CLAUDE.md)"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg input "$PROMPT" '{
    model: "gpt-5.2-codex",
    input: $input
  }')")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "Codex API error (HTTP $HTTP_CODE). Skipping review."
  exit 0
fi

# Extract text — try multiple response formats
TEXT=$(echo "$BODY" | jq -r '
  .output_text //
  ([.output[]? | select(.type == "message") | .content[]? | select(.type == "output_text") | .text] | join("\n")) //
  .choices[0].message.content //
  "Review unavailable"
' 2>/dev/null || echo "Review parse error")

echo "$TEXT"
