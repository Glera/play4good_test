#!/bin/bash
# codex-agent.sh — Codex 5.2 agent with tool-use loop
# Usage: ./codex-agent.sh plan|implement <context-file>
# Requires: OPENAI_API_KEY env var, jq installed
#
# When Codex is selected as the implementer model:
# - Phase 1 (plan): ./codex-agent.sh plan /tmp/plan-context.txt
# - Phase 3 (implement): ./codex-agent.sh implement /tmp/impl-context.txt
#
# The agent calls Codex API with tool definitions (read_file, write_file,
# list_files, run_command, done) and executes tool calls in a loop until
# Codex signals completion or hits max turns.

set -euo pipefail

MODE="${1:-implement}"
CONTEXT_FILE="${2:-/dev/null}"
MAX_TURNS="${MAX_CODEX_TURNS:-30}"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Error: OPENAI_API_KEY not set" >&2
  exit 1
fi

# Read context
CONTEXT=""
if [ -f "$CONTEXT_FILE" ]; then
  CONTEXT=$(head -c 50000 "$CONTEXT_FILE")
fi

# --- System prompt based on mode ---
if [ "$MODE" = "plan" ]; then
  SYSTEM_PROMPT="You are a senior developer creating an implementation plan for a coding task.

WORKFLOW:
1. Read CLAUDE.md to understand project rules and conventions
2. Explore the codebase using read_file and list_files to understand the current state
3. Write a concise implementation plan (10-30 lines) to /tmp/plan.md using write_file
4. The plan should include: files to change, specific changes, edge cases, testing approach
5. If notify.sh exists, run: ./notify.sh plan \"\$(head -5 /tmp/plan.md)\"
6. Call done() with a brief summary

IMPORTANT:
- DO NOT make any code changes
- DO NOT commit or push anything
- ONLY write the plan to /tmp/plan.md"
else
  SYSTEM_PROMPT="You are a senior developer implementing changes in a Git repository.

WORKFLOW:
1. Read CLAUDE.md for project rules and conventions
2. Read the plan and reviewer feedback provided in the context
3. Implement the changes using write_file and run_command
4. If notify.sh exists, run: ./notify.sh progress \"Brief description\"
5. Commit and push: git add -A && git commit -m \"feat: description\" && git push
6. Call done() with a summary

RULES:
- Make clean, focused changes
- Follow project conventions from CLAUDE.md
- After pushing, call done() and STOP
- Do not loop or retry after a successful push"
fi

# --- Tools definition ---
TOOLS=$(cat << 'TOOLS_EOF'
[
  {
    "type": "function",
    "name": "read_file",
    "description": "Read contents of a file. Returns up to 30KB.",
    "parameters": {
      "type": "object",
      "properties": {
        "path": {"type": "string", "description": "File path relative to repo root"}
      },
      "required": ["path"]
    }
  },
  {
    "type": "function",
    "name": "write_file",
    "description": "Write or overwrite a file with the given content. Creates parent directories if needed.",
    "parameters": {
      "type": "object",
      "properties": {
        "path": {"type": "string", "description": "File path relative to repo root"},
        "content": {"type": "string", "description": "Full file content"}
      },
      "required": ["path", "content"]
    }
  },
  {
    "type": "function",
    "name": "list_files",
    "description": "List files in a directory (max depth 3, max 100 results).",
    "parameters": {
      "type": "object",
      "properties": {
        "directory": {"type": "string", "description": "Directory path"},
        "pattern": {"type": "string", "description": "Glob pattern (default: *)"}
      },
      "required": ["directory"]
    }
  },
  {
    "type": "function",
    "name": "run_command",
    "description": "Run a shell command. Output truncated to 10KB. Timeout: 60s.",
    "parameters": {
      "type": "object",
      "properties": {
        "command": {"type": "string", "description": "Shell command to execute"}
      },
      "required": ["command"]
    }
  },
  {
    "type": "function",
    "name": "done",
    "description": "Signal that the task is complete. Call this when finished.",
    "parameters": {
      "type": "object",
      "properties": {
        "summary": {"type": "string", "description": "Brief summary of what was done"}
      },
      "required": ["summary"]
    }
  }
]
TOOLS_EOF
)

# --- Build initial input ---
INITIAL_INPUT=$(jq -n \
  --arg system "$SYSTEM_PROMPT" \
  --arg context "$CONTEXT" \
  '[
    {"role": "developer", "content": $system},
    {"role": "user", "content": $context}
  ]')

