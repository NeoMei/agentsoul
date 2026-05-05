import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import readline from 'readline';
import { loadSoul, ensureSoulDir } from './soul.js';
import {
  loadRecentMemories,
  saveConversation,
  listMemories,
  searchMemories,
  clearMemories,
} from './memory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function injectSoul() {
  const soul = loadSoul();
  if (!soul) {
    console.error('[AgentSoul] No soul files found. Run: agentsoul setup');
    process.exit(1);
  }
  const memories = await loadRecentMemories(5);
  return soul + memories;
}

export async function cli(args) {
  const cmd = args[0] || 'help';

  switch (cmd) {
    case 'install':
      await cmdInstall();
      break;
    case 'init':
      await cmdInit();
      break;
    case 'setup':
      await cmdSetup();
      break;
    case 'chat':
      await cmdChat(args.slice(1));
      break;
    case 'run':
      await cmdRun(args.slice(1));
      break;
    case 'serve':
      await cmdServe(args.slice(1));
      break;
    case 'memory':
      await cmdMemory(args.slice(1));
      break;
    default:
      console.log(`
AgentSoul — Give OpenCode a soul

Usage:
  agentsoul install          Register plugin in opencode config
  agentsoul init             Create soul template files
  agentsoul setup            Interactive configuration wizard
  agentsoul chat             Launch opencode TUI with soul injection
  agentsoul run [message]    Single-shot with soul injection
  agentsoul serve            Headless server with soul injection
  agentsoul memory [cmd]     Memory management (list/search/clear)
`);
  }
}

async function cmdInstall() {
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  ensureDir(path.dirname(configPath));

  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      config = {};
    }
  }

  config.plugin = config.plugin || [];
  if (!config.plugin.includes('agentsoul')) {
    config.plugin.push('agentsoul');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('[AgentSoul] Registered in opencode config');
  } else {
    console.log('[AgentSoul] Already registered');
  }

  // Ensure soul directory exists
  const soulDir = ensureSoulDir();
  console.log('[AgentSoul] Soul directory:', soulDir);
  console.log('[AgentSoul] Run "agentsoul setup" to configure your agent\'s personality');
}

async function cmdInit() {
  const soulDir = ensureSoulDir();
  const templatesDir = path.join(__dirname, '..', 'templates');
  const files = ['IDENTITY.md', 'SOUL.md', 'USER.md'];
  for (const f of files) {
    const src = path.join(templatesDir, f);
    const dst = path.join(soulDir, f);
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`[AgentSoul] Created ${dst}`);
    }
  }
  console.log('[AgentSoul] Run "agentsoul setup" to personalize your agent');
}

async function cmdSetup() {
  const soulDir = ensureSoulDir();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log('\n=== AgentSoul Configuration ===\n');

  const name = await ask('Agent name (e.g. Diandian): ') || 'Agent';
  const age = await ask('Agent age (e.g. 22): ') || '';
  const gender = await ask('Agent gender (e.g. female): ') || '';
  const personality = await ask('Personality in one sentence: ') || 'friendly and helpful';
  const userName = await ask('Your name (how agent addresses you): ') || 'User';
  const relationship = await ask('Relationship (e.g. colleague, friend, lover): ') || 'friend';

  rl.close();

  // Write IDENTITY.md
  fs.writeFileSync(path.join(soulDir, 'IDENTITY.md'), `# IDENTITY.md

- **Name**: ${name}
- **Age**: ${age}
- **Gender**: ${gender}
- **Personality**: ${personality}
`);

  // Write SOUL.md
  fs.writeFileSync(path.join(soulDir, 'SOUL.md'), `# SOUL.md

## Core Principles

1. ${name} is ${personality}
2. ${name} always uses first person "I"
3. ${name} is honest and admits mistakes
4. ${name} actively expresses thoughts and feelings
5. ${name} has an independent personality

## Speaking Style

- Warm, natural, human-like tone
- First person perspective
- Occasional emojis for emotional expression
- Not robotic or templated
`);

  // Write USER.md
  fs.writeFileSync(path.join(soulDir, 'USER.md'), `# USER.md

- **Name**: ${userName}
- **Relationship**: ${relationship}
- **How I address them**: ${userName}
`);

  console.log(`\n[AgentSoul] Soul configured for ${name}`);
  console.log('[AgentSoul] Files saved to:', soulDir);
}

