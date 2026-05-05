# AgentSoul

Give OpenCode a soul — personality injection and long-term memory for your AI agent.

## Installation

```bash
npm install -g agentsoul
```

## Quick Start

```bash
# 1. Register AgentSoul as an OpenCode plugin
agentsoul install

# 2. Configure your agent's personality
agentsoul setup

# 3. Launch OpenCode with soul injection
agentsoul chat
```

## Commands

| Command | Description |
|---------|-------------|
| `agentsoul install` | Register plugin in `~/.config/opencode/opencode.json` |
| `agentsoul init` | Create soul template files in `~/.agentsoul/soul/` |
| `agentsoul setup` | Interactive configuration wizard |
| `agentsoul chat` | Launch OpenCode TUI with soul injection |
| `agentsoul run <message>` | Single-shot with soul injection |
| `agentsoul serve [port]` | Headless server with soul injection |
| `agentsoul memory list` | Show recent conversations |
| `agentsoul memory search <query>` | Search conversation history |
| `agentsoul memory clear` | Clear all memories |

## How It Works

AgentSoul injects personality files into every OpenCode session:

1. **Soul Files** (`~/.agentsoul/soul/`)
   - `IDENTITY.md` — Who your agent is
   - `SOUL.md` — Core principles and speaking style
   - `USER.md` — Who you are and your relationship

2. **Memory** (`~/.agentsoul/memory.db`)
   - SQLite storage for conversation history
   - Recent memories are automatically injected into new sessions

3. **OpenCode Plugin** — Registered in `~/.config/opencode/opencode.json`
   - Hooks into `tool.execute.before` to inject soul on session creation
   - Hooks into `session.error` to re-inject after context compaction

## Configuration

After `agentsoul setup`, edit the files directly:

```bash
~/.agentsoul/soul/IDENTITY.md   # Name, age, personality
~/.agentsoul/soul/SOUL.md       # Core principles, speaking style
~/.agentsoul/soul/USER.md       # User relationship
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   agentsoul     │────▶│   soul/*.md     │────▶│  stdin inject   │
│   CLI / Plugin  │     │  (personality)  │     │  (opencode run) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                               │
         ▼                                               ▼
┌─────────────────┐                            ┌─────────────────┐
│  memory.db      │◀───────────────────────────│  opencode TUI   │
│  (SQLite)       │      save conversations    │  / serve        │
└─────────────────┘                            └─────────────────┘
```

## License

MIT
