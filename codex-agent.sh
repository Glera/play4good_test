#!/bin/bash
# codex-agent.sh — OpenAI agent with tool-use loop (optimized)
# Usage: ./codex-agent.sh plan|implement <context-file>
# Requires: OPENAI_API_KEY env var, jq installed
#
# Env vars (all optional except OPENAI_API_KEY):
#   CODEX_MODEL          — model id (default: gpt-5.2-codex)
#   CODEX_REASONING      — reasoning effort: none|low|medium|high (default: low)
#   CODEX_MAX_OUTPUT     — max_output_tokens per turn (default: 1400)
#   MAX_CODEX_TURNS      — max turns per session (default: 12)
#   CODEX_MAX_SESSIONS   — max session restarts via checkpoint (default: 3)
#   REPO_CACHE_KEY       — prompt cache key (default: repo:$GITHUB_REPOSITORY:agent:v1)
#
# Token optimization:
#   - reasoning.effort: low by default, auto-escalates to medium on build failure
#   - max_output_tokens: 1400 (tight), auto-reduced if reasoning ratio too high
#   - max_tool_calls: 6 per turn, parallel_tool_calls: false
#   - truncation: auto (safety net for long conversations)
#   - prompt caching: 24h retention for stable system+tools prefix
#   - Session splitting: 12 turns max, then checkpoint-summary + new session
#   - Tool output limits: read_file 15KB, run_command 5KB

set -euo pipefail

MODE="${1:-implement}"
CONTEXT_FILE="${2:-/dev/null}"
SESSION_TURNS="${MAX_CODEX_TURNS:-12}"
MAX_SESSIONS="${CODEX_MAX_SESSIONS:-3}"
MODEL="${CODEX_MODEL:-gpt-5.2-codex}"
REASONING_EFFORT="${CODEX_REASONING:-low}"
MAX_OUTPUT="${CODEX_MAX_OUTPUT:-1400}"
CACHE_KEY="${REPO_CACHE_KEY:-repo:${GITHUB_REPOSITORY:-local}:agent:v1}"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Error: OPENAI_API_KEY not set" >&2
  exit 1
fi

# Read context
ORIGINAL_CONTEXT=""
if [ -f "$CONTEXT_FILE" ]; then
  ORIGINAL_CONTEXT=$(head -c 50000 "$CONTEXT_FILE")
fi

# Usage tracking (cumulative across all sessions)
TOTAL_INPUT=0
TOTAL_CACHED=0
TOTAL_OUTPUT=0
TOTAL_REASONING=0
GLOBAL_TURN=0

# Auto-gating: consecutive high reasoning-ratio turns
HIGH_RATIO_COUNT=0

# Reasoning escalation: low → medium once on build/test failure
ESCALATED="false"

echo "Config: model=$MODEL reasoning=$REASONING_EFFORT max_output=$MAX_OUTPUT turns/session=$SESSION_TURNS sessions=$MAX_SESSIONS cache=$CACHE_KEY" >&2

# --- Agent rules (appended to system prompt — stable prefix for caching) ---
AGENT_RULES="
AGENT RULES (mandatory):
1) Keep plans <= 5 steps.
2) Read only necessary files; do not reread full files if already read.
3) Prefer targeted ranges and summaries over full logs.
4) Run at most one test command per iteration.
5) Return concise patch + verification result.
6) If blocked after 2 retries, change approach instead of repeating."

# --- System prompt based on mode ---
if [ "$MODE" = "plan" ]; then
  SYSTEM_PROMPT="You are a coding agent creating an implementation plan.
${AGENT_RULES}

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
  SYSTEM_PROMPT="You are a coding agent implementing changes in a Git repository.
${AGENT_RULES}

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
    "description": "Read contents of a file. Returns up to 15KB. For large files, use run_command with head/tail/sed to read specific sections.",
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
    "description": "Run a shell command. Output truncated to 5KB. Timeout: 60s. For verbose output, pipe through tail -50 or grep.",
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

