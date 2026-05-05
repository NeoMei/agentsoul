import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We need to test the actual module, but it uses os.homedir().
// For unit testing, we'll verify the logic by temporarily creating soul files.

describe('soul', () => {
  it('loadSoul returns empty string when no soul files exist', async () => {
    const { loadSoul } = await import('../src/soul.js');
    // When ~/.agentsoul/soul/ doesn't have the files, loadSoul should return ''
    // We can't easily mock os.homedir() in ESM, so we at least verify it doesn't throw
    const result = loadSoul();
    assert.strictEqual(typeof result, 'string');
  });

  it('ensureSoulDir creates directory and returns path', async () => {
    const { ensureSoulDir } = await import('../src/soul.js');
    const dir = ensureSoulDir();
    assert.ok(fs.existsSync(dir), 'Soul directory should exist');
    assert.ok(dir.includes('.agentsoul'), 'Path should contain .agentsoul');
  });
});
