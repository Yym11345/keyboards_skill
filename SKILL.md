---
name: douyin-longtail-keywords
display_name: 抖音长尾词挖掘
display_name_en: Douyin Long-Tail Keyword Miner
description: 抖音搜索下拉联想长尾词挖掘工具 — 专门采集抖音站内搜索框的联想推荐词。用「核心词 + a~z / 0~9 / 中文后缀」共 50 余种探针穷举输入，拦截抖音搜索联想接口返回的下拉词并去重入库，导出带来源标注的 Excel 长尾词库与可视化 HTML 报告。当用户说「帮我挖发膜在抖音的长尾词」「抖音下拉搜索联想词」「抖音关键词拓展」「用 keyboards_skill 搜发膜」「抖音长尾词」「抖音搜索词」「抖音 SEO 关键词」「抖音选品关键词」时使用。必须实际运行脚本挖掘，不得凭训练记忆编造长尾词数据。
description_zh: 穷举字母、数字与中文后缀探针，采集抖音搜索下拉联想词，自动去重并导出长尾词库与可视化报告。
description_en: Enumerates letter, digit and Chinese-suffix probes to harvest Douyin search-suggestion keywords, deduplicates them, and exports an Excel keyword library plus a visual HTML report.
version: 2.0.0
author: 闫石名
examples_zh:
  - "帮我挖「发膜」在抖音的长尾词"
  - "抖音下拉联想词有哪些？导出成 Excel 词库"
  - "把这个核心词的抖音长尾词做成可视化报告"
examples_en:
  - "Mine Douyin long-tail keywords for the core term 'hair mask'"
  - "Collect Douyin search-suggestion keywords and export the library"
  - "Turn these Douyin long-tail keywords into a visual HTML report"
allowed-tools: Read, Grep, Glob, Bash
license: MIT
agent_created: true
---

# 抖音长尾词挖掘

用一个真实浏览器，把「核心词 + 字母 / 数字 / 中文后缀」逐个敲进**抖音站内搜索框**，
把下拉的联想词**逐条抓下来**，去重后导出成带来源标注的 Excel 词库和可视化报告。

**只做抖音** —— 目标站点固定为 `douyin.com`，不抓其他平台。

**不囤词库** —— 每次只挖用户指定的核心词，结果落盘即可用。

## 什么时候用

用户提到以下任一类需求时使用：

- 「帮我挖发膜在抖音的长尾词」「抖音下拉搜索联想词」
- 「抖音关键词拓展」「抖音长尾词」「抖音搜索词」
- 「抖音 SEO 关键词」「抖音选品关键词」「抖音带货关键词」
- 「用 keyboards_skill 搜发膜」（沿用旧称呼）

不在以下情况使用：其他平台（淘宝、百度、小红书、拼多多）的联想词采集、
批量抓取竞品商品详情页、绕过登录做大规模数据采集、
任何形式的账号批量操作或自动化营销。

## 前置准备（首次使用必须做一次）

本技能需要 **Node.js 18+**（推荐 20 / 22 LTS）和 **Playwright**。
数据库与 Excel 导出**已内置回落逻辑，通常无需额外安装**。

### 1. 探测依赖

```bash
node -e "
for (const m of ['playwright','better-sqlite3','exceljs']) {
  try { require.resolve(m); console.log(m.padEnd(18)+'✅'); }
  catch(e) { console.log(m.padEnd(18)+'❌ 缺失'); }
}
try { require('node:sqlite'); console.log('node:sqlite'.padEnd(18)+'✅ 内置'); } catch(e) {}
"
```

### 2. 若 playwright 缺失，安装它（唯一必须装的依赖）

```bash
mkdir -p .longtail && cd .longtail && npm init -y >/dev/null 2>&1
npm install playwright
npx playwright install chromium
```

> 安装目录会随 `node_modules` 逐级向上查找，所以**把 `.longtail` 建在当前工作目录下**即可，
> 无需往技能安装目录里塞依赖（技能目录在平台上可能是只读的）。

### 3. 数据库与 Excel：两条路径，自动选

| 能力 | 优先使用 | 自动回落 | 说明 |
|---|---|---|---|
| SQLite | `better-sqlite3` | **`node:sqlite`（Node 22+ 内置）** | 原生模块装不上就用内置，无需编译 |
| Excel | `exceljs` | **内置 xlsx 写入器** | 零依赖，直接产出 .xlsx |

