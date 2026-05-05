import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const AGENTSOUL_DIR = path.join(os.homedir(), '.agentsoul');
const MEMORY_DB = path.join(AGENTSOUL_DIR, 'memory.db');

let dbInstance = null;
let dbFailed = false;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getGlobalNpmRoot() {
  try {
    return execSync('npm root -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

async function tryLoadBetterSqlite3() {
  // Build a list of candidate require contexts
  const contexts = [];

  // Strategy 1: host process entry
  if (process.argv[1]) {
    contexts.push(process.argv[1]);
  }

  // Strategy 2: global npm root
  const globalRoot = getGlobalNpmRoot();
  if (globalRoot) {
    contexts.push(path.join(globalRoot, 'opencode', 'package.json'));
  }

  // Strategy 3: common global opencode locations
  const candidates = [
    path.join(os.homedir(), '.npm-global/lib/node_modules/opencode/package.json'),
    path.join(os.homedir(), '.local/lib/node_modules/opencode/package.json'),
    '/usr/local/lib/node_modules/opencode/package.json',
    '/usr/lib/node_modules/opencode/package.json',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) contexts.push(c);
  }

  // Try each context, skipping any copy inside the opencode plugin cache
  const agentsoulCache = path.join(os.homedir(), '.cache', 'opencode', 'packages', '@neomei');
  for (const ctx of contexts) {
    try {
      const req = createRequire(ctx);
      const resolved = req.resolve('better-sqlite3');
      if (resolved.includes(agentsoulCache)) continue;
      return await import(resolved);
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
