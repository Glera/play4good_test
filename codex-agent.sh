#!/bin/bash
# codex-agent.sh — OpenAI agent with tool-use loop (optimized)
# Usage: ./codex-agent.sh plan|implement <context-file>
# Requires: OPENAI_API_KEY env var, jq installed
#
# Env vars (all optional except OPENAI_API_KEY):
#   CODEX_MODEL          — model id (default: gpt-5.2-codex)
#   CODEX_REASONING      — reasoning effort: none|low|medium|high (default: low)
#   CODEX_MAX_OUTPUT     — max_output_tokens per turn (default: plan=1400, implement=4096)
#   MAX_CODEX_TURNS      — max turns per session (default: 12)
#   CODEX_MAX_SESSIONS   — max session restarts via checkpoint (default: 3)
#   REPO_CACHE_KEY       — prompt cache key (default: repo:$GITHUB_REPOSITORY:agent:v1)
#   CODEX_PROFILE        — small|large (default: small)
#                          small: max_tool_calls=3, fail-fast turn 5, read_file 15KB
#                          large: max_tool_calls=6, no fail-fast, read_file 50KB
#
# Token optimization:
#   - reasoning.effort: low by default, auto-escalates to medium on build failure
#   - max_output_tokens: 1400 (plan) / 4096 (implement), auto-reduced if reasoning ratio too high
#   - max_tool_calls: 6 (plan) / profile-dependent (implement)
#   - parallel_tool_calls: false (plan) / true (implement)
#   - truncation: auto (safety net for long conversations)
#   - prompt caching: 24h retention for stable system+tools prefix
#   - Session splitting: 12 turns max, then checkpoint-summary + new session
#   - Tool output limits: read_file 15KB/50KB (profile), run_command 5KB

set -euo pipefail

MODE="${1:-implement}"
CONTEXT_FILE="${2:-/dev/null}"
SESSION_TURNS="${MAX_CODEX_TURNS:-12}"
MAX_SESSIONS="${CODEX_MAX_SESSIONS:-3}"
MODEL="${CODEX_MODEL:-gpt-5.2-codex}"
REASONING_EFFORT="${CODEX_REASONING:-low}"
CACHE_KEY="${REPO_CACHE_KEY:-repo:${GITHUB_REPOSITORY:-local}:agent:v1}"
PROFILE="${CODEX_PROFILE:-small}"

# Mode-dependent max_output: plan needs small output (text plan),
# implement needs large output (apply_patch with full code + reasoning overhead)
if [ -n "${CODEX_MAX_OUTPUT:-}" ]; then
  MAX_OUTPUT="$CODEX_MAX_OUTPUT"
elif [ "$MODE" = "plan" ]; then
  MAX_OUTPUT=1400
else
  MAX_OUTPUT=4096
fi

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

# Fail-fast: track whether agent has written code (implement mode only)
HAS_WRITTEN="false"

# --- Profile-dependent settings (implement mode only) ---
# Note: first ~2 turns are overhead (read CLAUDE.md + notify.sh),
# so effective reading budget = FAIL_FAST_TURN - 2
if [ "$PROFILE" = "large" ]; then
  IMPL_MAX_TOOL_CALLS=6
  FAIL_FAST_TURN=0   # disabled — session limit is the safety net
  READ_FILE_LIMIT=50000   # 50KB — large files like app.js (43KB) fit in one read
else
  IMPL_MAX_TOOL_CALLS=3
  FAIL_FAST_TURN=5
  READ_FILE_LIMIT=15000   # 15KB — standard
fi

echo "Config: model=$MODEL reasoning=$REASONING_EFFORT max_output=$MAX_OUTPUT turns/session=$SESSION_TURNS sessions=$MAX_SESSIONS cache=$CACHE_KEY profile=$PROFILE fail_fast=$FAIL_FAST_TURN" >&2

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

CRITICAL: The plan and reviewer feedback are in your context. DO NOT re-explore the codebase from scratch.
The plan already tells you which files to change and what to change. Trust it.

WORKFLOW:
1. Read CLAUDE.md ONCE for project conventions (skip if already read in previous session)
2. If notify.sh exists, run: ./notify.sh progress \"Brief description of your plan\"
3. Read the file(s) you need to change using read_file (prefer reading the whole file)
4. IMPLEMENT the changes:
   - For small/medium changes: use run_command with apply_patch
   - For large changes or if apply_patch fails: use write_file with the COMPLETE new file content
   - Do NOT use python/sed regex scripts — they are fragile and waste turns when they fail
