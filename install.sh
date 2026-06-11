#!/bin/bash
# keyboards_skill Global Install Script (macOS / Linux)
# After running, /keyboards_skill is available in the current Claude Code Workspace
#
# Usage:
#   bash install.sh
#

WORKSPACE_DIR=${1:-$(pwd)}
INSTALL_DIR=${2:-"$HOME/keyboards_skill"}

echo ""
echo " ============================================="
echo "       keyboards_skill  Install               "
echo " ============================================="
echo ""
echo "  Install Dir : $INSTALL_DIR"
echo "  Workspace   : $WORKSPACE_DIR"
echo ""

# Step 1: Clone or update repo
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "[1/4] Updating keyboards_skill..."
    git -C "$INSTALL_DIR" pull --ff-only
else
    echo "[1/4] Cloning keyboards_skill to $INSTALL_DIR ..."
    git clone https://github.com/Yym11345/keyboards_skill.git "$INSTALL_DIR"
fi
echo "[OK] Code synced"

# Step 2: npm install
echo ""
echo "[2/4] Installing npm dependencies..."
cd "$INSTALL_DIR" || exit 1
npm install
echo "[OK] npm dependencies installed"

# Step 3: Playwright Chromium
echo ""
echo "[3/4] Installing Playwright Chromium..."
npx playwright install chromium
echo "[OK] Chromium installed"

# Step 4: Register AI Agent Integrations
echo ""
echo "[4/4] Registering AI Agent Integrations..."

# 4.1 Claude Code Registration
COMMANDS_DIR="$WORKSPACE_DIR/.claude/commands"
mkdir -p "$COMMANDS_DIR"

COMMAND_FILE="$COMMANDS_DIR/keyboards_skill.md"

cat << 'EOF' > "$COMMAND_FILE"
---
description: 长尾词库全自动挖掘工具 — 针对指定核心词，自动使用 a-z/0-9 及中文后缀作为探针，截获抖音最新搜索下拉联想词。
argument-hint: <核心关键词>
---

# /keyboards_skill

全自动挖掘长尾词库，结果将自动生成 Excel 表格和高颜值 HTML 报告，保存在 outputs/keywords/ 目录下。

## 参数

- 第一个参数：核心关键词（必填，如：发膜）

## 执行

Skill 安装路径: INSTALL_DIR_PLACEHOLDER

```bash
node "INSTALL_DIR_PLACEHOLDER/scripts/miner.mjs" --keyword $ARGUMENTS
```

## 常见错误

- 浏览器弹出但卡住 → 如果弹出扫码或验证码，请在 60 秒内手动扫码或关闭弹窗，程序会自动继续。
EOF

# Replace placeholder with actual path
sed -i.bak "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$COMMAND_FILE"
rm -f "$COMMAND_FILE.bak"

echo "  [OK] Claude Code command registered: $COMMAND_FILE"

# 4.2 Antigravity Registration
ANTIGRAVITY_PLUGINS_DIR="$HOME/.gemini/config/plugins"
if [ -d "$HOME/.gemini" ]; then
    mkdir -p "$ANTIGRAVITY_PLUGINS_DIR/keyboards_skill"
    cp "$INSTALL_DIR/SKILL.md" "$ANTIGRAVITY_PLUGINS_DIR/keyboards_skill/SKILL.md"
    echo "  [OK] Antigravity skill registered at: $ANTIGRAVITY_PLUGINS_DIR/keyboards_skill"
fi

# 4.3 Codex Notification
echo "  [OK] For Codex, point it to the SKILL.md inside $INSTALL_DIR"

# Done
echo ""
echo " ============================================="
echo " Installation complete!"
echo ""
echo " For Claude Code, type:"
echo "   /keyboards_skill 发膜"
echo ""
echo " For Antigravity, the skill 'keyboards_skill' is now available globally."
echo " ============================================="
echo ""