# --- Execute a tool call ---
execute_tool() {
  local func_name="$1"
  local args_json="$2"

  case "$func_name" in
    read_file)
      local file_path
      file_path=$(echo "$args_json" | jq -r '.path')
      if [ -f "$file_path" ]; then
        head -c 15000 "$file_path"
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
      result=$(timeout 60 bash -c "$cmd" 2>&1 | head -c 5000)
      local exit_code=$?
      set -e

      if [ $exit_code -ne 0 ]; then
        echo "$result"
        echo "[exit code: $exit_code]"

        # Auto-escalate reasoning on build/test failure (once)
        if [ "$ESCALATED" = "false" ] && [ "$REASONING_EFFORT" = "low" ]; then
          if echo "$cmd" | grep -qiE 'npm (run |test|run build|run check)'; then
            REASONING_EFFORT="medium"
            ESCALATED="true"
            echo "  [auto-escalate] reasoning: low → medium (build/test failure)" >&2
          fi
        fi
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

# --- API call helper (with retry on 429) ---
api_call() {
  local request_body="$1"
  local retry=0
  local max_retries=3

  while true; do
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
      https://api.openai.com/v1/responses \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$request_body")

    HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)
    BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "429" ] && [ $retry -lt $max_retries ]; then
      retry=$((retry + 1))
      local wait_time
      wait_time=$(echo "$BODY" | jq -r '.error.message' 2>/dev/null | grep -oP 'in \K[0-9.]+' || echo "10")
      local wait_int
      wait_int=$(printf "%.0f" "$wait_time" 2>/dev/null || echo "10")
      [ "$wait_int" -lt 5 ] && wait_int=5
      echo "  Rate limited — waiting ${wait_int}s (retry $retry/$max_retries)" >&2
      sleep "$wait_int"
      continue
    fi
    break
  done

  if [ "$HTTP_CODE" != "200" ]; then
    echo "API error (HTTP $HTTP_CODE)" >&2
    echo "$BODY" | jq -r '.error.message // "Unknown error"' >&2
    echo "Request (first 500 chars): $(echo "$request_body" | head -c 500)" >&2
    return 1
  fi

  # Return body via stdout
  echo "$BODY"
}

# --- Build request body ---
build_request() {
  local input="$1"
  local prev_id="${2:-}"

  local base_args=(
    --argjson input "$input"
    --argjson tools "$TOOLS"
    --arg model "$MODEL"
    --arg effort "$REASONING_EFFORT"
    --argjson max_out "$MAX_OUTPUT"
    --arg cache_key "$CACHE_KEY"
  )

  if [ -z "$prev_id" ]; then
    jq -n "${base_args[@]}" \
      '{model: $model, input: $input, tools: $tools, store: true,
        max_output_tokens: $max_out,
        max_tool_calls: 6,
        parallel_tool_calls: false,
        truncation: "auto",
        reasoning: {effort: $effort},
        prompt_cache_key: $cache_key,
        prompt_cache_retention: "24h"}'
  else
    jq -n "${base_args[@]}" --arg prev_id "$prev_id" \
      '{model: $model, input: $input, tools: $tools, store: true,
        previous_response_id: $prev_id,
        max_output_tokens: $max_out,
        max_tool_calls: 6,
        parallel_tool_calls: false,
        truncation: "auto",
        reasoning: {effort: $effort},
        prompt_cache_key: $cache_key,
        prompt_cache_retention: "24h"}'
  fi
}

