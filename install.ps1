# keyboards_skill Global Install Script (Windows PowerShell)
# After running, /keyboards_skill is available in the current Claude Code Workspace
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# Optional parameters:
#   -WorkspaceDir   Claude Code Workspace directory (default: current directory)
#   -InstallDir     keyboards_skill install directory (default: $HOME\keyboards_skill)

param(
    [string]$WorkspaceDir = (Get-Location).Path,
    [string]$InstallDir   = "$HOME\keyboards_skill",
    [switch]$InstallAntigravity = $true
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/Yym11345/keyboards_skill.git"

Write-Host ""
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host "       keyboards_skill  Install               " -ForegroundColor Cyan
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Install Dir : $InstallDir"
Write-Host "  Workspace   : $WorkspaceDir"
Write-Host ""

# Step 1: Clone or update repo
if (Test-Path "$InstallDir\.git") {
    Write-Host "[1/4] Updating keyboards_skill..." -ForegroundColor Yellow
    git -C $InstallDir pull --ff-only
} else {
    Write-Host "[1/4] Cloning keyboards_skill to $InstallDir ..." -ForegroundColor Yellow
    git clone $RepoUrl $InstallDir
}
Write-Host "[OK] Code synced" -ForegroundColor Green

# Step 2: npm install
Write-Host ""
Write-Host "[2/4] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $InstallDir
npm install
Write-Host "[OK] npm dependencies installed" -ForegroundColor Green

# Step 3: Playwright Chromium
Write-Host ""
Write-Host "[3/4] Installing Playwright Chromium..." -ForegroundColor Yellow
npx playwright install chromium
Write-Host "[OK] Chromium installed" -ForegroundColor Green

# Step 3.5: Google Chrome check/install
Write-Host ""
Write-Host "[3.5] Checking Google Chrome..." -ForegroundColor Yellow
$ChromeFound = $false
$ChromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
foreach ($p in $ChromePaths) {
    if (Test-Path $p) { $ChromeFound = $true; break }
}

if ($ChromeFound) {
    Write-Host "[OK] Google Chrome already installed" -ForegroundColor Green
} else {
    $installed = $false
    try {
        Write-Host "  Google Chrome not found, trying winget..." -ForegroundColor Yellow
        winget install Google.Chrome --silent --accept-package-agreements --accept-source-agreements
        $installed = $true
        Write-Host "[OK] Google Chrome installed via winget" -ForegroundColor Green
    } catch {}

    if (-not $installed) {
        Write-Host ""
        Write-Host "  [REQUIRED] Please install Google Chrome manually:" -ForegroundColor Red
        Write-Host "  https://www.google.com/chrome/" -ForegroundColor Red
        Write-Host ""
    }
}

Pop-Location

# Step 4: Register AI Agent Integrations (Claude Code, Antigravity, Codex)
Write-Host ""
Write-Host "[4/4] Registering AI Agent Integrations..." -ForegroundColor Yellow

# 4.1 Claude Code Registration
$CommandsDir = Join-Path $WorkspaceDir ".claude\commands"
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null

$InstallDirFwd = $InstallDir.Replace("\", "/")

$CommandContent = @"
---
description: 长尾词库全自动挖掘工具 — 针对指定核心词，自动使用 a-z/0-9 及中文后缀作为探针，截获抖音最新搜索下拉联想词。
argument-hint: <核心关键词>
---

# /keyboards_skill

全自动挖掘长尾词库，结果将自动生成 Excel 表格和高颜值 HTML 报告，保存在 outputs/keywords/ 目录下。

## 参数

- 第一个参数：核心关键词（必填，如：发膜）

## 执行

Skill 安装路径: $InstallDir

``````bash
node "$InstallDirFwd/scripts/miner.mjs" --keyword `$ARGUMENTS
``````

## 常见错误

- 浏览器弹出但卡住 → 如果弹出扫码或验证码，请在 60 秒内手动扫码或关闭弹窗，程序会自动继续。
"@

$CommandFile = Join-Path $CommandsDir "keyboards_skill.md"
[System.IO.File]::WriteAllText($CommandFile, $CommandContent, [System.Text.Encoding]::UTF8)

Write-Host "  [OK] Claude Code command registered: $CommandFile" -ForegroundColor Green

# 4.2 Antigravity Registration
if ($InstallAntigravity) {
    $AntigravityPluginsDir = "$HOME\.gemini\config\plugins"
    if (Test-Path "$HOME\.gemini") {
        New-Item -ItemType Directory -Force -Path $AntigravityPluginsDir | Out-Null
        $AntigravitySkillDir = Join-Path $AntigravityPluginsDir "keyboards_skill"
        New-Item -ItemType Directory -Force -Path $AntigravitySkillDir | Out-Null
        
        # Copy the full SKILL.md so Antigravity can read complete skill instructions
        $AntigravitySkillFile = Join-Path $AntigravitySkillDir "SKILL.md"
        Copy-Item "$InstallDir\SKILL.md" $AntigravitySkillFile -Force
        Write-Host "  [OK] Antigravity skill registered at: $AntigravitySkillDir" -ForegroundColor Green
    }
}

# 4.3 Codex Notification
Write-Host "  [OK] For Codex, point it to the SKILL.md inside $InstallDir" -ForegroundColor Green

# Done
Write-Host ""
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host " Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host " For Claude Code, type:" -ForegroundColor White
Write-Host "   /keyboards_skill 发膜" -ForegroundColor Yellow
Write-Host ""
Write-Host " For Antigravity, the skill 'keyboards_skill' is now available globally." -ForegroundColor White
Write-Host ""
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host ""
