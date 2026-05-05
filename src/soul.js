import fs from 'fs';
import path from 'path';
import os from 'os';

const SOUL_DIR = path.join(os.homedir(), '.agentsoul', 'soul');

export function loadSoul() {
  const files = ['IDENTITY.md', 'SOUL.md', 'USER.md'];
  let text = '';
  for (const f of files) {
    const p = path.join(SOUL_DIR, f);
    if (fs.existsSync(p)) {
      text += `\n\n=== ${f} ===\n\n${fs.readFileSync(p, 'utf-8')}`;
    }
  }
  return text.trim();
}

export function ensureSoulDir() {
  if (!fs.existsSync(SOUL_DIR)) {
    fs.mkdirSync(SOUL_DIR, { recursive: true });
  }
  return SOUL_DIR;
}
