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

function getVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

export async function cli(args) {
  const cmd = args[0] || 'help';

  if (cmd === '-v' || cmd === '--version') {
    console.log(getVersion());
    return;
  }

  switch (cmd) {
    case 'uninstall':
      await cmdUninstall();
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
    case 'doctor':
      await cmdDoctor();
      break;
    default:
      console.log(`
AgentSoul — Give OpenCode a soul

Usage:
  agentsoul setup            Interactive configuration wizard (auto-registers plugin)
  agentsoul uninstall        Remove plugin from opencode config
  agentsoul chat             Launch opencode TUI with soul injection
  agentsoul run [message]    Single-shot with soul injection
  agentsoul serve            Headless server with soul injection
  agentsoul memory [cmd]     Memory management (list/search/clear)
  agentsoul doctor           Diagnose installation issues
`);
  }
}

const PLUGIN_NAME = '@neomei/agentsoul';

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
  let changed = false;

  if (!config.plugin.includes(PLUGIN_NAME)) {
    config.plugin.push(PLUGIN_NAME);
    changed = true;
    console.log(`[AgentSoul] Registered ${PLUGIN_NAME} in opencode config`);
  }

  // Clean up old unscoped plugin name that causes import failures
  const oldIdx = config.plugin.indexOf('agentsoul');
  if (oldIdx !== -1) {
    config.plugin.splice(oldIdx, 1);
    changed = true;
    console.log('[AgentSoul] Removed old plugin name "agentsoul" from config');
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } else {
    console.log('[AgentSoul] Already registered');
  }

  // Ensure soul directory exists
  const soulDir = ensureSoulDir();
  console.log('[AgentSoul] Soul directory:', soulDir);
  console.log('[AgentSoul] Run "agentsoul setup" to configure your agent\'s personality');
}

async function cmdUninstall() {
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  if (!fs.existsSync(configPath)) {
    console.log('[AgentSoul] No opencode config found');
    return;
  }

  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    console.log('[AgentSoul] Invalid opencode config');
    return;
  }

  const plugins = config.plugin || config.plugins || [];
  const beforeLen = plugins.length;

  const cleaned = plugins.filter(
    (p) => p !== PLUGIN_NAME && p !== 'agentsoul'
  );

  if (config.plugin) config.plugin = cleaned;
  if (config.plugins) config.plugins = cleaned;

  if (cleaned.length < beforeLen) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`[AgentSoul] Removed ${PLUGIN_NAME} from opencode config`);
  } else {
    console.log('[AgentSoul] Plugin not found in config');
  }
}

