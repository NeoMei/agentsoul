import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const AGENTSOUL_DIR = path.join(os.homedir(), '.agentsoul');
const MEMORY_DB = path.join(AGENTSOUL_DIR, 'memory.db');
const MEMORY_JSON = path.join(AGENTSOUL_DIR, 'memory.json');

let dbInstance = null;
let dbFailed = false;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isBun() {
  if (typeof process === 'undefined') return false;
  if (process.versions?.bun) return true;
  if (typeof globalThis.Bun !== 'undefined') return true;
  const execPath = process.execPath || '';
  const argv0 = process.argv?.[0] || '';
  return (
    execPath.includes('bun') ||
    argv0.includes('bun') ||
    argv0.includes('opencode') ||
    execPath.includes('opencode')
  );
}

async function tryLoadBunSqlite() {
  if (!isBun()) return null;
  try {
    const mod = await import('bun:sqlite');
    return mod.Database;
  } catch {
    return null;
  }
}

function getGlobalNpmRoot() {
  try {
    return execSync('npm root -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function findOpencodeRoot() {
  try {
    const which = execSync('which opencode', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (which) {
      const real = fs.realpathSync(which);
      let dir = path.dirname(real);
      while (dir !== path.dirname(dir)) {
        const pkgPath = path.join(dir, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.name === 'opencode-ai') return dir;
          } catch {}
        }
        dir = path.dirname(dir);
      }
    }
  } catch {}

  try {
    const globalRoot = getGlobalNpmRoot();
    if (globalRoot) {
      const opencodePath = path.join(globalRoot, 'opencode-ai');
      if (fs.existsSync(path.join(opencodePath, 'package.json'))) return opencodePath;
    }
  } catch {}

  const candidates = [
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', 'opencode-ai'),
    path.join(os.homedir(), '.local', 'lib', 'node_modules', 'opencode-ai'),
    '/usr/local/lib/node_modules/opencode-ai',
    '/usr/lib/node_modules/opencode-ai',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }

  return null;
}

async function tryLoadBetterSqlite3() {
  const opencodeRoot = findOpencodeRoot();
  if (opencodeRoot) {
    try {
      const req = createRequire(path.join(opencodeRoot, 'package.json'));
      const resolved = req.resolve('better-sqlite3');
      const agentsoulCache = path.join(os.homedir(), '.cache', 'opencode', 'packages', '@neomei');
      if (!resolved.includes(agentsoulCache)) {
        const mod = await import(resolved);
        return mod.default;
      }
    } catch {}
  }

  const agentsoulCache = path.join(os.homedir(), '.cache', 'opencode', 'packages', '@neomei');
  const contexts = [];
  if (process.argv[1]) contexts.push(process.argv[1]);
  const globalRoot = getGlobalNpmRoot();
  if (globalRoot) {
    contexts.push(path.join(globalRoot, 'opencode-ai', 'package.json'));
  }
  const candidates = [
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', 'opencode-ai', 'package.json'),
    path.join(os.homedir(), '.local', 'lib', 'node_modules', 'opencode-ai', 'package.json'),
    '/usr/local/lib/node_modules/opencode-ai/package.json',
    '/usr/lib/node_modules/opencode-ai/package.json',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) contexts.push(c);
  }

  for (const ctx of contexts) {
    try {
      const req = createRequire(ctx);
      const resolved = req.resolve('better-sqlite3');
      if (resolved.includes(agentsoulCache)) continue;
      const mod = await import(resolved);
      return mod.default;
    } catch {
      // Continue
    }
  }

  return null;
}

// JSON file store — works in any environment without native modules
class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
    if (!this.data.conversations) {
      this.data.conversations = [];
    }
  }

  _load() {
    if (fs.existsSync(this.filePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      } catch {}
    }
    return { conversations: [] };
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch {}
  }

  exec(sql) {
    if (sql.includes('DELETE FROM')) {
      this.data.conversations = [];
      this._save();
    }
  }

  prepare(sql) {
    const store = this;
    return {
      run(...params) {
        if (sql.includes('INSERT INTO conversations')) {
          store.data.conversations.push({
            id: store.data.conversations.length + 1,
            session_id: params[0],
            role: params[1],
            content: params[2],
            timestamp: params[3],
          });
          store._save();
        }
      },
      all(...params) {
        let result = [...store.data.conversations];

        if (sql.includes('WHERE content LIKE')) {
          const query = (params[0] || '').replace(/%/g, '');
          const limit = params[1] || 10;
          result = result.filter((r) => r.content.includes(query)).slice(-limit);
        } else if (sql.includes('ORDER BY id DESC LIMIT')) {
          const limit = params[0] || 20;
          result = result.slice(-limit);
        }

        result = result.reverse();

        if (sql.includes('substr(content, 1, 80)')) {
          return result.map((r) => ({
            id: r.id,
            role: r.role,
            preview: r.content.substring(0, 80),
            time: new Date(r.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19),
          }));
        }
        if (sql.includes('datetime(timestamp')) {
          return result.map((r) => ({
            id: r.id,
            role: r.role,
            content: r.content,
            time: new Date(r.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19),
          }));
        }
        return result.map((r) => ({ role: r.role, content: r.content }));
      },
    };
  }

  close() {}
}

async function getDb() {
  if (dbInstance) return dbInstance;
  if (dbFailed) return null;

  // Suppress stderr during module loading to prevent TUI corruption
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origConsoleError = console.error;
  process.stderr.write = () => true;
  console.error = () => {};

  try {
    let Database = null;
    const bunEnv = isBun();

    // Strategy 1: Bun's built-in sqlite (OpenCode runs on Bun)
    if (bunEnv) {
      Database = await tryLoadBunSqlite();
    }

    // Strategy 2: Node.js better-sqlite3
    // Only try in pure Node.js — never in Bun to avoid .node loading errors
    if (!Database && !bunEnv) {
      Database = await tryLoadBetterSqlite3();
    }

    if (Database) {
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
    }

    // Strategy 3: JSON file store — universal fallback, zero native deps
    dbInstance = new JsonStore(MEMORY_JSON);
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
