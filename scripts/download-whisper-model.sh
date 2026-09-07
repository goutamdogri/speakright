#!/usr/bin/env bash
#
# Downloads the whisper.cpp model used by SpeakRight's local STT.
# Usage: ./scripts/download-whisper-model.sh [base|small|medium]
#
set -euo pipefail

MODEL="${1:-base}"
TARGET_DIR="${SPEAKRIGHT_WHISPER_DIR:-$HOME/.local/share/speakright/whisper}"
MODEL_URLS=(

  "base|https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
  "small|https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
  "medium|https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin"
)

MATCH=""
for entry in "${MODEL_URLS[@]}"; do
  key="${entry%%|*}"
  if [[ "$key" == "$MODEL" ]]; then
    MATCH="${entry#*|}"
    break
  fi
done

if [[ -z "$MATCH" ]]; then
  echo "Unknown model: $MODEL (choose base, small, or medium)" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
echo "Downloading $MODEL model → $TARGET_DIR"
curl -L --fail --progress-bar -o "$TARGET_DIR/ggml-$MODEL.en.bin" "$MATCH"
echo "Done: $TARGET_DIR/ggml-$MODEL.en.bin"

echo ""
echo "Next steps:"
echo "  1. Build or install whisper.cpp from: https://github.com/ggml-org/whisper.cpp"
echo "  2. Put whisper-cli on your PATH (or set SPEAKRIGHT_WHISPER_BIN)."