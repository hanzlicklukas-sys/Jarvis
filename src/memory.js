'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'jarvis.db');

let db = null;

function getDb() {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT (datetime('now')),
      last_accessed DATETIME DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      type,
      metadata,
      content='memories',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, type, metadata)
      VALUES (new.id, new.content, new.type, new.metadata);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, type, metadata)
      VALUES ('delete', old.id, old.content, old.type, old.metadata);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, type, metadata)
      VALUES ('delete', old.id, old.content, old.type, old.metadata);
      INSERT INTO memories_fts(rowid, content, type, metadata)
      VALUES (new.id, new.content, new.type, new.metadata);
    END;

    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      input TEXT DEFAULT '{}',
      output TEXT DEFAULT '',
      timestamp DATETIME DEFAULT (datetime('now')),
      success INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_action_log_tool ON action_log(tool_name);
    CREATE INDEX IF NOT EXISTS idx_action_log_timestamp ON action_log(timestamp);
  `);
}

function saveMemory(type, content, metadata = {}) {
  try {
    const database = getDb();
    const insert = database.prepare(`
      INSERT INTO memories (type, content, metadata)
      VALUES (?, ?, ?)
    `);
    const result = database.transaction(() => {
      return insert.run(type || 'general', content, JSON.stringify(metadata));
    })();
    return { id: result.lastInsertRowid, type, content, metadata };
  } catch (err) {
    console.error('saveMemory error:', err.message);
    throw err;
  }
}

function recallMemory(query, limit = 10) {
  try {
    const database = getDb();

    // Try FTS search first
    let results = [];
    try {
      const ftsStmt = database.prepare(`
        SELECT m.*, rank
        FROM memories_fts fts
        JOIN memories m ON fts.rowid = m.id
        WHERE memories_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      results = ftsStmt.all(query, limit);
    } catch (ftsErr) {
      // Fallback to LIKE search
      const likeStmt = database.prepare(`
        SELECT * FROM memories
        WHERE content LIKE ? OR type LIKE ? OR metadata LIKE ?
        ORDER BY last_accessed DESC
        LIMIT ?
      `);
      const likeQuery = `%${query}%`;
      results = likeStmt.all(likeQuery, likeQuery, likeQuery, limit);
    }

    // Update last_accessed and access_count
    if (results.length > 0) {
      const updateStmt = database.prepare(`
        UPDATE memories SET last_accessed = datetime('now'), access_count = access_count + 1
        WHERE id = ?
      `);
      database.transaction(() => {
        results.forEach(r => updateStmt.run(r.id));
      })();
    }

    return results.map(r => ({
      id: r.id,
      type: r.type,
      content: r.content,
      metadata: (() => { try { return JSON.parse(r.metadata); } catch { return {}; } })(),
      created_at: r.created_at,
      last_accessed: r.last_accessed,
      access_count: r.access_count
    }));
  } catch (err) {
    console.error('recallMemory error:', err.message);
    return [];
  }
}

function forgetMemory(id) {
  try {
    const database = getDb();
    const stmt = database.prepare('DELETE FROM memories WHERE id = ?');
    const result = database.transaction(() => stmt.run(id))();
    return result.changes > 0;
  } catch (err) {
    console.error('forgetMemory error:', err.message);
    return false;
  }
}

function getAllMemories(limit = 100, offset = 0) {
  try {
    const database = getDb();
    const stmt = database.prepare(`
      SELECT * FROM memories
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset);
    return rows.map(r => ({
      id: r.id,
      type: r.type,
      content: r.content,
      metadata: (() => { try { return JSON.parse(r.metadata); } catch { return {}; } })(),
      created_at: r.created_at,
      last_accessed: r.last_accessed,
      access_count: r.access_count
    }));
  } catch (err) {
    console.error('getAllMemories error:', err.message);
    return [];
  }
}

function searchMemories(query, limit = 20) {
  return recallMemory(query, limit);
}

function getMemoryStats() {
  try {
    const database = getDb();
    const totalStmt = database.prepare('SELECT COUNT(*) as count FROM memories');
    const byTypeStmt = database.prepare(`
      SELECT type, COUNT(*) as count FROM memories GROUP BY type ORDER BY count DESC
    `);
    const recentStmt = database.prepare(`
      SELECT * FROM memories ORDER BY created_at DESC LIMIT 5
    `);
    const actionCountStmt = database.prepare('SELECT COUNT(*) as count FROM action_log');
    const topToolsStmt = database.prepare(`
      SELECT tool_name, COUNT(*) as count FROM action_log GROUP BY tool_name ORDER BY count DESC LIMIT 5
    `);

    return {
      total_memories: totalStmt.get().count,
      by_type: byTypeStmt.all(),
      recent: recentStmt.all().map(r => ({
        id: r.id,
        type: r.type,
        content: r.content.substring(0, 100),
        created_at: r.created_at
      })),
      total_actions: actionCountStmt.get().count,
      top_tools: topToolsStmt.all()
    };
  } catch (err) {
    console.error('getMemoryStats error:', err.message);
    return { total_memories: 0, by_type: [], recent: [], total_actions: 0, top_tools: [] };
  }
}

function logAction(tool_name, input, output, success = true) {
  try {
    const database = getDb();
    const stmt = database.prepare(`
      INSERT INTO action_log (tool_name, input, output, success)
      VALUES (?, ?, ?, ?)
    `);
    database.transaction(() => {
      stmt.run(
        tool_name,
        typeof input === 'string' ? input : JSON.stringify(input),
        typeof output === 'string' ? output : JSON.stringify(output),
        success ? 1 : 0
      );
    })();
  } catch (err) {
    console.error('logAction error:', err.message);
  }
}

function getRecentActions(limit = 20) {
  try {
    const database = getDb();
    const stmt = database.prepare(`
      SELECT * FROM action_log ORDER BY timestamp DESC LIMIT ?
    `);
    const rows = stmt.all(limit);
    return rows.map(r => ({
      id: r.id,
      tool_name: r.tool_name,
      input: (() => { try { return JSON.parse(r.input); } catch { return r.input; } })(),
      output: r.output,
      timestamp: r.timestamp,
      success: r.success === 1
    }));
  } catch (err) {
    console.error('getRecentActions error:', err.message);
    return [];
  }
}

module.exports = {
  saveMemory,
  recallMemory,
  forgetMemory,
  getAllMemories,
  searchMemories,
  getMemoryStats,
  logAction,
  getRecentActions,
  getDb
};
