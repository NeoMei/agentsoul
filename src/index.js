// AgentSoul — OpenCode Plugin Entry Point
// OpenCode loads this via: import agentsoul from 'agentsoul'

import { loadSoul } from './soul.js';
import { saveConversation } from './memory.js';

// Unique marker to detect if soul has already been injected
const SOUL_MARKER = '=== IDENTITY.md ===';

export default function AgentSoulPlugin(ctx) {
  return {
    // Inject soul into system prompt on every LLM call.
    // This hook fires before each model request, so soul survives context compaction.
    'experimental.chat.system.transform': async (input, output) => {
      const soulText = loadSoul();
      if (!soulText || !output?.system) return;

      const alreadyInjected = output.system.some(
        (s) => typeof s === 'string' && s.includes(SOUL_MARKER)
      );

      if (!alreadyInjected) {
        output.system.push(soulText);
      }
    },

    // Save user messages when they are created
    'chat.message': async (input, output) => {
      if (output?.parts) {
        const textParts = output.parts
          .filter((p) => p.type === 'text' && !p.synthetic)
          .map((p) => p.text || '')
          .join('\n');
        if (textParts.trim()) {
          await saveConversation(input.sessionID, 'user', textParts.trim());
        }
      }
    },

    // On session error, soul will be re-injected automatically on next LLM call
    'session.error': async () => {},
  };
}