5. Commit and push: git add -A && git commit -m \"feat: description\" && git push origin \$(git rev-parse --abbrev-ref HEAD)
6. Write lessons to /tmp/agent-lessons.md: decisions made, failed approaches, errors fixed, warnings for next run (5-15 lines)
7. Call done() with a summary

RULES:
- DO NOT re-explore the whole codebase — the plan tells you which files to change
$(if [ "$FAIL_FAST_TURN" -gt 0 ]; then echo "- Your FIRST write_file or apply_patch MUST happen by turn $FAIL_FAST_TURN at the latest — you will be terminated if you only read"; else echo "- Start writing code as soon as you understand the target — do not spend excessive turns reading"; fi)
- Do NOT create dummy/temporary files — every file you write must be a real code change
- If apply_patch fails, fall back to write_file with the complete file — do not retry the same patch
- Make clean, focused changes matching the plan
- Follow project conventions from CLAUDE.md
- After pushing, call done() and STOP
- Do not loop or retry after a successful push"
fi

# --- Tools definition (mode-dependent) ---
# Plan mode: all 5 tools, max_tool_calls 6 (exploration needed)
# Implement mode: 4 tools (no list_files), max_tool_calls profile-dependent
TOOLS_COMMON='[
  {"type":"function","name":"read_file","description":"Read contents of a file. Returns up to '"$READ_FILE_LIMIT"' bytes. For very large files, use run_command with head/tail/sed to read specific sections.","parameters":{"type":"object","properties":{"path":{"type":"string","description":"File path relative to repo root"}},"required":["path"]}},
  {"type":"function","name":"write_file","description":"Write or overwrite a file with the given content. Creates parent directories if needed.","parameters":{"type":"object","properties":{"path":{"type":"string","description":"File path relative to repo root"},"content":{"type":"string","description":"Full file content"}},"required":["path","content"]}},
  {"type":"function","name":"run_command","description":"Run a shell command. Output truncated to 5KB. Timeout: 60s. For verbose output, pipe through tail -50 or grep.","parameters":{"type":"object","properties":{"command":{"type":"string","description":"Shell command to execute"}},"required":["command"]}},
  {"type":"function","name":"done","description":"Signal that the task is complete. Call this when finished.","parameters":{"type":"object","properties":{"summary":{"type":"string","description":"Brief summary of what was done"}},"required":["summary"]}}
]'

TOOL_LIST_FILES='{"type":"function","name":"list_files","description":"List files in a directory (max depth 3, max 100 results).","parameters":{"type":"object","properties":{"directory":{"type":"string","description":"Directory path"},"pattern":{"type":"string","description":"Glob pattern (default: *)"}},"required":["directory"]}}'

if [ "$MODE" = "plan" ]; then
  # Plan: all tools + list_files, 6 calls/turn
  TOOLS=$(echo "$TOOLS_COMMON" | jq --argjson lf "$TOOL_LIST_FILES" '. + [$lf]')
  MAX_TOOL_CALLS=6
  PARALLEL_TOOL_CALLS=false
else
  # Implement: no list_files (plan already identified files), profile-dependent calls/turn,
  # parallel enabled so CLAUDE.md + target file can be read in one turn.
  TOOLS="$TOOLS_COMMON"
  MAX_TOOL_CALLS=$IMPL_MAX_TOOL_CALLS
  PARALLEL_TOOL_CALLS=true
fi