两条路径都**不需要你做任何选择**，脚本会自动探测并打印实际使用的驱动：

```
[Miner] 🗄️  数据库驱动: node:sqlite
[Miner] 📊 Excel 导出成功 (内置写入器)
```

### 4. 确认浏览器

脚本优先使用系统已安装的 Google Chrome（复用真实登录态）；
**没有 Chrome 会自动回落到 Playwright 自带的 Chromium，不会报错中断**。

```bash
ls "/c/Program Files/Google/Chrome/Application/chrome.exe" 2>/dev/null || echo "将使用 Playwright 内置 Chromium"
```

## 执行

**脚本路径**：本技能目录下的 `scripts/miner.mjs`（与本 SKILL.md 同级）。
若技能目录只读，把整个 `scripts/` 与 `package.json` 复制到工作目录再执行。

```bash
# 基本用法
node <技能目录>/scripts/miner.mjs --keyword 发膜

# 指定输出目录与探测间隔（毫秒）
node <技能目录>/scripts/miner.mjs --keyword 空气炸锅 --out ./长尾词成果 --delay 1500
```

### 参数

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `--keyword` | ✅ | — | 核心大词，如 `发膜` |
| `--out` | 否 | `./outputs/keywords` | 结果输出根目录 |
| `--delay` | 否 | `2000` | 每次探测之间的间隔（毫秒），调小更快但更容易触发平台限流 |

### 执行过程

1. 打开浏览器（复用持久化 Profile，首次会新建）。
2. 跳转到**抖音首页** `https://www.douyin.com/`，等待页面就绪。
3. 检查搜索框可用性；**若弹出登录或验证，脚本会等待 60 秒，请在此期间手动完成**。
4. 依次输入 `核心词`、`核心词 a` … `核心词 z`、`核心词 0` … `核心词 9`，
   以及 `核心词 怎么 / 推荐 / 哪个好 / 测评 / 排行榜 / 多少钱 / 区别`（含带空格变体）。
5. 每敲一次就监听**抖音搜索联想接口**的返回，把联想词连同「触发它的那个探针」一起写入 SQLite。
6. 全程约 50 余次探测，默认间隔 2 秒，**整体约 2 分钟**。

## 输出

结果落在 `--out` 指定的目录下：

```
<out>/<核心词>/
├── <核心词>_长尾词库.xlsx     # 列：最高推荐排名 / 核心大词 / 长尾精准词 / 触发搜索词 / 挖掘时间
└── <核心词>_长尾词报告.html     # 按触发词分组的网格看板
```

- 带空格变体触发的词，在 Excel 与 HTML 中均标注 `(带空格)`。
- 同一核心词重复挖掘前会清空该词的历史记录，保证是**当次全新覆盖**。
- SQLite 库文件位于 `<out>/keywords.db`，可跨次查询与对比。

## 常见问题

| 现象 | 处理 |
|---|---|
| 提示缺少 playwright | 回到「前置准备」第 2 步安装 |
| 找不到搜索框 | 抖音页面可能要求验证或登录；脚本会存一张 `miner_error.png` 供排查 |
| 探测到一半页面崩溃 | 脚本会自动重开页面并继续剩余探针，日志出现「[恢复] 已重开页面」 |
| 探测没抓到词 | 抖音该次未触发联想接口，脚本已内置「补敲空格」重试；仍为空则改用更长尾的探针 |
| 账号被要求验证 | 等待 60 秒手动完成；频繁触发请调大 `--delay` |
| better-sqlite3 装不上 | 无需处理 —— 会自动使用内置 `node:sqlite`（需 Node 22+） |

## 合规边界

- 目标平台固定为**抖音**，仅采集其搜索框**公开返回**的联想词，
  不触碰用户主页、私信、评论、直播等非公开数据。
- 采集到的是**抖音的公开联想数据**，使用方须自行遵守抖音的用户协议与相关法规。
- 不得用于批量账号操作、恶意高频请求、绕过平台风控或数据转售。
- 请控制请求频率（默认 2 秒间隔），不要把探测间隔调到 200ms 以下。

更多背景与免责说明见 `@references/README.md` 与 `@references/DISCLAIMER.md`。
