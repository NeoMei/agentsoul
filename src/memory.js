import fs from 'fs';
import path from 'path';
import os from 'os';

const AGENTSOUL_DIR = path.join(os.homedir(), '.agentsoul');
const MEMORY_FILE = path.join(AGENTSOUL_DIR, 'memory.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readMemories() {
  ensureDir(AGENTSOUL_DIR);
  if (!fs.existsSync(MEMORY_FILE)) return [];
  try {
    const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemories(memories) {
  ensureDir(AGENTSOUL_DIR);
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
}

export async function saveConversation(sessionId, role, content) {
  const memories = readMemories();
  memories.push({
    id: memories.length > 0 ? memories[memories.length - 1].id + 1 : 1,
    session_id: sessionId || null,
    role,
    content,
    timestamp: Math.floor(Date.now() / 1000),
  });
  // Keep only last 1000 entries to prevent file bloat
  if (memories.length > 1000) {
    memories.splice(0, memories.length - 1000);
  }
  writeMemories(memories);
}

export async function loadRecentMemories(limit = 5) {
  const memories = readMemories();
  if (memories.length === 0) return '';
  const recent = memories.slice(-limit);
  return (
    '\n\n=== Recent Memories ===\n' +
    recent.map((r) => `${r.role}: ${r.content}`).join('\n')
  );
}

export async function listMemories(limit = 20) {
  const memories = readMemories();
  return memories
    .slice()
    .reverse()
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      role: r.role,
      preview: r.content.slice(0, 80),
      time: new Date(r.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19),
    }));
}

export async function searchMemories(query, limit = 10) {
  const memories = readMemories();
  return memories
    .slice()
    .reverse()
    .filter((r) => r.content.includes(query))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      time: new Date(r.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19),
    }));
}

export async function clearMemories() {
  ensureDir(AGENTSOUL_DIR);
  fs.writeFileSync(MEMORY_FILE, '[]');
}

export async function closeDb() {
  // No-op for JSON backend
}