# --- Log usage and auto-gate ---
log_usage() {
  local body="$1"

  local t_in t_cached t_out t_reason
  t_in=$(echo "$body" | jq '.usage.input_tokens // 0')
  t_cached=$(echo "$body" | jq '.usage.input_tokens_details.cached_tokens // 0')
  t_out=$(echo "$body" | jq '.usage.output_tokens // 0')
  t_reason=$(echo "$body" | jq '.usage.output_tokens_details.reasoning_tokens // 0')

  TOTAL_INPUT=$((TOTAL_INPUT + t_in))
  TOTAL_CACHED=$((TOTAL_CACHED + t_cached))
  TOTAL_OUTPUT=$((TOTAL_OUTPUT + t_out))
  TOTAL_REASONING=$((TOTAL_REASONING + t_reason))

  echo "  Usage: in=${t_in} cached=${t_cached} out=${t_out} reasoning=${t_reason} | total: in=${TOTAL_INPUT} out=${TOTAL_OUTPUT} reasoning=${TOTAL_REASONING}" >&2

  # Auto-gate: if reasoning/output > 0.6 twice in a row → reduce max_output by 20%
  if [ "$t_out" -gt 0 ]; then
    local ratio_pct=$(( (t_reason * 100) / t_out ))
    if [ "$ratio_pct" -gt 60 ]; then
      HIGH_RATIO_COUNT=$((HIGH_RATIO_COUNT + 1))
      if [ "$HIGH_RATIO_COUNT" -ge 2 ]; then
        local new_max=$(( (MAX_OUTPUT * 80) / 100 ))
        [ "$new_max" -lt 400 ] && new_max=400
        echo "  [auto-gate] reasoning ratio ${ratio_pct}% twice — max_output: ${MAX_OUTPUT} → ${new_max}" >&2
        MAX_OUTPUT=$new_max
        HIGH_RATIO_COUNT=0
      fi
    else
      HIGH_RATIO_COUNT=0
    fi
  fi
}

# --- Generate checkpoint summary ---
generate_checkpoint() {
  local prev_id="$1"
  local pending_input="$2"

  echo "  Generating checkpoint summary..." >&2

  # Send pending tool outputs (if any) + checkpoint request
  local checkpoint_msg='{"role": "user", "content": "SESSION LIMIT REACHED. Provide a checkpoint summary (300-500 tokens): what was accomplished, what remains to do, current state of files and git. This will be the context for a continuation session."}'
  local checkpoint_input
  checkpoint_input=$(echo "$pending_input" | jq ". + [$checkpoint_msg]")

  local req
  req=$(jq -n \
    --argjson input "$checkpoint_input" \
    --arg model "$MODEL" \
    --arg prev_id "$prev_id" \
    '{model: $model, input: $input, store: true,
      previous_response_id: $prev_id,
      max_output_tokens: 600,
      reasoning: {effort: "none"}}')

  local resp
  resp=$(api_call "$req") || { echo "Checkpoint failed"; return 1; }

  log_usage "$resp"

  # Extract summary text
  echo "$resp" | jq -r '
    [.output[]? | select(.type == "message") | .content[]? | select(.type == "output_text") | .text] | join("\n")
  ' 2>/dev/null || echo "Checkpoint summary unavailable"
}

# =====================================================
# MAIN: Session loop
# =====================================================

CONTEXT="$ORIGINAL_CONTEXT"
SESSION=0