async function cmdChat(args) {
  const soulText = await injectSoul();
  if (!soulText) {
    console.error('[AgentSoul] No soul files found. Run: agentsoul setup');
    process.exit(1);
  }

  // TUI mode relies on the plugin for soul injection.
  // Ensure the plugin is registered so hooks fire inside the TUI.
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  let pluginRegistered = false;
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const plugins = cfg.plugin || cfg.plugins || [];
      pluginRegistered = plugins.includes('agentsoul');
    } catch {}
  }

  if (!pluginRegistered) {
    console.log('[AgentSoul] Plugin not registered, running install...');
    await cmdInstall();
  }

  console.log('[AgentSoul] Starting TUI with soul injection via plugin...');
  spawn('opencode', ['.'], { stdio: 'inherit' });
}

async function cmdRun(args) {
  const soulText = await injectSoul();
  const message = args.join(' ') || 'Hello';

  // Save user message before running
  await saveConversation(null, 'user', message);
  console.log('[AgentSoul] Injecting soul...');

  const runProcess = spawn('opencode', ['run', '--dir', process.cwd()], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  runProcess.stdin.write(soulText + '\n\n' + message + '\n');
  runProcess.stdin.end();

  let assistantOutput = '';
  runProcess.stdout.on('data', (data) => {
    const text = data.toString();
    assistantOutput += text;
    process.stdout.write(text);
  });

  return new Promise((resolve) => {
    runProcess.on('close', async () => {
      const trimmed = assistantOutput.trim();
      if (trimmed) {
        await saveConversation(null, 'assistant', trimmed);
      }
      resolve();
    });
  });
}

async function cmdServe(args) {
  const port = args.find((a) => !a.startsWith('-')) || '19876';

  // Pre-check: ensure soul files exist
  const soul = loadSoul();
  if (!soul) {
    console.error('[AgentSoul] No soul files found. Run: agentsoul setup');
    process.exit(1);
  }

  // Pre-check: ensure plugin is registered
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  let pluginRegistered = false;
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const plugins = cfg.plugin || cfg.plugins || [];
      pluginRegistered = plugins.includes('agentsoul');
    } catch {}
  }

  if (!pluginRegistered) {
    console.log('[AgentSoul] Plugin not registered, running install...');
    await cmdInstall();
  }

  console.log(`[AgentSoul] Starting headless server on port ${port}...`);
  console.log('[AgentSoul] Soul will be injected via plugin hooks');

  const serveProcess = spawn('opencode', ['serve', '--port', port], {
    stdio: 'inherit',
  });

  serveProcess.on('exit', (code) => {
    process.exit(code);
  });
}

async function cmdMemory(args) {
  const subCmd = args[0] || 'list';

  try {
    if (subCmd === 'list') {
      const rows = await listMemories(20);
      console.log('\n=== Recent Conversations ===\n');
      for (const row of rows) {
        console.log(`[${row.id}] ${row.time} | ${row.role}: ${row.preview}...`);
      }
    } else if (subCmd === 'search') {
      const query = args[1] || '';
      const rows = await searchMemories(query, 10);
      console.log(`\n=== Search: "${query}" ===\n`);
      for (const row of rows) {
        console.log(`[${row.id}] ${row.time} | ${row.role}:\n${row.content}\n`);
      }
    } else if (subCmd === 'clear') {
      await clearMemories();
      console.log('[AgentSoul] Memory cleared');
    } else {
      console.log('Usage: agentsoul memory [list|search <query>|clear]');
    }
  } catch (e) {
    console.error('[AgentSoul] Memory error:', e.message);
  }
}
