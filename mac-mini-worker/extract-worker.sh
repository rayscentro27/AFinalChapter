#!/bin/bash
# Script to extract mac-mini-worker on Mac Mini
# Usage: bash extract-worker.sh

set -e

echo "🚀 Mac Mini Worker Framework - Extraction Script"
echo "=================================================="
echo ""

# Check if tar file exists
if [ ! -f "mac-mini-worker.tar.gz" ]; then
    echo "❌ Error: mac-mini-worker.tar.gz not found in current directory"
    echo "   Make sure you downloaded/transferred the file here first"
    exit 1
fi

# Extract
echo "📦 Extracting framework..."
tar -xzf mac-mini-worker.tar.gz

echo "✅ Extracted to: mac-mini-worker/"
echo ""

# Navigate to directory
cd mac-mini-worker

# Check Node.js
echo "🔍 Checking Node.js version..."
NODE_VERSION=$(node --version 2>/dev/null || echo "NOT_FOUND")
if [ "$NODE_VERSION" = "NOT_FOUND" ]; then
    echo "❌ Node.js not found. Please install Node.js v20+ first"
    exit 1
fi
echo "   Node.js version: $NODE_VERSION"

# Check npm
echo "🔍 Checking npm version..."
NPM_VERSION=$(npm --version 2>/dev/null || echo "NOT_FOUND")
if [ "$NPM_VERSION" = "NOT_FOUND" ]; then
    echo "❌ npm not found. Please install Node.js with npm"
    exit 1
fi
echo "   npm version: $NPM_VERSION"

echo ""
echo "📥 Installing dependencies..."
npm install --legacy-peer-deps

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env file with your credentials (if needed)"
echo "  2. Run: npm run test:queue  (to verify it works)"
echo "  3. Run: npm start           (to start the worker)"
echo ""
