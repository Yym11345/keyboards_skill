# 抖音长尾词挖掘（douyin-longtail-keywords）

> **抖音**搜索下拉联想长尾词挖掘工具 · v2.0

**免签名、免破解** —— 通过 Playwright 控制真实浏览器，把「核心词 + 字母 / 数字 / 中文后缀」
的探针（Probe）逐个敲进**抖音站内搜索框**，监听抖音搜索联想接口的返回，把下拉词连同
**触发它的那一个探针**一起抓下来，整理成可追溯的长尾词库。

**目标平台固定为抖音**（douyin.com），不针对其他平台。

---

## 快速开始

```bash
# 1. 安装依赖（唯一必须装的是 playwright）
npm install
npx playwright install chromium

# 2. 挖词
node scripts/miner.mjs --keyword 发膜
```

安装后即可在 WorkBuddy / Claude Code 等支持 Skill 的环境中使用本技能。

---

## 挖掘指南

```bash
# 基本用法
node scripts/miner.mjs --keyword 发膜

# 指定输出目录与探测间隔（毫秒）
node scripts/miner.mjs --keyword 空气炸锅 --out ./长尾词成果 --delay 1500
```

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `--keyword` | ✅ | — | 核心大词，如 `发膜` |
| `--out` | 否 | `./outputs/keywords` | 结果输出根目录 |
| `--delay` | 否 | `2000` | 每次探测之间的间隔（毫秒），调小更快但更容易触发平台限流 |

### 运行逻辑

1. 自动打开浏览器并检查登录态（首次或弹出验证码时，系统会**等待 60 秒**供手动处理弹窗）。
2. 使用 `发膜 a`、`发膜 b`、`发膜 0`、`发膜 怎么` 等 **51 个探针**进行下拉词激发。
3. 自动归集、去重，并生成报告。

---

## 输出结果

所有数据统一写入 `outputs/keywords/<核心词>/` 目录下：

- `<核心词>_长尾词库.xlsx` —— 带来源标注的 Excel 数据源，智能区分 `(带空格)` 的探索词。
- `<核心词>_长尾词报告.html` —— 以网格卡片形式排列的可视化分析看板。

SQLite 库文件位于 `outputs/keywords/keywords.db`，可跨次查询与对比。

---

## 探针设计

| 探针类型 | 数量 | 示例 | 作用 |
|---|---|---|---|
| 裸核心词 | 1 | `发膜` | 拿到最高频的通用联想 |
| 字母探针 | 26 | `发膜 a` … `发膜 z` | 逼出英文/拼音开头的分支 |
| 数字探针 | 10 | `发膜 0` … `发膜 9` | 逼出型号、规格、年代分支 |
| 中文后缀 | 14 | `发膜 怎么` / `发膜推荐` / `发膜哪个好` | 逼出**交易意图**与**决策意图**分支 |

带空格的变体（`发膜 怎么`）会被单独标注 —— 空格本身是一个强信号，
用户真的敲空格，通常意味着他要的是更具体的长问句。

同一核心词被多个探针同时命中，说明它兼具多种用户意图 —— 这是单探针工具拿不到的信息。

---

## 依赖说明

| 能力 | 优先使用 | 自动回落 | 说明 |
|---|---|---|---|
| 浏览器自动化 | `playwright` | — | **唯一必装项** |
| SQLite | `better-sqlite3` | `node:sqlite`（Node 22+ 内置） | 原生模块装不上就用内置，无需编译 |
| Excel | `exceljs` | 内置 xlsx 写入器 | 零依赖，直接产出 .xlsx |

脚本启动时会打印实际使用的驱动，**无需手工干预**。

环境要求：Node.js ≥ 18（推荐 20 / 22 LTS）。系统装有 Google Chrome 时会自动复用（保留登录态），
没有则自动回落到 Playwright 自带的 Chromium。

---

## 常见问题

| 现象 | 处理 |
|---|---|
| 缺少 playwright | `npm install playwright && npx playwright install chromium` |
| 找不到搜索框 | 抖音页面要求验证或登录；脚本会存 `miner_error.png` 供排查 |
| 探测到一半页面崩溃 | 脚本会自动重开页面并继续剩余探针 |
| 探测没抓到词 | 已内置「补敲空格」重试；仍为空说明抖音该次未触发联想接口 |
| 账号被要求验证 | 60 秒内手动完成；频繁触发请调大 `--delay` |
| better-sqlite3 装不上 | 无需处理 —— 自动回落内置 `node:sqlite`（需 Node 22+） |

---

## v2.0 变更

- **技能名与展示名改为抖音专属**：技能 ID `douyin-longtail-keywords`，明确只做抖音站内联想词。
- **修复 `name` 字段不合规**：原 `keyboards_skill` 用下划线，官方 Skill 校验器要求 hyphen-case，会直接判失败。
- **补齐 Skill frontmatter 八必填字段**与三组 `examples`，符合 WorkBuddy 开放平台上架规范。
- **移除一键安装脚本**（`install.ps1` / `install.sh` / `setup.bat` / `setup.sh`）：原脚本会向用户主目录写入文件并修改 IDE 配置，改由本文档的显式步骤替代。
- **移除未使用依赖** `playwright-extra` / `puppeteer-extra-plugin-stealth`。
- **替换有高危漏洞的 `xlsx` 包**（原型污染 + ReDoS，npm 上无修复版本）为 `exceljs`，并内置零依赖写入器兜底。
- **消除强制安装**：数据库与 Excel 改为双路径自动回落，现在只有 playwright 是必装项。
- **修复无 Chrome 时崩溃**：原先写死 `channel: 'chrome'`，现自动回落到内置 Chromium。
- **修复页面崩溃导致整轮中断**：新增页面恢复逻辑，个别探针失败不再中断整轮挖掘。
- **纠正不实描述**：原 README 称「自动绕过验证码」，实际代码是等待 60 秒人工处理，已改为如实描述。

---

## 免责声明
使用本项目前，请仔细阅读 [references/DISCLAIMER.md](./references/DISCLAIMER.md)。
本项目仅供学术研究、个人技术交流及合规运营分析使用，严禁用于商业牟利、非法数据转售或恶意攻击。