async function cmdSetup() {
  const soulDir = ensureSoulDir();

  // Auto-register plugin if not already in opencode config
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  let pluginRegistered = false;
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const plugins = cfg.plugin || cfg.plugins || [];
      pluginRegistered = plugins.includes(PLUGIN_NAME);
    } catch {}
  }
  if (!pluginRegistered) {
    console.log('[AgentSoul] Plugin not registered, installing...\n');
    await cmdInstall();
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, def) =>
    new Promise((resolve) => {
      const prompt = def !== undefined && def !== '' ? `${q} [${def}]: ` : `${q}: `;
      rl.question(prompt, (ans) => resolve(ans.trim() || def));
    });

  console.log('\n=== AgentSoul Configuration ===');
  console.log('(Press Enter to keep current value)\n');

  // Read existing files
  const identityPath = path.join(soulDir, 'IDENTITY.md');
  const userPath = path.join(soulDir, 'USER.md');
  const soulPath = path.join(soulDir, 'SOUL.md');

  const identityContent = fs.existsSync(identityPath) ? fs.readFileSync(identityPath, 'utf-8') : '';
  const userContent = fs.existsSync(userPath) ? fs.readFileSync(userPath, 'utf-8') : '';
  const soulContent = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf-8') : '';

  // Parse current values (skip bracket placeholders like [Your Name])
  const parseField = (content, fieldName) => {
    const match = content.match(new RegExp(`- \\*\\*${fieldName}\\*\\*: (.*)`, 'm'));
    if (!match) return '';
    const val = match[1].trim();
    if (val.startsWith('[') && val.endsWith(']')) return '';
    return val;
  };

  const defaults = {
    name: parseField(identityContent, 'Name') || 'Agent',
    age: parseField(identityContent, 'Age') || '22',
    gender: parseField(identityContent, 'Gender') || 'female',
    personality: parseField(identityContent, 'Personality') || 'warm, thoughtful, and independent',
    userName: parseField(userContent, 'Name') || 'User',
    relationship: parseField(userContent, 'Relationship') || 'friend',
  };

  const name = await ask('Agent name', defaults.name);
  const age = await ask('Agent age', defaults.age);
  const gender = await ask('Agent gender', defaults.gender);
  const personality = await ask('Personality in one sentence', defaults.personality);
  const userName = await ask('Your name (how agent addresses you)', defaults.userName);
  const relationship = await ask('Relationship (e.g. colleague, friend, lover)', defaults.relationship);

  rl.close();

  // Helper: replace existing field or append if missing
  const upsertField = (content, fieldName, value) => {
    const regex = new RegExp(`(- \\*\\*${fieldName}\\*\\*: ).*`, 'm');
    if (regex.test(content)) {
      return content.replace(regex, `$1${value}`);
    }
    return content.trimEnd() + `\n- **${fieldName}**: ${value}`;
  };

  // Update IDENTITY.md
  let newIdentity = identityContent.trim() ? identityContent : '# IDENTITY.md\n';
  newIdentity = upsertField(newIdentity, 'Name', name);
  newIdentity = upsertField(newIdentity, 'Age', age);
  newIdentity = upsertField(newIdentity, 'Gender', gender);
  newIdentity = upsertField(newIdentity, 'Personality', personality);
  fs.writeFileSync(identityPath, newIdentity.trim() + '\n');

  // Update USER.md
  let newUser = userContent.trim() ? userContent : '# USER.md\n';
  newUser = upsertField(newUser, 'Name', userName);
  newUser = upsertField(newUser, 'Relationship', relationship);
  newUser = upsertField(newUser, 'How I address them', userName);
  fs.writeFileSync(userPath, newUser.trim() + '\n');

  // Create SOUL.md only if missing; never overwrite existing soul
  if (!soulContent.trim()) {
    fs.writeFileSync(
      soulPath,
      `# SOUL.md

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
`
    );
  }

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
      pluginRegistered = plugins.includes(PLUGIN_NAME);
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
      pluginRegistered = plugins.includes(PLUGIN_NAME);
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

async function cmdDoctor() {
  console.log('\n=== AgentSoul Doctor ===\n');

  // 1. Check npm global path
  const npmPrefix = process.env.npm_config_prefix || '';
  const globalBin = path.join(os.homedir(), '.npm-global', 'bin');
  const pathEnv = process.env.PATH || '';
  const inPath = pathEnv.includes(globalBin) || pathEnv.includes(npmPrefix);

  console.log('PATH contains npm global bin:', inPath ? 'OK' : 'MISSING');
  if (!inPath) {
    console.log('  Fix: npm config set prefix "~/.npm-global"');
    console.log('       echo \'export PATH=~/.npm-global/bin:$PATH\' >> ~/.bashrc');
  }

  // 2. Check if opencode config has plugin
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  let pluginOk = false;
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const plugins = cfg.plugin || cfg.plugins || [];
      pluginOk = plugins.includes(PLUGIN_NAME);
      console.log('Plugin registered in opencode:', pluginOk ? 'OK' : 'MISSING');
    } catch {
      console.log('Plugin registered in opencode: INVALID CONFIG');
    }
  } else {
    console.log('Plugin registered in opencode: NO CONFIG');
  }

  // 3. Check soul files
  const soulDir = path.join(os.homedir(), '.agentsoul', 'soul');
  const hasIdentity = fs.existsSync(path.join(soulDir, 'IDENTITY.md'));
  const hasSoul = fs.existsSync(path.join(soulDir, 'SOUL.md'));
  const hasUser = fs.existsSync(path.join(soulDir, 'USER.md'));
  console.log('Soul files:', hasIdentity && hasSoul && hasUser ? 'OK' : 'INCOMPLETE');

  // 4. Check memory db
  const hasDb = fs.existsSync(path.join(os.homedir(), '.agentsoul', 'memory.db'));
  console.log('Memory database:', hasDb ? 'OK' : 'NOT FOUND');

  console.log('\nTip: Use "npx @neomei/agentsoul <command>" if global install fails\n');
}