while [ $SESSION -lt "$MAX_SESSIONS" ]; do
  SESSION=$((SESSION + 1))
  PREV_RESPONSE_ID=""
  TURN=0
  COMPLETED=false

  echo "=== Session $SESSION/$MAX_SESSIONS (global turn $GLOBAL_TURN) ===" >&2

  # Build initial input for this session
  INPUT=$(jq -n \
    --arg system "$SYSTEM_PROMPT" \
    --arg context "$CONTEXT" \
    '[
      {"role": "developer", "content": $system},
      {"role": "user", "content": $context}
    ]')

  # --- Turn loop ---
  while [ $TURN -lt "$SESSION_TURNS" ]; do
    TURN=$((TURN + 1))
    GLOBAL_TURN=$((GLOBAL_TURN + 1))
    echo "--- Turn $TURN/$SESSION_TURNS (session $SESSION, global $GLOBAL_TURN) ---" >&2

    # Build and send request
    REQUEST_BODY=$(build_request "$INPUT" "$PREV_RESPONSE_ID")

    BODY=$(api_call "$REQUEST_BODY") || exit 1

    # Save response ID
    PREV_RESPONSE_ID=$(echo "$BODY" | jq -r '.id')
    echo "  Response ID: $PREV_RESPONSE_ID" >&2

    # Log usage + auto-gate
    log_usage "$BODY"

    # Parse output items
    OUTPUT=$(echo "$BODY" | jq '.output // []')
    NUM_ITEMS=$(echo "$OUTPUT" | jq 'length')

    if [ "$NUM_ITEMS" = "0" ]; then
      echo "Empty response" >&2
      COMPLETED=true
      break
    fi

    # Process output items
    HAS_FUNCTION_CALLS=false
    TOOL_OUTPUTS="[]"

    for i in $(seq 0 $((NUM_ITEMS - 1))); do
      ITEM_TYPE=$(echo "$OUTPUT" | jq -r ".[$i].type")

      if [ "$ITEM_TYPE" = "function_call" ]; then
        HAS_FUNCTION_CALLS=true
        CALL_ID=$(echo "$OUTPUT" | jq -r ".[$i].call_id // .[$i].id")
        FUNC_NAME=$(echo "$OUTPUT" | jq -r ".[$i].name")
        ARGS_RAW=$(echo "$OUTPUT" | jq -r ".[$i].arguments")
        ARGS=$(echo "$ARGS_RAW" | jq '.' 2>/dev/null || echo "{}")

        echo "  Tool: $FUNC_NAME ($CALL_ID)" >&2

        RESULT=$(execute_tool "$FUNC_NAME" "$ARGS")

        # Handle "done" tool — print summary, log totals, exit
        if [ "$FUNC_NAME" = "done" ]; then
          echo "$RESULT"
          echo "--- Agent completed (turn $GLOBAL_TURN) ---" >&2
          echo "Total usage: input=${TOTAL_INPUT} (cached=${TOTAL_CACHED}) output=${TOTAL_OUTPUT} (reasoning=${TOTAL_REASONING})" >&2
          exit 0
        fi

        TOOL_OUTPUTS=$(echo "$TOOL_OUTPUTS" | jq \
          --arg id "$CALL_ID" \
          --arg output "$RESULT" \
          '. + [{"type": "function_call_output", "call_id": $id, "output": $output}]')

      elif [ "$ITEM_TYPE" = "message" ]; then
        TEXT=$(echo "$OUTPUT" | jq -r ".[$i].content[]? | select(.type == \"output_text\") | .text" 2>/dev/null || echo "")
        if [ -n "$TEXT" ]; then
          echo "  Model: $TEXT" >&2
        fi
      fi
    done

    if [ "$HAS_FUNCTION_CALLS" = "false" ]; then
      FINAL_TEXT=$(echo "$OUTPUT" | jq -r '[.[] | select(.type == "message") | .content[]? | select(.type == "output_text") | .text] | join("\n")' 2>/dev/null || echo "Agent completed")
      echo "$FINAL_TEXT"
      COMPLETED=true
      break
    fi

    # Set input for next turn
    INPUT="$TOOL_OUTPUTS"
  done

  if [ "$COMPLETED" = "true" ]; then
    break
  fi

  # Session limit reached — generate checkpoint and start new session
  echo "Session $SESSION: turn limit ($SESSION_TURNS) reached after $GLOBAL_TURN total turns" >&2

  if [ $SESSION -ge "$MAX_SESSIONS" ]; then
    echo "Max sessions ($MAX_SESSIONS) reached — stopping" >&2
    break
  fi

  # Generate checkpoint (sends pending tool outputs + summary request)
  SUMMARY=$(generate_checkpoint "$PREV_RESPONSE_ID" "$INPUT")
  echo "Checkpoint: $(echo "$SUMMARY" | head -3)..." >&2

  # Build new context for next session (original task + checkpoint)
  CONTEXT="CHECKPOINT FROM PREVIOUS SESSION (turns used: $GLOBAL_TURN):
${SUMMARY}

ORIGINAL TASK:
${ORIGINAL_CONTEXT}

Continue from the checkpoint. Do not re-read files already read. Do not redo work already done."

done

echo "--- Agent finished after $GLOBAL_TURN turns ($SESSION sessions) ---" >&2
echo "Total usage: input=${TOTAL_INPUT} (cached=${TOTAL_CACHED}) output=${TOTAL_OUTPUT} (reasoning=${TOTAL_REASONING})" >&2
echo "Model: $MODEL | Reasoning: $REASONING_EFFORT | Max output: $MAX_OUTPUT" >&2
