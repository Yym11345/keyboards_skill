#!/usr/bin/env node
/**
 * scripts/db.mjs
 * douyin-longtail-keywords — SQLite 数据访问层
 *
 * 双路径设计（避免强制安装原生模块）：
 *   1) 优先 better-sqlite3 —— 若环境里已装则直接用；
 *   2) 回落 node:sqlite     —— Node 22+ 内置，零安装零编译。
 * 两条路径对外暴露同一组方法，调用方无需关心底层差异。
 */

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 默认落在当前工作目录（技能安装目录在平台上可能是只读的）
const DEFAULT_DB_PATH = join(process.cwd(), 'outputs', 'keywords', 'keywords.db');

// ── Schema DDL ────────────────────────────────────────────────────────────────

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;

CREATE TABLE IF NOT EXISTS keyword_suggestions (
  suggestion   TEXT,
  root_keyword TEXT DEFAULT '',
  source_query TEXT DEFAULT '',
  captured_at  TEXT DEFAULT '',
  rank         INTEGER DEFAULT 999,
  PRIMARY KEY (root_keyword, source_query, suggestion)
);

CREATE INDEX IF NOT EXISTS idx_keyword_suggestions_root ON keyword_suggestions(root_keyword);
`;

// ── Driver adapters ───────────────────────────────────────────────────────────

/**
 * 把 better-sqlite3 的 API 适配成 node:sqlite 的形状。
 * node:sqlite 的 prepare().run() 返回 { changes, lastInsertRowid }，
 * 且不支持具名参数（@name），因此这里统一改用位置参数。
 */
function adaptNodeSqlite(raw) {
  return {
    _raw: raw,
    exec: (sql) => raw.exec(sql),
    close: () => raw.close(),
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        run: (...args) => stmt.run(...args),
        get: (...args) => stmt.get(...args),
        all: (...args) => stmt.all(...args),
      };
    },
  };
}

// ── openDb ────────────────────────────────────────────────────────────────────

/**
 * 打开（或创建）SQLite 数据库，自动建表和索引。
 * 优先 better-sqlite3，不可用时自动回落 node:sqlite。
 * @param {string} [dbPath] 数据库文件路径
 * @returns {{exec:Function, prepare:Function, close:Function, driver:string}}
 */
export function openDb(dbPath = DEFAULT_DB_PATH) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // ── 路径 1：better-sqlite3 ──
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.exec(DDL);
    db.driver = 'better-sqlite3';
    return db;
  } catch (e) {
    // 装不上就走内置路径，不抛错
  }

  // ── 路径 2：node:sqlite（Node 22+ 内置）──
  try {
    const { DatabaseSync } = require('node:sqlite');
    const raw = new DatabaseSync(dbPath);
    const db = adaptNodeSqlite(raw);
    db.exec(DDL);
    db.driver = 'node:sqlite';
    return db;
  } catch (e) {
    throw new Error(
      `[db] 无法打开数据库：既没有 better-sqlite3，node:sqlite 也不可用。\n` +
      `  解决办法一：npm install better-sqlite3\n` +
      `  解决办法二：升级到 Node 22 或更高版本（内置 node:sqlite）\n` +
      `  原始错误：${e.message}`
    );
  }
}

// ── Keyword Suggestions ────────────────────────────────────────────────────────

/**
 * 批量插入或更新长尾词（事务包裹）
 * @param {object} db
 * @param {Array<{suggestion:string, root_keyword:string, source_query:string, captured_at:string, rank:number}>} rows
 */
export function upsertKeywordSuggestions(db, rows) {
  if (!rows || rows.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO keyword_suggestions
      (suggestion, root_keyword, source_query, captured_at, rank)
    VALUES
      (?, ?, ?, ?, ?)
    ON CONFLICT(root_keyword, source_query, suggestion) DO UPDATE SET
      captured_at  = excluded.captured_at,
      rank         = excluded.rank
  `);

  const insertMany = db.transaction
    ? db.transaction((items) => {
        for (const v of items) {
          stmt.run(
            String(v.suggestion || '').trim(),
            String(v.root_keyword || '').trim(),
            String(v.source_query || '').trim(),
            String(v.captured_at || new Date().toISOString()),
            Number(v.rank) || 999
          );
        }
      })
    : (items) => {
        for (const v of items) {
          stmt.run(
            String(v.suggestion || '').trim(),
            String(v.root_keyword || '').trim(),
            String(v.source_query || '').trim(),
            String(v.captured_at || new Date().toISOString()),
            Number(v.rank) || 999
          );
        }
      };

  insertMany(rows);
}

/**
 * 根据核心大词查询相关的所有长尾词
 * @param {object} db
 * @param {string} rootKeyword
 * @returns {Array<object>}
 */
export function getKeywordSuggestionsByRoot(db, rootKeyword) {
  return db
    .prepare('SELECT * FROM keyword_suggestions WHERE root_keyword = ? ORDER BY source_query ASC, rank ASC')
    .all(rootKeyword);
}

/** 删除某个核心词的全部历史记录 */
export function clearByRoot(db, rootKeyword) {
  return db.prepare('DELETE FROM keyword_suggestions WHERE root_keyword = ?').run(rootKeyword);
}

export { DEFAULT_DB_PATH };
