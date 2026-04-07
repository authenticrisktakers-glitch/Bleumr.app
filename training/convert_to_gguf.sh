#!/bin/bash
# ════════════════════════════════════════════════════════════
# JUMARI — Convert merged model to GGUF for Ollama
# Run this AFTER train.py finishes and produces jumari-7b-merged/
# ════════════════════════════════════════════════════════════

set -e

MERGED_DIR="${1:-./jumari-7b-merged}"
GGUF_OUTPUT="${2:-./jumari-7b-Q4_K_M.gguf}"
QUANT_TYPE="${3:-Q4_K_M}"

echo ""
echo "════════════════════════════════════════════════════"
echo "  JUMARI → GGUF Conversion"
echo "════════════════════════════════════════════════════"
echo "  Input:  $MERGED_DIR"
echo "  Output: $GGUF_OUTPUT"
echo "  Quant:  $QUANT_TYPE"
echo "════════════════════════════════════════════════════"
echo ""

# ── Step 1: Clone llama.cpp if not present ──
if [ ! -d "llama.cpp" ]; then
  echo "📥 Cloning llama.cpp..."
  git clone https://github.com/ggerganov/llama.cpp.git
  cd llama.cpp
  pip install -r requirements.txt
  cd ..
else
  echo "✅ llama.cpp already present"
fi

# ── Step 2: Convert to GGUF (f16) ──
echo ""
echo "🔄 Converting to GGUF (f16)..."
python llama.cpp/convert_hf_to_gguf.py "$MERGED_DIR" \
  --outfile "./jumari-7b-f16.gguf" \
  --outtype f16

# ── Step 3: Quantize to Q4_K_M (~4GB) ──
echo ""
echo "📦 Quantizing to $QUANT_TYPE..."

# Build quantize tool if needed
if [ ! -f "llama.cpp/build/bin/llama-quantize" ]; then
  echo "  Building llama.cpp quantize tool..."
  cd llama.cpp
  cmake -B build
  cmake --build build --target llama-quantize -j$(nproc)
  cd ..
fi

./llama.cpp/build/bin/llama-quantize "./jumari-7b-f16.gguf" "$GGUF_OUTPUT" "$QUANT_TYPE"

# Clean up f16 (it's huge)
rm -f "./jumari-7b-f16.gguf"

echo ""
echo "✅ Done! GGUF file: $GGUF_OUTPUT"
echo ""
echo "  File size:"
ls -lh "$GGUF_OUTPUT"
echo ""
echo "  Next steps:"
echo "  1. Download $GGUF_OUTPUT to your Mac"
echo "  2. Create a Modelfile (see README.md)"
echo "  3. ollama create jumari -f Modelfile"
echo "  4. ollama run jumari"
echo ""
