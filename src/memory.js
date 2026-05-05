import fs from 'fs';
import path from 'path';
import os from 'os';

const AGENTSOUL_DIR = path.join(os.homedir(), '.agentsoul');
const MEMORY_DB = path.join(AGENTSOUL_DIR, 'memory.db');

let dbInstance = null;
let dbFailed = false;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function getDb() {
  if (dbInstance) return dbInstance;
  if (dbFailed) return null;

  try {
    const { default: Database } = await import('better-sqlite3');
    ensureDir(path.dirname(MEMORY_DB));
    dbInstance = new Database(MEMORY_DB);
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT,
        content TEXT,
        timestamp INTEGER
      )
    `);
    return dbInstance;
  } catch (e) {
    dbFailed = true;
    return null;
  }
}

export async function saveConversation(sessionId, role, content) {
  const db = await getDb();
  if (!db) return;
  try {
    db.prepare(
      'INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
    ).run(sessionId || null, role, content, Math.floor(Date.now() / 1000));
  } catch {
    // Silently skip on failure to avoid breaking TUI/serve output
  }
}

export async function loadRecentMemories(limit = 5) {
  const db = await getDb();
  if (!db) return '';
  try {
    const rows = db
      .prepare('SELECT role, content FROM conversations ORDER BY id DESC LIMIT ?')
      .all(limit);
    if (rows.length === 0) return '';
    return (
      '\n\n=== Recent Memories ===\n' +
      rows.reverse().map((r) => `${r.role}: ${r.content}`).join('\n')
    );
  } catch {
    return '';
  }
}

export async function listMemories(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .prepare(
      "SELECT id, role, substr(content, 1, 80) as preview, datetime(timestamp, 'unixepoch') as time FROM conversations ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
}

export async function searchMemories(query, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .prepare(
      "SELECT id, role, content, datetime(timestamp, 'unixepoch') as time FROM conversations WHERE content LIKE ? ORDER BY id DESC LIMIT ?"
    )
    .all(`%${query}%`, limit);
}

export async function clearMemories() {
  const db = await getDb();
  if (!db) return;
  db.exec('DELETE FROM conversations');
}

export async function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }
}
