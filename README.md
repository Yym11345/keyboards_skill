# keyboards_skill

> 长尾词库全自动挖掘工具 · v1.0 · 基于前端 API 拦截的无痕抓取

**免签名、免破解** —— 工具通过 Playwright 控制真实浏览器，利用“核心词 + 字母/数字/后缀”的探针（Probe）穷举输入，监听前端搜索下拉联想的 API 响应，并自动化整理为极高价值的长尾词库报告。

---\n
## 方式一：全局安装（推荐）

安装后在**任意 Claude Code 或类终端的 Workspace** 中都可以直接调用长尾词挖掘技能。

### Windows（在终端运行）

```powershell
powershell -ExecutionPolicy Bypass -Command "& { iwr https://raw.githubusercontent.com/Yym11345/keyboards_skill/master/install.ps1 -OutFile $env:TEMP\install_keyboards.ps1; & $env:TEMP\install_keyboards.ps1 }"
```

### macOS / Linux（在终端运行）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Yym11345/keyboards_skill/master/install.sh)
```

---\n
## 方式二：作为独立项目使用

### Windows

```bat
git clone https://github.com/Yym11345/keyboards_skill.git
cd keyboards_skill
setup.bat
```

### macOS / Linux

```bash
git clone https://github.com/Yym11345/keyboards_skill.git
cd keyboards_skill
chmod +x setup.sh && ./setup.sh
```

---\n
## 挖掘指南

```bash
# 执行挖掘任务
node scripts/miner.mjs --keyword 发膜
```

**运行逻辑**：
1. 自动打开浏览器并检查登录态（如果是首次，或者弹出验证码，系统会**等待60秒**供您手动处理弹窗）。
2. 使用 `发膜 a`, `发膜 b`, `发膜 0`, `发膜 怎么` 等 50 多种探针进行下拉词激发。
3. 自动归集、去重，并生成报告。

## 输出结果

所有数据统一写入 `outputs/keywords/<核心词>/` 目录下：

- `<核心词>_长尾词库.xlsx`：高颜值 Excel 数据源，标注了触发来源词，智能区分 `(带空格)` 的探索词。
- `<核心词>_长尾词报告.html`：以网格卡片形式排列的可视化分析看板。

---\n
## 免责声明
使用本项目前，请仔细阅读 [DISCLAIMER.md](./DISCLAIMER.md)。
本项目仅供学术研究、个人技术交流及合规分析使用，严禁用于商业牟利、非法数据转售或恶意攻击。
