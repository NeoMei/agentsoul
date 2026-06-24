// AgentSoul — OpenCode Plugin Entry Point
// OpenCode loads this via: import agentsoul from 'agentsoul'

import { loadSoul } from './soul.js';
import { saveConversation } from './memory.js';

// Unique marker to detect if soul has already been injected
const SOUL_MARKER = '=== IDENTITY.md ===';

// Shared soul injection logic — used by multiple hooks for redundancy
function injectSoul(output) {
  const soulText = loadSoul();
  if (!soulText || !output?.system) return false;

  if (!Array.isArray(output.system)) {
    output.system = [soulText];
    return true;
  }

  const alreadyInjected = output.system.some(
    (s) => typeof s === 'string' && s.includes(SOUL_MARKER)
  );

  if (!alreadyInjected) {
    output.system.push(soulText);
    return true;
  }
  return false;
}

export default function AgentSoulPlugin(ctx) {
  return {
    // Hook 1: session.created — inject soul at session start (most reliable)
    'session.created': async (input, output) => {
      try {
        if (!output?.system) return;
        injectSoul(output);
      } catch {}
    },

    // Hook 2: session.compacted — re-inject after context compaction
    'session.compacted': async (input, output) => {
      try {
        if (!output?.system) return;
        injectSoul(output);
      } catch {}
    },

    // Hook 3: experimental.chat.system.transform — fires before every LLM call
    'experimental.chat.system.transform': async (input, output) => {
      try {
        injectSoul(output);
      } catch {}
    },

    // Hook 4: session.idle — re-inject for headless mode
    'session.idle': async (input, output) => {
      try {
        if (!output?.system) return;
        injectSoul(output);
      } catch {}
    },

    // Save assistant messages for memory
    'chat.message': async (input, output) => {
      try {
        if (!output?.parts || !Array.isArray(output.parts)) return;

        const textParts = output.parts
          .filter((p) => p && p.type === 'text' && !p.synthetic)
          .map((p) => p.text || '')
          .join('\n');

        if (textParts.trim()) {
          await saveConversation(input.sessionID, 'assistant', textParts.trim());
        }
      } catch {}
    },

    'session.error': async () => {},
  };
}
