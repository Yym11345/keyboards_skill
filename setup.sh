#!/bin/bash

echo "========================================="
echo "     keyboards_skill  v1.0  Setup        "
echo "========================================="
echo ""

echo "[1/2] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "[Error] npm install failed!"
    exit 1
fi
echo ""

echo "[2/2] Installing Playwright Chromium browser..."
npx playwright install chromium
if [ $? -ne 0 ]; then
    echo "[Error] Playwright browser installation failed!"
    exit 1
fi
echo ""

echo "[Success] Setup complete! You can now run miner.mjs"