# --- Execute a tool call ---
execute_tool() {
  local func_name="$1"
  local args_json="$2"

  case "$func_name" in
    read_file)
      local file_path
      file_path=$(echo "$args_json" | jq -r '.path')
      if [ -f "$file_path" ]; then
        head -c 30000 "$file_path"
      else
        echo "Error: file not found: $file_path"
      fi
      ;;

    write_file)
      local file_path content
      file_path=$(echo "$args_json" | jq -r '.path')
      content=$(echo "$args_json" | jq -r '.content')
      mkdir -p "$(dirname "$file_path")"
      printf '%s' "$content" > "$file_path"
      local bytes
      bytes=$(wc -c < "$file_path" | tr -d ' ')
      echo "OK: wrote ${bytes} bytes to $file_path"
      ;;

    list_files)
      local dir pattern
      dir=$(echo "$args_json" | jq -r '.directory')
      pattern=$(echo "$args_json" | jq -r '.pattern // "*"')
      if [ -d "$dir" ]; then
        find "$dir" -maxdepth 3 -name "$pattern" -type f 2>/dev/null | head -100
      else
        echo "Error: directory not found: $dir"
      fi
      ;;

    run_command)
      local cmd
      cmd=$(echo "$args_json" | jq -r '.command')
      echo "  $ $cmd" >&2
      local result
      set +e
      result=$(timeout 60 bash -c "$cmd" 2>&1 | head -c 10000)
      local exit_code=$?
      set -e
      if [ $exit_code -ne 0 ]; then
        echo "$result"
        echo "[exit code: $exit_code]"
      else
        echo "$result"
      fi
      ;;

    done)
      local summary
      summary=$(echo "$args_json" | jq -r '.summary')
      echo "$summary"
      ;;

    *)
      echo "Error: unknown tool: $func_name"
      ;;
  esac
}

# --- Agent loop ---
INPUT="$INITIAL_INPUT"
TURN=0

while [ $TURN -lt "$MAX_TURNS" ]; do
  TURN=$((TURN + 1))
  echo "--- Codex Turn $TURN/$MAX_TURNS ---" >&2

  # Call Codex API (Responses endpoint)
  HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    https://api.openai.com/v1/responses \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --argjson input "$INPUT" \
      --argjson tools "$TOOLS" \
      '{model: "gpt-5.2-codex", input: $input, tools: $tools}')")

  HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)
  BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" != "200" ]; then
    echo "Codex API error (HTTP $HTTP_CODE)" >&2
    echo "$BODY" | jq -r '.error.message // "Unknown error"' 2>/dev/null >&2
    exit 1
  fi

  # Parse output items
  OUTPUT=$(echo "$BODY" | jq '.output // []')
  NUM_ITEMS=$(echo "$OUTPUT" | jq 'length')

  if [ "$NUM_ITEMS" = "0" ]; then
    echo "Empty response from Codex" >&2
    break
  fi

  # Process each output item
  HAS_FUNCTION_CALLS=false
  NEW_INPUT_ITEMS="[]"

  for i in $(seq 0 $((NUM_ITEMS - 1))); do
    ITEM_TYPE=$(echo "$OUTPUT" | jq -r ".[$i].type")

    if [ "$ITEM_TYPE" = "function_call" ]; then
      HAS_FUNCTION_CALLS=true
      CALL_ID=$(echo "$OUTPUT" | jq -r ".[$i].call_id // .[$i].id")
      FUNC_NAME=$(echo "$OUTPUT" | jq -r ".[$i].name")
      ARGS_RAW=$(echo "$OUTPUT" | jq -r ".[$i].arguments")
      ARGS=$(echo "$ARGS_RAW" | jq '.' 2>/dev/null || echo "{}")

      echo "  Tool: $FUNC_NAME ($CALL_ID)" >&2

      # Execute the tool
      RESULT=$(execute_tool "$FUNC_NAME" "$ARGS")

      # Handle "done" tool — exit immediately
      if [ "$FUNC_NAME" = "done" ]; then
        echo "$RESULT"
        exit 0
      fi

      # Add the function_call item itself (echo back to the model)
      ITEM=$(echo "$OUTPUT" | jq ".[$i]")
      NEW_INPUT_ITEMS=$(echo "$NEW_INPUT_ITEMS" | jq --argjson item "$ITEM" '. + [$item]')

      # Add the tool result
      NEW_INPUT_ITEMS=$(echo "$NEW_INPUT_ITEMS" | jq \
        --arg id "$CALL_ID" \
        --arg output "$RESULT" \
        '. + [{"type": "function_call_output", "call_id": $id, "output": $output}]')

    elif [ "$ITEM_TYPE" = "message" ]; then
      # Print message text to stderr (progress)
      TEXT=$(echo "$OUTPUT" | jq -r ".[$i].content[]? | select(.type == \"output_text\") | .text" 2>/dev/null || echo "")
      if [ -n "$TEXT" ]; then
        echo "  Codex: $TEXT" >&2
      fi
      # Add message item to input for context continuity
      ITEM=$(echo "$OUTPUT" | jq ".[$i]")
      NEW_INPUT_ITEMS=$(echo "$NEW_INPUT_ITEMS" | jq --argjson item "$ITEM" '. + [$item]')
    fi
  done

  if [ "$HAS_FUNCTION_CALLS" = "false" ]; then
    # No tool calls — model is done talking
    FINAL_TEXT=$(echo "$OUTPUT" | jq -r '[.[] | select(.type == "message") | .content[]? | select(.type == "output_text") | .text] | join("\n")' 2>/dev/null || echo "Codex completed")
    echo "$FINAL_TEXT"
    break
  fi

  # Append new items to input for next turn
  INPUT=$(echo "$INPUT" | jq --argjson items "$NEW_INPUT_ITEMS" '. + $items')
done

echo "Codex agent completed after $TURN turns" >&2
