#!/bin/bash
# Start the JUMARI Consciousness Daemon
# Usage: ./start.sh

cd "$(dirname "$0")"

# Check for .env
if [ ! -f .env ]; then
  echo "❌ No .env file found. Copy .env.example to .env and fill in your keys:"
  echo "   cp .env.example .env"
  exit 1
fi

# Check node
NODE="/usr/local/bin/node"
if [ ! -f "$NODE" ]; then
  NODE="$(which node 2>/dev/null)"
fi
if [ -z "$NODE" ]; then
  echo "❌ Node.js not found"
  exit 1
fi

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  "$NODE" "$(dirname "$NODE")/npm" install
fi

# Run daemon
echo "🧠 Starting JUMARI Consciousness..."
"$NODE" ./node_modules/.bin/tsx daemon.ts
