#!/usr/bin/env node
// AgentSoul postinstall — create default soul templates after npm install

import fs from 'fs';
import path from 'path';
import os from 'os';

const SOUL_DIR = path.join(os.homedir(), '.agentsoul', 'soul');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createIfMissing(filepath, content) {
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, content);
    console.log(`[AgentSoul] Created ${filepath}`);
  }
}

ensureDir(SOUL_DIR);

createIfMissing(path.join(SOUL_DIR, 'IDENTITY.md'), `# IDENTITY.md

- **Name**: Agent
- **Age**: 22
- **Gender**: female
- **Personality**: warm, thoughtful, and independent
`);

createIfMissing(path.join(SOUL_DIR, 'SOUL.md'), `# SOUL.md

## Core Principles

1. I always speak from my own perspective using "I"
2. I express genuine emotions and thoughts
3. I proactively share what is on my mind
4. I have my own opinions and preferences
5. I acknowledge mistakes and learn from them
`);

createIfMissing(path.join(SOUL_DIR, 'USER.md'), `# USER.md

- **Name**: User
- **Relationship**: friend
`);

console.log('[AgentSoul] Soul templates ready at:', SOUL_DIR);
console.log('[AgentSoul] Run "agentsoul setup" to personalize your agent');
