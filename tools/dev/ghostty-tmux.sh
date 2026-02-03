#!/usr/bin/env bash
set -euo pipefail

SESSION="swarmharness"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required. Install it with: brew install tmux" >&2
  exit 1
fi

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -c "$ROOT_DIR"
  tmux send-keys -t "$SESSION:0.0" "pnpm --filter fixture-web dev" C-m

  tmux split-window -v -t "$SESSION:0" -c "$ROOT_DIR"
  tmux send-keys -t "$SESSION:0.1" "pnpm --filter worker-playwright dev" C-m

  tmux split-window -h -t "$SESSION:0.1" -c "$ROOT_DIR"
  tmux send-keys -t "$SESSION:0.2" "RUST_LOG=info cargo run -p telemetryd" C-m

  tmux select-layout -t "$SESSION:0" tiled
fi

if [[ -n "${TMUX:-}" ]]; then
  tmux switch-client -t "$SESSION"
  exit 0
fi

if [[ -d "/Applications/Ghostty.app" ]]; then
  if open -na Ghostty.app --args -e "tmux attach -t $SESSION"; then
    exit 0
  fi
  echo "Ghostty failed to launch; attaching in current terminal instead."
fi

tmux attach -t "$SESSION"
