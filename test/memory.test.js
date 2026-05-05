import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('memory', () => {
  const testDbPath = path.join(os.homedir(), '.agentsoul', 'memory.db');

  before(async () => {
    // Clear test db if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  after(async () => {
    const { closeDb } = await import('../src/memory.js');
    await closeDb();
  });

  it('saveConversation stores messages', async () => {
    const { saveConversation, listMemories } = await import('../src/memory.js');
    await saveConversation('test-session', 'user', 'Hello');
    await saveConversation('test-session', 'assistant', 'Hi there!');

    const rows = await listMemories(10);
    assert.ok(rows.length >= 2, 'Should have at least 2 rows');
    assert.ok(rows.some((r) => r.role === 'user' && r.preview.includes('Hello')));
    assert.ok(rows.some((r) => r.role === 'assistant' && r.preview.includes('Hi there!')));
  });

  it('searchMemories finds by content', async () => {
    const { saveConversation, searchMemories } = await import('../src/memory.js');
    await saveConversation('test-session', 'user', 'unique search keyword xyz123');

    const rows = await searchMemories('xyz123', 10);
    assert.ok(rows.length >= 1, 'Should find the message');
    assert.ok(rows.some((r) => r.content.includes('xyz123')));
  });

  it('clearMemories removes all data', async () => {
    const { saveConversation, listMemories, clearMemories } = await import('../src/memory.js');
    await saveConversation('test-session', 'user', 'temp');
    await clearMemories();

    const rows = await listMemories(100);
    assert.strictEqual(rows.length, 0, 'Should be empty after clear');
  });
});