# --- Execute a tool call ---
execute_tool() {
  local func_name="$1"
  local args_json="$2"

  case "$func_name" in
    read_file)
      local file_path
      file_path=$(echo "$args_json" | jq -r '.path')
      if [ -f "$file_path" ]; then
        head -c "$READ_FILE_LIMIT" "$file_path"
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
      HAS_WRITTEN="true"
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
      # Track writing commands (sed -i, patch, tee, git commit)
      if echo "$cmd" | grep -qE 'sed -i|patch |tee |git (add|commit|push)'; then
        HAS_WRITTEN="true"
      fi
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
    --argjson max_tc "$MAX_TOOL_CALLS"
    --argjson parallel "$PARALLEL_TOOL_CALLS"
    --arg cache_key "$CACHE_KEY"
  )

  if [ -z "$prev_id" ]; then
    jq -n "${base_args[@]}" \
      '{model: $model, input: $input, tools: $tools, store: true,
        max_output_tokens: $max_out,
        max_tool_calls: $max_tc,
        parallel_tool_calls: $parallel,
        truncation: "auto",
        reasoning: {effort: $effort},
        prompt_cache_key: $cache_key,
        prompt_cache_retention: "24h"}'
  else
    jq -n "${base_args[@]}" --arg prev_id "$prev_id" \
      '{model: $model, input: $input, tools: $tools, store: true,
        previous_response_id: $prev_id,
        max_output_tokens: $max_out,
        max_tool_calls: $max_tc,
        parallel_tool_calls: $parallel,
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
  # Floor: plan=400, implement=2000 (implement needs room for apply_patch)
  if [ "$t_out" -gt 0 ]; then
    local ratio_pct=$(( (t_reason * 100) / t_out ))
    if [ "$ratio_pct" -gt 60 ]; then
      HIGH_RATIO_COUNT=$((HIGH_RATIO_COUNT + 1))
      if [ "$HIGH_RATIO_COUNT" -ge 2 ]; then
        local new_max=$(( (MAX_OUTPUT * 80) / 100 ))
        local floor=400
        [ "$MODE" = "implement" ] && floor=2000
        [ "$new_max" -lt "$floor" ] && new_max=$floor
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
      reasoning: {effort: "low"}}')

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
    DONE_CALLED=false
    DONE_SUMMARY=""

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

        # Track writes in main shell (execute_tool runs in subshell via $(...),
        # so HAS_WRITTEN set inside it is lost). Check based on tool name + args.
        if [ "$HAS_WRITTEN" = "false" ]; then
          if [ "$FUNC_NAME" = "write_file" ]; then
            HAS_WRITTEN="true"
          elif [ "$FUNC_NAME" = "run_command" ]; then
            CMD_CHECK=$(echo "$ARGS" | jq -r '.command' 2>/dev/null || echo "")
            if echo "$CMD_CHECK" | grep -qE 'sed -i|patch|apply_patch|tee |git (add|commit|push)'; then
              HAS_WRITTEN="true"
            fi
          fi
        fi

        # If done() appears together with other tool calls (parallel mode),
        # process all tools first, then exit once the loop finishes.
        if [ "$FUNC_NAME" = "done" ]; then
          DONE_CALLED=true
          DONE_SUMMARY="$RESULT"
          continue
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

    if [ "$DONE_CALLED" = "true" ]; then
      echo "$DONE_SUMMARY"
      echo "--- Agent completed (turn $GLOBAL_TURN) ---" >&2
      echo "Total usage: input=${TOTAL_INPUT} (cached=${TOTAL_CACHED}) output=${TOTAL_OUTPUT} (reasoning=${TOTAL_REASONING})" >&2
      exit 0
    fi

    if [ "$HAS_FUNCTION_CALLS" = "false" ]; then
      FINAL_TEXT=$(echo "$OUTPUT" | jq -r '[.[] | select(.type == "message") | .content[]? | select(.type == "output_text") | .text] | join("\n")' 2>/dev/null || echo "")

      # Detect "all-reasoning, no content" truncation: model used all output tokens
      # on reasoning, leaving 0 for tool calls/text. Don't treat as completion — retry.
      if [ -z "$FINAL_TEXT" ] || [ "$FINAL_TEXT" = "null" ]; then
        local t_out_last t_reason_last
        t_out_last=$(echo "$BODY" | jq '.usage.output_tokens // 0')
        t_reason_last=$(echo "$BODY" | jq '.usage.output_tokens_details.reasoning_tokens // 0')
        if [ "$t_reason_last" -gt 0 ] && [ "$t_reason_last" -ge "$t_out_last" ]; then
          echo "  [warning] All output tokens consumed by reasoning ($t_reason_last/$t_out_last) — output truncated. Continuing..." >&2
          # Send an empty tool output to keep the conversation going
          INPUT='[{"role": "user", "content": "Your previous response was truncated (reasoning used all output tokens). Please continue with the implementation. Output your code change now."}]'
          continue
        fi
      fi

      echo "$FINAL_TEXT"
      COMPLETED=true
      break
    fi

    # Fail-fast: in implement mode, if turn N completed with no writes → abort
    # Threshold depends on profile: small=5, large=0 (disabled)
    if [ "$MODE" = "implement" ] && [ "$FAIL_FAST_TURN" -gt 0 ] && [ "$TURN" -ge "$FAIL_FAST_TURN" ] && [ "$HAS_WRITTEN" = "false" ]; then
      echo "  [fail-fast] Turn $TURN/$FAIL_FAST_TURN with no write_file/patch — aborting (profile=$PROFILE)" >&2
      echo "Agent aborted: spent $TURN turns reading without writing code (profile=$PROFILE)" >&2
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
