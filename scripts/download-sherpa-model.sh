#!/usr/bin/env bash
#
# Downloads the Sherpa-ONNX streaming Zipformer model used by SpeakRight's
# local streaming STT. Extracts into ~/.local/share/speakright/sherpa/
# under a model-name subdirectory (e.g. streaming-zipformer-en).
#
# Usage: ./scripts/download-sherpa-model.sh
#
set -euo pipefail

TARGET_ROOT="${SPEAKRIGHT_SHERPA_DIR:-$HOME/.local/share/speakright/sherpa}"
MODEL_NAME="streaming-zipformer-en"
TARBALL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26.tar.bz2"

mkdir -p "$TARGET_ROOT"
TMP_TARBALL="$(mktemp --suffix=.tar.bz2)"

echo "Downloading $MODEL_NAME → $TARGET_ROOT"
if command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$TMP_TARBALL" "$TARBALL_URL"
else
  curl -L --fail --progress-bar -o "$TMP_TARBALL" "$TARBALL_URL"
fi

tar xjf "$TMP_TARBALL" -C "$TARGET_ROOT"
rm -f "$TMP_TARBALL"

# Normalize the extracted dir to the model name used by the app.
if [[ -d "$TARGET_ROOT/sherpa-onnx-streaming-zipformer-en-2023-06-26" ]]; then
  mv "$TARGET_ROOT/sherpa-onnx-streaming-zipformer-en-2023-06-26" "$TARGET_ROOT/$MODEL_NAME"
fi

echo "Done: $TARGET_ROOT/$MODEL_NAME"
echo ""
echo "Now select the Sherpa-ONNX streaming Zipformer STT provider in Settings."