#!/usr/bin/env node
/**
 * scripts/miner.mjs
 * douyin-longtail-keywords - 抖音长尾词库挖掘工具 (Douyin Long-tail Keyword Miner)
 * 
 * 自动拦截抖音搜索联想接口，采集 A-Z / 0-9 / 中文后缀探针触发的长尾词。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openDb, upsertKeywordSuggestions, getKeywordSuggestionsByRoot } from './db.mjs';

const require = createRequire(import.meta.url);

// playwright 用 createRequire 动态加载：ESM 的 import 不认 NODE_PATH，
// 而技能安装目录与依赖目录往往分离，createRequire 能沿 node_modules 逐级向上查找。
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  throw new Error(
    '[Miner] 缺少 playwright。请先安装：\n' +
    '  npm install playwright\n' +
    '  npx playwright install chromium\n' +
    `原始错误：${e.message}`
  );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1] || true]);
    return acc;
  }, [])
);

const coreKeyword = args.keyword;
const delayMs     = Number(args.delay) || 2000;
// 输出根目录：默认落在当前工作目录（技能安装目录可能是只读的）
const outRoot     = typeof args.out === 'string' ? resolve(args.out)
                                                   : join(process.cwd(), 'outputs', 'keywords');
// 浏览器持久化 Profile：默认落在当前工作目录
const profilePath = typeof args.profile === 'string' ? resolve(args.profile)
                                                      : join(process.cwd(), '.longtail', 'profiles', 'douyin');

if (!coreKeyword || coreKeyword === true) {
  console.error('[Miner] ❌ 请指定核心关键词。示例：node scripts/miner.mjs --keyword 发膜');
  process.exit(1);
}


// ── Excel export helper (zero-dependency fallback) ──────────────────────────────
// 优先用 exceljs（更好的样式与列宽）；没有则用内置的极简 xlsx 写入器，
// 保证在任何 Node 环境下都能产出 .xlsx 文件，不强制安装第三方库。

const EXCEL_HEADERS = ['最高推荐排名', '核心大词', '长尾精准词', '触发搜索词', '挖掘时间'];

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // 去掉 XML 1.0 不允许的控制字符
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function colName(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26; }
  return s;
}

async function writeXlsxMinimal(filePath, headers, rows) {
  const { writeFileSync } = await import('node:fs');
  const { crc32 } = await import('node:zlib');

  const cellXml = (v, ref) => {
    if (v === null || v === undefined || v === '') return `<c r="${ref}"/>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
  };

  const rowsXml = [];
  rowsXml.push(`<row r="1">${headers.map((h, i) => cellXml(h, `${colName(i + 1)}1`)).join('')}</row>`);
  rows.forEach((r, ri) => {
    const rn = ri + 2;
    const vals = [r.rank, r.root, r.word, r.src, r.time];
    rowsXml.push(`<row r="${rn}">${vals.map((v, i) => cellXml(v, `${colName(i + 1)}${rn}`)).join('')}</row>`);
  });

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join('')}</sheetData></worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Keywords" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  const files = [
    { name: '[Content_Types].xml', data: ctXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRelsXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
  ];

  // 手写 zip（store 模式，不压缩）—— 避免引入 zip 库依赖
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const dataBuf = Buffer.from(f.data, 'utf8');
    const crc = crc32(dataBuf) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 标志
    local.writeUInt16LE(0, 8);             // method = store
    local.writeUInt16LE(0, 10);            // time
    local.writeUInt16LE(0x21, 12);         // date (1996-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, dataBuf);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(dataBuf.length, 20);
    cen.writeUInt32LE(dataBuf.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + dataBuf.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(filePath, Buffer.concat([...chunks, centralBuf, end]));
}

async function writeXlsx(filePath, headers, rows) {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'douyin-longtail-keywords';
    wb.created = new Date();
    const ws = wb.addWorksheet('Keywords', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: headers[0], key: 'rank', width: 14 },
      { header: headers[1], key: 'root', width: 16 },
      { header: headers[2], key: 'word', width: 42 },
      { header: headers[3], key: 'src',  width: 24 },
      { header: headers[4], key: 'time', width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FD' } };
    for (const r of rows) ws.addRow(r);
    ws.autoFilter = { from: 'A1', to: 'E1' };
    await wb.xlsx.writeFile(filePath);
    console.log('[Miner] 📊 Excel 导出成功 (exceljs)');
  } catch (e) {
    await writeXlsxMinimal(filePath, headers, rows);
    console.log('[Miner] 📊 Excel 导出成功 (内置写入器)');
  }
}

// ── Build Query List ──────────────────────────────────────────────────────────
const queries = [coreKeyword];

// A-Z
for (let i = 97; i <= 122; i++) {
  queries.push(`${coreKeyword} ${String.fromCharCode(i)}`);
}

// 0-9
for (let i = 0; i <= 9; i++) {
  queries.push(`${coreKeyword} ${i}`);
}

// Common Suffixes
const suffixes = ['怎么', '推荐', '哪个好', '测评', '排行榜', '多少钱', '区别'];
for (const suffix of suffixes) {
  queries.push(`${coreKeyword}${suffix}`);
  queries.push(`${coreKeyword} ${suffix}`); // Added spaced suffix
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`[Miner] 🚀 开始挖掘长尾词...`);
  console.log(`[Miner] 核心大词: ${coreKeyword}`);
  console.log(`[Miner] 将执行 ${queries.length} 次搜索探测`);

  const db = openDb(join(outRoot, 'keywords.db'));
  console.log(`[Miner] 🗄️  数据库驱动: ${db.driver}`);
  
  // 清理该核心大词的历史数据，实现全新覆盖
  db.prepare('DELETE FROM keyword_suggestions WHERE root_keyword = ?').run(coreKeyword);
  console.log(`[Miner] 🧹 已清理 '${coreKeyword}' 的历史数据，准备全新覆盖...`);
  
  const sessionStartTime = new Date().toISOString();
  const allCapturedWords = [];

  // Launch browser with persistent context
  if (!existsSync(dirname(profilePath))) mkdirSync(dirname(profilePath), { recursive: true });
  
  // 优先使用系统已安装的 Google Chrome（复用真实登录态）；没有则回落到
  // Playwright 自带的 Chromium，避免因缺少 Chrome 直接崩溃。
  const launchOpts = {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled']
  };
  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, { ...launchOpts, channel: 'chrome' });
    console.log('[Miner] 🌐 使用系统 Google Chrome');
  } catch (e) {
    console.log('[Miner] ℹ️ 未检测到 Google Chrome，改用 Playwright 内置 Chromium');
    context = await chromium.launchPersistentContext(profilePath, launchOpts);
  }

  let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // 页面崩溃时的恢复逻辑：重开一个标签页并跳回首页，
  // 保证个别探针失败不会中断整轮挖掘。
  let recovered = false;
  async function recoverPage() {
    if (recovered) return;
    recovered = true;
    try {
      const pages = context.pages();
      for (const p of pages) { try { await p.close(); } catch {} }
      page = await context.newPage();
      await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      // 重新定位搜索框（页面已重建，旧的 selector 可能失效）
      searchInput = await locateSearchInput();
      if (!searchInput) console.log('  [警告] 恢复后未找到搜索框');
      console.log('  [恢复] 已重开页面，继续剩余探测');
    } catch (e) {
      console.log(`  [警告] 页面恢复失败: ${e.message}`);
    }
    recovered = false;
  }

  // Stealth
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Current query state
  let currentQuery = '';
  let capturedForCurrent = false;

  // Intercept Suggest API
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/aweme/v1/web/discover/search/suggest/') || url.includes('/sug/')) {
      try {
        const json = await res.json();
        let words = [];
        
        // Extract words based on douyin's payload structure
        if (json.sug_list && Array.isArray(json.sug_list)) {
          words = json.sug_list.map(s => s.content || s.word).filter(Boolean);
        } else if (json.data && Array.isArray(json.data)) {
          words = json.data.map(s => s.content || s.word || s.keyword).filter(Boolean);
        }
        
        if (words.length > 0 && currentQuery) {
          const rows = words.map((word, idx) => ({
            suggestion: word,
            root_keyword: coreKeyword,
            source_query: currentQuery,
            captured_at: new Date().toISOString(),
            rank: idx + 1
          }));
          
          allCapturedWords.push(...rows);
          console.log(`  [拦截成功] '${currentQuery}' -> 捕获 ${words.length} 个长尾词 (例如: ${words[0]})`);
          capturedForCurrent = true;
          
          // Save to DB immediately
          upsertKeywordSuggestions(db, rows);
        }
      } catch (e) {
        // Ignore parse errors silently
      }
    }
  });

  console.log('[Miner] 正在打开抖音首页...');
  await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000); // 增加等待时间以防出现 Please wait...

  // Try to find the search input field
  const searchSelectors = [
    'input[data-e2e="searchbar-input"]',
    'input.search-input',
    'input[placeholder*="搜索"]',
    'input[type="text"]',
    '[data-e2e="searchbar-input"]'
  ];
  
  let searchInput = null;
  async function locateSearchInput() {
    for (const sel of searchSelectors) {
      try {
        if (await page.$(sel)) return sel;
      } catch (e) { /* 页面异常时忽略，继续试下一个选择器 */ }
    }
    return null;
  }
  searchInput = await locateSearchInput();

  if (!searchInput) {
    console.error('[Miner] ❌ 找不到搜索框，请确认页面是否需要验证码或登录。');
    // Try to take a screenshot for debugging
    await page.screenshot({ path: 'miner_error.png' });
    console.error('[Miner] 📸 已保存错误截图到 miner_error.png');
    await context.close();
    process.exit(1);
  }

  console.log('[Miner] 准备就绪，正在检测搜索框是否可用 (若有登录弹窗，请在这 60 秒内手动关闭或扫码)...');
  try {
    // 尝试点击一下搜索框，如果被遮挡会等待，最多等 60 秒
    await page.click(searchInput, { timeout: 60000 });
    console.log('[Miner] 搜索框可用，开始批量探测！');
  } catch (e) {
    console.log('[Miner] ⚠️ 警告: 等待搜索框超时，页面可能被弹窗遮挡。尝试继续执行...');
  }

  // Iterate over all queries
  for (let i = 0; i < queries.length; i++) {
    currentQuery = queries[i];
    capturedForCurrent = false;
    console.log(`\n[Miner] 探测 (${i+1}/${queries.length}): ${currentQuery}`);

    try {
      // 页面重建后搜索框选择器可能失效，重新定位一次
      if (!searchInput) searchInput = await locateSearchInput();
      if (!searchInput) { console.log('  [跳过] 找不到搜索框'); continue; }
      // Focus and clear input
      await page.click(searchInput);
      
      // Select all text and delete it
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);

      // Type the query slowly to trigger the suggest API
      await page.keyboard.type(currentQuery, { delay: 150 });
      
      // Wait for API to respond
      let waitCount = 0;
      while (!capturedForCurrent && waitCount < 10) {
        try {
          await page.waitForTimeout(300);
        } catch (err) {
          // 页面崩溃：重新拉起一个页面后续跑，不中断整轮挖掘
          console.log(`  [警告] 页面异常(${err.message})，尝试恢复页面...`);
          await recoverPage();
          break;
        }
        waitCount++;
      }
      
      if (!capturedForCurrent) {
          // If fill doesn't trigger, try pressing space
          await page.keyboard.press('Space');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(1000);
      }

    } catch (e) {
      console.log(`  [警告] 探测 '${currentQuery}' 时出现错误: ${e.message}`);
    }

    try {
      await page.waitForTimeout(delayMs);
    } catch (err) {
      console.log(`  [警告] 页面异常(${err.message})，尝试恢复页面...`);
      await recoverPage();
    }
  }

  console.log(`\n[Miner] 🎉 挖掘完成！共执行 ${queries.length} 次探测。`);
  
  // Clean up deduplication count
  const allWordsForRoot = getKeywordSuggestionsByRoot(db, coreKeyword);
  console.log(`[Miner] 数据库中 '${coreKeyword}' 相关的去重长尾词库总量为: ${allWordsForRoot.length} 个。`);
  
  // ── Generate Specific Export ───────────────────────────────────────────────
  const keywordDir = join(outRoot, coreKeyword);
  if (!existsSync(keywordDir)) mkdirSync(keywordDir, { recursive: true });

  // 1. Export Excel (Only include records captured/updated in THIS session)
  const sessionData = allWordsForRoot.filter(k => k.captured_at >= sessionStartTime);
  const keywordRows = sessionData.map(k => {
    const parts = k.source_query.split(' ');
    const isTextSuffix = parts.length > 1 && parts[1].length > 1;
    const displaySource = isTextSuffix ? k.source_query.replace(' ', '(带空格) ') : k.source_query;
    return {
      rank: k.rank === 999 ? '-' : k.rank,
      root: k.root_keyword,
      word: k.suggestion,
      src:  displaySource,
      time: k.captured_at,
    };
  });
  
  const excelPath = join(keywordDir, `${coreKeyword}_长尾词库.xlsx`);
  await writeXlsx(excelPath, EXCEL_HEADERS, keywordRows);
  console.log(`[Miner] 📊 专属 Excel 导出成功: ${excelPath}`);

  // 2. Export HTML Webpage
  const groupedData = {};
  for (const k of sessionData) {
    if (!groupedData[k.source_query]) groupedData[k.source_query] = [];
    groupedData[k.source_query].push(k);
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${coreKeyword} - 长尾词挖掘报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 20px; background-color: #f5f5f7; color: #333; }
        h1 { text-align: center; color: #1a1a1a; margin-bottom: 5px; }
        .header-meta { text-align: center; color: #666; margin-bottom: 30px; font-size: 0.95em; }
        
        /* Grid Layout for Boxes */
        .grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }
        
        /* Individual Search Box */
        .search-box {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border: 1px solid #eaeaea;
        }
        
        .box-header {
            background-color: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
            font-size: 1.1em;
            font-weight: 600;
            color: #2c3e50;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .box-header .count {
            font-size: 0.8em;
            background: #eef2f5;
            padding: 3px 8px;
            border-radius: 12px;
            color: #666;
            font-weight: normal;
        }

        .word-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .word-item {
            padding: 12px 20px;
            border-bottom: 1px solid #f5f5f5;
            display: flex;
            align-items: center;
        }
        .word-item:last-child {
            border-bottom: none;
        }
        .word-item:hover {
            background-color: #fcfcfd;
        }

        .rank-badge {
            width: 24px;
            height: 24px;
            background: #f0f4f8;
            color: #0066cc;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85em;
            font-weight: bold;
            margin-right: 15px;
            flex-shrink: 0;
        }
        
        /* Highlight top 3 ranks */
        .rank-badge[data-rank="1"] { background: #ffebee; color: #d32f2f; }
        .rank-badge[data-rank="2"] { background: #fff3e0; color: #ef6c00; }
        .rank-badge[data-rank="3"] { background: #f1f8e9; color: #33691e; }

        .suggestion {
            font-size: 0.95em;
            color: #333;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <h1>🔍 "${coreKeyword}" 专属长尾词挖掘报告</h1>
    <div class="header-meta">
        共挖掘 <strong>${Object.keys(groupedData).length}</strong> 个触发词，合计 <strong>${sessionData.length}</strong> 个排名长尾词 | 导出时间：${new Date().toLocaleString()}
    </div>
    
    <div class="grid-container">
        ${Object.keys(groupedData).map(query => {
            const parts = query.split(' ');
            const isTextSuffix = parts.length > 1 && parts[1].length > 1;
            const displayQuery = isTextSuffix ? query.replace(' ', '<span style="background-color:#ffeaa7; padding:2px 4px; border-radius:4px; font-size:0.75em; margin:0 4px; color:#d35400;">带空格</span>') : query;
            return `
        <div class="search-box">
            <div class="box-header">
                <span>触发词：<span style="color:#0066cc;">${displayQuery}</span></span>
                <span class="count">${groupedData[query].length} 个</span>
            </div>
            <ul class="word-list">
                ${groupedData[query].map(k => `
                <li class="word-item">
                    <span class="rank-badge" data-rank="${k.rank}">${k.rank === 999 ? '-' : k.rank}</span>
                    <span class="suggestion">${k.suggestion}</span>
                </li>
                `).join('')}
            </ul>
        </div>
        `}).join('')}
    </div>
</body>
</html>`;
  
  const fs = require('node:fs');
  const htmlPath = join(keywordDir, `${coreKeyword}_长尾词报告.html`);
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  console.log(`[Miner] 🌐 专属网页展示导出成功: ${htmlPath}`);

  db.close();
  await context.close();
  
  console.log(`\n[Miner] 全部流程处理完毕！`);
})();
