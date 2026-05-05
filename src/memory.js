import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const AGENTSOUL_DIR = path.join(os.homedir(), '.agentsoul');
const MEMORY_DB = path.join(AGENTSOUL_DIR, 'memory.db');

let dbInstance = null;
let dbFailed = false;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function tryLoadBetterSqlite3() {
  // Resolve better-sqlite3 from the host process (opencode) context.
  // AgentSoul does not declare better-sqlite3 as its own dependency;
  // it reuses the one already installed by opencode.
  try {
    const hostEntry = process.argv[1];
    if (hostEntry && hostEntry.endsWith('.js')) {
      const req = createRequire(hostEntry);
      const resolved = req.resolve('better-sqlite3');
      return await import(resolved);
    }
  } catch {
    // Fall through
  }

  // Fallback: common global opencode locations
  const candidates = [
    path.join(os.homedir(), '.npm-global/lib/node_modules/opencode/package.json'),
    path.join(os.homedir(), '.local/lib/node_modules/opencode/package.json'),
    '/usr/local/lib/node_modules/opencode/package.json',
    '/usr/lib/node_modules/opencode/package.json',
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const req = createRequire(c);
        const resolved = req.resolve('better-sqlite3');
        return await import(resolved);
      }
    } catch {
      // Continue
    }
  }

  return null;
}

async function getDb() {
  if (dbInstance) return dbInstance;
  if (dbFailed) return null;

  // Suppress stderr during better-sqlite3 loading to prevent TUI corruption
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origConsoleError = console.error;
  process.stderr.write = () => true;
  console.error = () => {};

  try {
    const mod = await tryLoadBetterSqlite3();
    if (!mod) {
      dbFailed = true;
      return null;
    }
    const Database = mod.default;
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
  } catch {
    dbFailed = true;
    return null;
  } finally {
    process.stderr.write = origStderrWrite;
    console.error = origConsoleError;
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
