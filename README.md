# AgentSoul

Give OpenCode a soul — personality injection and long-term memory for your AI agent.

## Installation

```bash
npm install -g @neomei/agentsoul
```

## Quick Start

```bash
# 1. Configure your agent's personality (auto-registers plugin)
agentsoul setup

# 2. Launch OpenCode with soul injection
agentsoul chat
```

## Commands

| Command | Description |
|---------|-------------|
| `agentsoul setup` | Interactive configuration wizard (auto-registers plugin) |
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
   - Hooks into `experimental.chat.system.transform` to inject soul before every LLM call
   - Hooks into `chat.message` to persist user messages
   - Survives context compaction automatically

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
