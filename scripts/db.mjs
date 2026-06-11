#!/usr/bin/env node
/**
 * scripts/db.mjs
 * keyboards_skill — SQLite 数据访问层 (精简版，专为长尾词挖掘优化)
 */

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DB_PATH = join(__dirname, '..', 'outputs', 'keywords.db');

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

// ── openDb ────────────────────────────────────────────────────────────────────

/**
 * 打开（或创建）SQLite 数据库，自动建表和索引。
 * @param {string} [dbPath] 数据库文件路径
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(dbPath = DEFAULT_DB_PATH) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    throw new Error(
      `[db] 缺少依赖 better-sqlite3。请运行：npm install better-sqlite3\n原始错误：${e.message}`
    );
  }

  const db = new Database(dbPath);
  db.exec(DDL);
  return db;
}

// ── Keyword Suggestions ────────────────────────────────────────────────────────

/**
 * 批量插入或更新长尾词（事务包裹）
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{suggestion: string, root_keyword: string, source_query: string, captured_at: string, rank: number}>} rows
 */
export function upsertKeywordSuggestions(db, rows) {
  if (!rows || rows.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO keyword_suggestions
      (suggestion, root_keyword, source_query, captured_at, rank)
    VALUES
      (@suggestion, @root_keyword, @source_query, @captured_at, @rank)
    ON CONFLICT(root_keyword, source_query, suggestion) DO UPDATE SET
      captured_at  = excluded.captured_at,
      rank         = excluded.rank
  `);

  const insertMany = db.transaction((items) => {
    for (const v of items) {
      stmt.run({
        suggestion:   String(v.suggestion || '').trim(),
        root_keyword: String(v.root_keyword || '').trim(),
        source_query: String(v.source_query || '').trim(),
        captured_at:  String(v.captured_at || new Date().toISOString()),
        rank:         Number(v.rank) || 999
      });
    }
  });

  insertMany(rows);
}

/**
 * 根据核心大词查询相关的所有长尾词
 * @param {import('better-sqlite3').Database} db
 * @param {string} rootKeyword
 * @returns {Array<object>}
 */
export function getKeywordSuggestionsByRoot(db, rootKeyword) {
  return db
    .prepare('SELECT * FROM keyword_suggestions WHERE root_keyword = ? ORDER BY source_query ASC, rank ASC')
    .all(rootKeyword);
}

export { DEFAULT_DB_PATH };
